/**
 * Invitation Code Service
 * Handles invitation code generation, validation, and usage
 */
import prisma from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';

// Invitation code character set: uppercase + lowercase letters + digits
const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const CODE_LENGTH = 8;
const CODE_VALIDITY_DAYS = 30;
const CODE_FORMAT_REGEX = /^[A-Za-z0-9]{8}$/;

/**
 * Generate a single random invitation code (8 alphanumeric characters)
 * @returns {string}
 */
function generateRandomCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  return code;
}

/**
 * Generate a unique invitation code (ensure no duplicates in database)
 * @returns {Promise<string>}
 */
async function generateUniqueCode() {
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateRandomCode();
    const existing = await prisma.invitationCode.findUnique({ where: { code } });
    if (!existing) {
      return code;
    }
  }
  throw new AppError(500, 'CODE_GENERATION_FAILED', 'Failed to generate invitation code. Please try again later.');
}

/**
 * Generate a unique invitation code within a transaction context
 * @param {object} tx - Prisma transaction client
 * @returns {Promise<string>}
 */
export async function generateUniqueCodeInTx(tx) {
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateRandomCode();
    const existing = await tx.invitationCode.findUnique({ where: { code } });
    if (!existing) {
      return code;
    }
  }
  throw new AppError(500, 'CODE_GENERATION_FAILED', 'Failed to generate invitation code. Please try again later.');
}

/**
 * Generate invitation codes for a user
 * @param {string} userId - User ID
 * @param {number} count - Number of codes to generate
 * @param {'user' | 'system'} source - Source (user: user-generated, system: system/admin-generated)
 * @returns {Promise<Array>} Generated invitation codes list
 */
export async function generateInvitationCodes(userId, count, source = 'user') {
  // Check existing unused invitation codes count (max 10 available codes)
  const MAX_AVAILABLE_CODES = 10;
  const existingAvailableCount = await prisma.invitationCode.count({
    where: {
      ownerId: userId,
      usedById: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (existingAvailableCount + count > MAX_AVAILABLE_CODES) {
    const canGenerate = MAX_AVAILABLE_CODES - existingAvailableCount;
    if (canGenerate <= 0) {
      throw new AppError(400, 'INVITATION_LIMIT_REACHED', `You already have ${existingAvailableCount} available invitation codes (max ${MAX_AVAILABLE_CODES})`);
    }
    // Only generate up to the limit
    count = canGenerate;
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + CODE_VALIDITY_DAYS);

  const codes = [];
  for (let i = 0; i < count; i++) {
    const code = await generateUniqueCode();
    const invitationCode = await prisma.invitationCode.create({
      data: {
        code,
        ownerId: userId,
        source,
        expiresAt,
      },
    });
    codes.push(invitationCode);
  }

  return codes;
}

/**
 * Validate invitation code
 * @param {string} code - Invitation code
 * @returns {Promise<{ valid: boolean, reason?: string, invitationCode?: object }>}
 */
export async function validateInvitationCode(code) {
  // 1. Validate format
  if (!code || !CODE_FORMAT_REGEX.test(code)) {
    return {
      valid: false,
      reason: 'INVALID_FORMAT',
      message: 'Invalid invitation code format. Must be 8 alphanumeric characters.',
    };
  }

  // 2. Query database
  const invitationCode = await prisma.invitationCode.findUnique({
    where: { code },
  });

  if (!invitationCode) {
    return {
      valid: false,
      reason: 'NOT_FOUND',
      message: 'Invalid invite code',
    };
  }

  // 3. Check if already used
  if (invitationCode.usedById) {
    return {
      valid: false,
      reason: 'ALREADY_USED',
      message: 'Invite code already used',
    };
  }

  // 4. Check if expired
  if (new Date() > invitationCode.expiresAt) {
    return {
      valid: false,
      reason: 'EXPIRED',
      message: 'Invite code expired',
    };
  }

  return {
    valid: true,
    invitationCode,
  };
}

/**
 * Use invitation code
 * @param {string} code - Invitation code
 * @param {string} userId - User ID of the person using the code
 * @returns {Promise<object>} Updated invitation code record
 */
export async function useInvitationCode(code, userId) {
  // Validate invitation code first
  const validation = await validateInvitationCode(code);

  if (!validation.valid) {
    throw new AppError(400, `INVITATION_${validation.reason}`, validation.message);
  }

  // Use transaction to ensure atomicity: mark code as used + record invitation relationship
  const result = await prisma.$transaction(async (tx) => {
    // Mark invitation code as used
    const updatedCode = await tx.invitationCode.update({
      where: { code },
      data: {
        usedById: userId,
        usedAt: new Date(),
      },
    });

    // Record invitation relationship: update invitee's invitedBy field
    await tx.user.update({
      where: { id: userId },
      data: {
        invitedBy: updatedCode.ownerId,
      },
    });

    return updatedCode;
  });

  return result;
}
