/**
 * Rate Limit Service
 * Handles daily "interested" operation limit for male users
 * - Male users: max 3 per day (CST 00:00-23:59)
 * - Female users: no limit
 * - Daily reset at CST 00:00
 */
import prisma from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { getTodayCST, getNextResetTimeCST } from '../lib/timezone.js';

// Daily "interested" limit (male users)
const DAILY_INTEREST_LIMIT = 3;

/**
 * Check if user can perform "interested" operation
 * @param {string} userId - User ID
 * @param {object} [deps] - Dependency injection (for testing)
 * @param {object} [deps.prismaClient] - Prisma client instance
 * @returns {Promise<{ allowed: boolean, remaining?: number, message?: string, nextResetAt?: Date }>}
 */
export async function checkRateLimit(userId, deps = {}) {
  const db = deps.prismaClient || prisma;

  // 1. Get user Profile to determine gender
  const profile = await db.profile.findUnique({
    where: { userId },
    select: { gender: true },
  });

  if (!profile) {
    throw new AppError(400, 'PROFILE_NOT_FOUND', 'Profile not found. Please complete your profile first.');
  }

  // 2. Female users have no limit
  if (profile.gender === 'female') {
    return { allowed: true, remaining: Infinity };
  }

  // 3. Non-male (other) also has no limit (only male is limited)
  if (profile.gender !== 'male') {
    return { allowed: true, remaining: Infinity };
  }

  // 4. Male users: check today's count
  const today = getTodayCST();
  const rateLimit = await db.rateLimit.findUnique({
    where: {
      userId_date: {
        userId,
        date: today,
      },
    },
  });

  const currentCount = rateLimit ? rateLimit.interestedCount : 0;
  const remaining = DAILY_INTEREST_LIMIT - currentCount;

  if (remaining <= 0) {
    const nextResetAt = getNextResetTimeCST();
    return {
      allowed: false,
      remaining: 0,
      message: `Today's "interested" limit reached (${DAILY_INTEREST_LIMIT} times). Resets at CST 00:00.`,
      nextResetAt,
    };
  }

  return { allowed: true, remaining };
}

/**
 * Increment user's today "interested" count
 * @param {string} userId - User ID
 * @param {object} [deps] - Dependency injection (for testing)
 * @param {object} [deps.prismaClient] - Prisma client instance
 * @returns {Promise<{ count: number, remaining: number }>}
 */
export async function incrementInterestCount(userId, deps = {}) {
  const db = deps.prismaClient || prisma;
  const today = getTodayCST();

  // Use upsert for atomicity: increment if exists, create if not
  const rateLimit = await db.rateLimit.upsert({
    where: {
      userId_date: {
        userId,
        date: today,
      },
    },
    update: {
      interestedCount: { increment: 1 },
    },
    create: {
      userId,
      date: today,
      interestedCount: 1,
    },
  });

  return {
    count: rateLimit.interestedCount,
    remaining: Math.max(0, DAILY_INTEREST_LIMIT - rateLimit.interestedCount),
  };
}

/**
 * Reset all users' daily counts
 * Called by cron job at CST 00:00 daily
 * @param {object} [deps] - Dependency injection (for testing)
 * @param {object} [deps.prismaClient] - Prisma client instance
 * @returns {Promise<{ deletedCount: number }>}
 */
export async function resetDailyCounts(deps = {}) {
  const db = deps.prismaClient || prisma;

  // Delete all historical records (records before today)
  const today = getTodayCST();
  const result = await db.rateLimit.deleteMany({
    where: {
      date: {
        lt: today,
      },
    },
  });

  return { deletedCount: result.count };
}

/**
 * Get user's remaining "interested" count for today
 * @param {string} userId - User ID
 * @param {object} [deps] - Dependency injection (for testing)
 * @param {object} [deps.prismaClient] - Prisma client instance
 * @returns {Promise<{ remaining: number, limit: number, used: number }>}
 */
export async function getRemainingInterests(userId, deps = {}) {
  const db = deps.prismaClient || prisma;

  // 1. Get user gender
  const profile = await db.profile.findUnique({
    where: { userId },
    select: { gender: true },
  });

  if (!profile) {
    throw new AppError(400, 'PROFILE_NOT_FOUND', 'Profile not found. Please complete your profile first.');
  }

  // 2. Female users have no limit
  if (profile.gender !== 'male') {
    return { remaining: Infinity, limit: Infinity, used: 0 };
  }

  // 3. Male users: query today's count
  const today = getTodayCST();
  const rateLimit = await db.rateLimit.findUnique({
    where: {
      userId_date: {
        userId,
        date: today,
      },
    },
  });

  const used = rateLimit ? rateLimit.interestedCount : 0;

  return {
    remaining: Math.max(0, DAILY_INTEREST_LIMIT - used),
    limit: DAILY_INTEREST_LIMIT,
    used,
  };
}
