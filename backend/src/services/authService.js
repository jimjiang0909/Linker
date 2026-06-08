/**
 * Auth Service - Verification code sending and management
 * Handles code generation, storage, rate limiting, and email sending
 */
import { Resend } from 'resend';
import prisma from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * Generate 6-digit verification code (100000-999999)
 * @returns {string} 6-digit verification code
 */
export function generateVerificationCode() {
  const code = Math.floor(100000 + Math.random() * 900000);
  return code.toString();
}

/**
 * Send verification code to specified email
 * Includes rate limiting (max 5 times in 10 minutes) and idempotency (no resend within 60 seconds)
 *
 * @param {string} email - Target email address
 * @param {object} [deps] - Injectable dependencies (for testing)
 * @param {object} [deps.prismaClient] - Prisma client instance
 * @param {object} [deps.resendClient] - Resend email client instance
 * @returns {Promise<{message: string, expiresAt: Date}>} Send result
 */
export async function sendVerificationCode(email, deps = {}) {
  const db = deps.prismaClient || prisma;
  const emailClient = deps.resendClient || resend;

  const now = new Date();

  // 1. Rate limit check: max 5 requests per email in 10 minutes
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
  const recentCount = await db.verificationCode.count({
    where: {
      email,
      createdAt: { gte: tenMinutesAgo },
    },
  });

  if (recentCount >= 5) {
    throw new AppError(429, 'RATE_LIMIT_EXCEEDED', 'Too many requests. Please try again in 10 minutes.');
  }

  // 2. Idempotency check: no resend within 60 seconds
  const sixtySecondsAgo = new Date(now.getTime() - 60 * 1000);
  const recentCode = await db.verificationCode.findFirst({
    where: {
      email,
      createdAt: { gte: sixtySecondsAgo },
      isUsed: false,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (recentCode) {
    return {
      message: 'Verification code already sent. Please check your email.',
      expiresAt: recentCode.expiresAt,
    };
  }

  // 3. Generate 6-digit verification code
  const code = generateVerificationCode();

  // 4. Store verification code in database (5 min validity)
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);
  await db.verificationCode.create({
    data: {
      email,
      code,
      expiresAt,
    },
  });

  // 5. Send verification code email via Resend
  const emailFrom = process.env.EMAIL_FROM || 'Linker <noreply@yourdomain.com>';
  const { error } = await emailClient.emails.send({
    from: emailFrom,
    to: email,
    subject: 'Your Linker Verification Code',
    html: `<p>Your verification code is: <strong>${code}</strong>. Valid for 5 minutes.</p>`,
  });

  if (error) {
    // In development, ignore email send failure since code is already in DB
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEV] Verification code: ${code} (email send failed, but continuing in dev mode)`);
    } else {
      throw new AppError(500, 'EMAIL_SEND_FAILED', 'Failed to send verification code. Please try again in 60 seconds.');
    }
  }

  return {
    message: 'Verification code sent',
    expiresAt,
  };
}
