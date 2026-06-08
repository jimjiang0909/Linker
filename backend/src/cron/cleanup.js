/**
 * Cleanup Cron Job
 * - Cleans up expired/used verification codes (older than 24 hours)
 * - Cleans up old offline messages (older than 7 days, safety net)
 * - Runs daily at 03:00 CST
 */
import cron from 'node-cron';
import prisma from '../lib/prisma.js';

let cronJob = null;

/**
 * Clean up expired verification codes
 * Deletes codes that are either used or expired and older than 24 hours
 * @param {object} [deps] - Dependency injection
 * @param {object} [deps.prismaClient] - Prisma client
 * @returns {Promise<{ deletedCount: number }>}
 */
export async function cleanupVerificationCodes(deps = {}) {
  const db = deps.prismaClient || prisma;
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const result = await db.verificationCode.deleteMany({
    where: {
      OR: [
        { isUsed: true, createdAt: { lt: twentyFourHoursAgo } },
        { expiresAt: { lt: twentyFourHoursAgo } },
      ],
    },
  });

  return { deletedCount: result.count };
}

/**
 * Clean up old offline messages (safety net - should already be delivered)
 * Deletes messages older than 7 days
 * @param {object} [deps] - Dependency injection
 * @param {object} [deps.prismaClient] - Prisma client
 * @returns {Promise<{ deletedCount: number }>}
 */
export async function cleanupOldOfflineMessages(deps = {}) {
  const db = deps.prismaClient || prisma;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const result = await db.offlineMessage.deleteMany({
    where: {
      createdAt: { lt: sevenDaysAgo },
    },
  });

  return { deletedCount: result.count };
}

/**
 * Run all cleanup tasks
 * @param {object} [deps] - Dependency injection
 * @returns {Promise<object>}
 */
export async function runCleanup(deps = {}) {
  try {
    const [codesResult, offlineResult] = await Promise.all([
      cleanupVerificationCodes(deps),
      cleanupOldOfflineMessages(deps),
    ]);

    if (codesResult.deletedCount > 0 || offlineResult.deletedCount > 0) {
      console.log(
        `[Cron] Cleanup complete: ${codesResult.deletedCount} verification codes, ${offlineResult.deletedCount} offline messages deleted`
      );
    }

    return {
      verificationCodes: codesResult.deletedCount,
      offlineMessages: offlineResult.deletedCount,
    };
  } catch (error) {
    console.error('[Cron] Cleanup error:', error.message);
    throw error;
  }
}

/**
 * Start cleanup cron job
 * Runs daily at 03:00
 * @param {object} [deps] - Dependency injection
 */
export function startCleanupCron(deps = {}) {
  cronJob = cron.schedule('0 3 * * *', async () => {
    console.log('[Cron] Starting cleanup...');
    try {
      await runCleanup(deps);
    } catch {
      // Error already logged in runCleanup
    }
  });

  console.log('[Cron] Cleanup cron job started: runs daily at 03:00');
}

/**
 * Stop cleanup cron job
 */
export function stopCleanupCron() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }
}
