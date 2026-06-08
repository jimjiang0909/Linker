/**
 * Auth Routes - Registration/Login
 * POST /api/auth/send-code - Send verification code
 * POST /api/auth/register - Register (with transaction for race condition protection)
 * POST /api/auth/login - Login (with lockout protection)
 */
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { sendVerificationCode } from '../services/authService.js';
import { AppError } from '../middlewares/errorHandler.js';
import { authenticate } from '../middlewares/auth.js';
import { generateUniqueCodeInTx } from '../services/inviteService.js';

const router = Router();

/**
 * Email format validation
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_REGEX.test(email);
}

/**
 * Lockout constants
 */
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Check if email is locked out due to too many failed verification attempts
 * @param {string} email - Email address
 * @param {object} db - Prisma client
 * @returns {Promise<{locked: boolean, lockedUntil?: Date}>}
 */
async function checkLockout(email, db) {
  // Find the most recent verification code with >= MAX_FAILED_ATTEMPTS
  const lockedCode = await db.verificationCode.findFirst({
    where: {
      email,
      attempts: { gte: MAX_FAILED_ATTEMPTS },
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (!lockedCode) {
    return { locked: false };
  }

  // Lockout is based on when the last failed attempt happened (updatedAt)
  const lockExpiry = new Date(lockedCode.updatedAt.getTime() + LOCKOUT_DURATION_MS);
  if (new Date() < lockExpiry) {
    return { locked: true, lockedUntil: lockExpiry };
  }

  return { locked: false };
}

/**
 * Validate verification code for a given email
 * Shared logic between register and login
 * @param {string} email - Email address
 * @param {string} code - Verification code
 * @param {object} db - Prisma client (can be transaction)
 * @returns {Promise<object>} The verification code record
 */
async function validateVerificationCode(email, code, db) {
  // Check lockout
  const lockout = await checkLockout(email, db);
  if (lockout.locked) {
    throw new AppError(
      429,
      'ACCOUNT_LOCKED',
      'Too many failed attempts. Please try again in 30 minutes.',
      { lockedUntil: lockout.lockedUntil }
    );
  }

  // Find latest unused verification code
  const verificationCode = await db.verificationCode.findFirst({
    where: {
      email,
      isUsed: false,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!verificationCode) {
    throw new AppError(400, 'INVALID_CODE', 'Invalid or expired verification code');
  }

  // Check expiry
  if (new Date() > verificationCode.expiresAt) {
    throw new AppError(400, 'CODE_EXPIRED', 'Verification code expired. Please request a new one.');
  }

  // Check code match
  if (verificationCode.code !== code) {
    // Increment error count
    const newAttempts = verificationCode.attempts + 1;
    await db.verificationCode.update({
      where: { id: verificationCode.id },
      data: { attempts: newAttempts },
    });

    if (newAttempts >= MAX_FAILED_ATTEMPTS) {
      throw new AppError(
        429,
        'ACCOUNT_LOCKED',
        'Too many failed attempts. Please try again in 30 minutes.'
      );
    }

    throw new AppError(400, 'INVALID_CODE', 'Invalid verification code');
  }

  return verificationCode;
}

/**
 * POST /api/auth/send-code
 * Send verification code to specified email
 */
router.post('/send-code', async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email || !isValidEmail(email)) {
      throw new AppError(400, 'INVALID_EMAIL_FORMAT', 'Invalid email format', { email });
    }

    const result = await sendVerificationCode(email);

    res.status(200).json({
      code: 'SUCCESS',
      message: result.message,
      data: {
        expiresAt: result.expiresAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/register
 * Register new user - wrapped in transaction to prevent race conditions
 * Required: email, code (verification code), invitationCode (invite code)
 */
router.post('/register', async (req, res, next) => {
  try {
    const { email, code, invitationCode } = req.body;

    // 1. Input validation
    if (!email || !isValidEmail(email)) {
      throw new AppError(400, 'INVALID_EMAIL_FORMAT', 'Invalid email format', { email });
    }
    if (!code) {
      throw new AppError(400, 'MISSING_CODE', 'Verification code is required');
    }

    // 2. Input validation for invitation code format (optional, quick fail if provided)
    if (invitationCode && !/^[A-Za-z0-9]{8}$/.test(invitationCode)) {
      throw new AppError(400, 'INVITATION_INVALID_FORMAT', 'Invalid invitation code format. Must be 8 alphanumeric characters.');
    }

    // 3. Execute registration in a transaction to prevent race conditions
    const result = await prisma.$transaction(async (tx) => {
      // 3a. Email uniqueness check (within transaction for consistency)
      const existingUser = await tx.user.findUnique({
        where: { email },
      });
      if (existingUser) {
        throw new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'Email already registered');
      }

      // 3b. Validate verification code (with lockout check)
      const verificationCode = await validateVerificationCode(email, code, tx);

      // 3c. Mark code as used
      await tx.verificationCode.update({
        where: { id: verificationCode.id },
        data: { isUsed: true },
      });

      // 3d. Create user
      const user = await tx.user.create({
        data: { email },
      });

      // 3e. If invitation code provided, validate and consume it
      if (invitationCode) {
        const inviteCode = await tx.invitationCode.findUnique({
          where: { code: invitationCode },
        });

        if (!inviteCode) {
          throw new AppError(400, 'INVITATION_NOT_FOUND', 'Invalid invite code');
        }
        if (inviteCode.usedById) {
          throw new AppError(400, 'INVITATION_ALREADY_USED', 'This invite code has already been used. Please request a new one.');
        }
        if (new Date() > inviteCode.expiresAt) {
          throw new AppError(400, 'INVITATION_EXPIRED', 'Invite code expired. Please ask your friend for a new invitation code.');
        }

        // Consume invite code
        await tx.invitationCode.update({
          where: { code: invitationCode },
          data: {
            usedById: user.id,
            usedAt: new Date(),
          },
        });

        // Record invitation relationship
        await tx.user.update({
          where: { id: user.id },
          data: { invitedBy: inviteCode.ownerId },
        });
      }

      // 3f. Generate 3 invite codes for new user
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      for (let i = 0; i < 3; i++) {
        const newCode = await generateUniqueCodeInTx(tx);
        await tx.invitationCode.create({
          data: {
            code: newCode,
            ownerId: user.id,
            source: 'user',
            expiresAt,
          },
        });
      }

      return user;
    });

    // 4. Generate JWT Token + Refresh Token (outside transaction)
    const token = jwt.sign(
      { userId: result.id, email: result.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const refreshToken = jwt.sign(
      { userId: result.id, type: 'refresh' },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
    );

    res.status(201).json({
      code: 'SUCCESS',
      message: 'Registration successful',
      data: {
        token,
        refreshToken,
        user: {
          id: result.id,
          email: result.email,
          status: result.status,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 * Login existing user with email + verification code
 * Includes lockout protection (5 failed attempts = 30 min lock)
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, code } = req.body;

    // 1. Input validation
    if (!email || !isValidEmail(email)) {
      throw new AppError(400, 'INVALID_EMAIL_FORMAT', 'Invalid email format');
    }
    if (!code) {
      throw new AppError(400, 'MISSING_CODE', 'Verification code is required');
    }

    // 2. Check user exists
    const user = await prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'No account found with this email. Please sign up first.');
    }

    // 3. Validate verification code and mark as used (in transaction)
    await prisma.$transaction(async (tx) => {
      const verificationCode = await validateVerificationCode(email, code, tx);
      await tx.verificationCode.update({
        where: { id: verificationCode.id },
        data: { isUsed: true },
      });
    });

    // 4. Generate JWT Token + Refresh Token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
    );

    res.status(200).json({
      code: 'SUCCESS',
      message: 'Login successful',
      data: {
        token,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          status: user.status,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 * Get current authenticated user's basic info and status
 * Requires authentication
 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, email: true, status: true },
    });

    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }

    res.json({
      code: 'SUCCESS',
      data: { user },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 *
 * KNOWN LIMITATION: Refresh tokens are stateless (JWT-only, not stored in DB).
 * This means:
 * - Cannot revoke individual refresh tokens (e.g., single-device logout)
 * - Cannot implement "logout all devices" without changing JWT_REFRESH_SECRET
 * - Suspended users are blocked at refresh time (status check), but previously
 *   issued access tokens remain valid until expiry (mitigated by 60s status cache)
 * Future improvement: store refresh tokens in DB for revocation support.
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError(400, 'MISSING_REFRESH_TOKEN', 'Refresh token is required');
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
      );
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new AppError(401, 'REFRESH_TOKEN_EXPIRED', 'Refresh token has expired. Please login again.');
      }
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid refresh token');
    }

    if (decoded.type !== 'refresh') {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid refresh token type');
    }

    // Check user still exists and is not suspended
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      throw new AppError(401, 'USER_NOT_FOUND', 'User not found');
    }

    if (user.status === 'suspended') {
      throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Your account has been suspended');
    }

    // Generate new access token
    const newToken = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Generate new refresh token (rotation)
    const newRefreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
    );

    res.status(200).json({
      code: 'SUCCESS',
      message: 'Token refreshed successfully',
      data: {
        token: newToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
