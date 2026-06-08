/**
 * Match Expiry Cron Job
 * - Checks for expired Matches every hour (72-hour response window)
 * - Marks expired Matches as expired, releases recommendation slots
 */
import cron from 'node-cron';
import { processExpiredMatches } from '../services/consentService.js';
import { emitToUser } from '../websocket/index.js';
import prisma from '../lib/prisma.js';

// Store cron job reference for stopping
let cronJob = null;

/**
 * Execute expired Match check
 * Calls consentService.processExpiredMatches to batch update expired Matches
 * Also notifies affected users via WebSocket
 * @param {object} [deps] - Dependency injection
 * @param {object} [deps.prismaClient] - Prisma client
 * @param {Function} [deps.getNow] - Function to get current time (for testing)
 * @param {Function} [deps.emitFn] - WebSocket emit function
 * @returns {Promise<{ expiredCount: number }>}
 */
export async function runMatchExpiryCheck(deps = {}) {
  try {
    const db = deps.prismaClient || prisma;
    const emitFn = deps.emitFn || emitToUser;
    const getNow = deps.getNow || (() => new Date());
    const now = getNow();

    // Find matches about to expire (before updating) to notify users
    const expiringMatches = await db.match.findMany({
      where: { status: 'pending', expiresAt: { lte: now } },
      select: { id: true, userAId: true, userBId: true },
    });

    const result = await processExpiredMatches(deps);

    // Notify affected users
    for (const match of expiringMatches) {
      emitFn(match.userAId, 'match:expired', { matchId: match.id });
      emitFn(match.userBId, 'match:expired', { matchId: match.id });
    }

    if (result.expiredCount > 0) {
      console.log(`[Cron] Match expiry check complete: ${result.expiredCount} matches marked as expired`);
    }
    return result;
  } catch (error) {
    console.error('[Cron] Match expiry check error:', error.message);
    throw error;
  }
}

/**
 * Start Match expiry check cron job
 * Runs every hour on the hour ('0 * * * *')
 * @param {object} [deps] - Dependency injection (for testing)
 * @param {object} [deps.prismaClient] - Prisma client
 * @param {Function} [deps.getNow] - Function to get current time
 */
export function startMatchExpiryCron(deps = {}) {
  // Run every hour on the hour
  cronJob = cron.schedule('0 * * * *', async () => {
    console.log('[Cron] Starting match expiry check...');
    try {
      await runMatchExpiryCheck(deps);
    } catch {
      // Error already logged in runMatchExpiryCheck
    }
  });

  console.log('[Cron] Match expiry check cron job started: runs every hour');
}

/**
 * Stop Match expiry check cron job
 */
export function stopMatchExpiryCron() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }
  console.log('[Cron] Match expiry check cron job stopped');
}
