/**
 * Daily Recommendation Cron Job
 * - 9:30 CST daily: Execute match calculation (generate recommendations for all eligible users)
 * - 10:00 CST daily: Push recommendation results
 * - 00:00 CST daily: Reset male users' "interested" count
 * - Push failure retry logic: retry after 30 minutes, max 2 times
 * - Notify users when no candidates available
 */
import cron from 'node-cron';
import prisma from '../lib/prisma.js';
import { generateDailyRecommendations } from '../services/aiMatchService.js';
import { resetDailyCounts } from '../services/rateLimitService.js';
import { emitToUser } from '../websocket/index.js';
import { getTodayCST } from '../lib/timezone.js';

// Max retry count
const MAX_RETRY_COUNT = 2;

// Retry interval (ms): 30 minutes
const RETRY_DELAY_MS = 30 * 60 * 1000;

// Store cron job references for stopping
let cronJobs = [];

// Store retry timer references for cleanup
let retryTimers = [];

/**
 * Get all user IDs with status preference_set
 * @param {object} [deps] - Dependency injection
 * @param {object} [deps.prismaClient] - Prisma client
 * @returns {Promise<string[]>} User ID list
 */
export async function getEligibleUserIds(deps = {}) {
  const db = deps.prismaClient || prisma;
  const users = await db.user.findMany({
    where: { status: 'preference_set' },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/**
 * Execute daily match calculation (9:30 CST)
 * Generate DailyRecommendation for all eligible users
 * @param {object} [deps] - Dependency injection
 * @param {object} [deps.prismaClient] - Prisma client
 * @param {function} [deps.generateRecommendationsFn] - Recommendation generation function
 * @returns {Promise<{ processed: number, generated: number, noCandidates: string[] }>}
 */
export async function runDailyMatchCalculation(deps = {}) {
  const db = deps.prismaClient || prisma;
  const generateFn = deps.generateRecommendationsFn || generateDailyRecommendations;

  const userIds = await getEligibleUserIds({ prismaClient: db });
  let generated = 0;
  const noCandidates = [];

  for (const userId of userIds) {
    try {
      const result = await generateFn(userId, {
        prismaClient: db,
        chatCompletionFn: deps.chatCompletionFn,
        chatCompletionDeps: deps.chatCompletionDeps,
      });

      if (result === null) {
        // No candidates
        noCandidates.push(userId);
        // Create a failed status DailyRecommendation record (only if not already exists)
        const today = getTodayCST();
        const existing = await db.dailyRecommendation.findFirst({
          where: { userId, recommendationDate: today },
        });
        if (!existing) {
          await db.dailyRecommendation.create({
            data: {
              userId,
              recommendationDate: today,
              matchIds: [],
              status: 'failed',
            },
          });
        } else if (existing.status === 'pending' && existing.matchIds.length === 0) {
          await db.dailyRecommendation.update({
            where: { id: existing.id },
            data: { status: 'failed' },
          });
        }
      } else {
        generated++;
      }
    } catch (error) {
      console.error(`[Cron] Failed to generate recommendations for user ${userId}:`, error.message);
    }
  }

  console.log(
    `[Cron] Daily match calculation complete: processed ${userIds.length} users, generated ${generated} recommendations, ${noCandidates.length} users with no candidates`
  );

  return { processed: userIds.length, generated, noCandidates };
}

/**
 * Push recommendation result for a single user
 * @param {object} recommendation - DailyRecommendation record
 * @param {object} [deps] - Dependency injection
 * @param {object} [deps.prismaClient] - Prisma client
 * @param {function} [deps.emitFn] - WebSocket push function
 * @returns {Promise<boolean>} Whether push was successful
 */
export async function pushRecommendation(recommendation, deps = {}) {
  const db = deps.prismaClient || prisma;
  const emitFn = deps.emitFn || emitToUser;

  try {
    // Update status to pushed
    await db.dailyRecommendation.update({
      where: { id: recommendation.id },
      data: {
        status: 'pushed',
        pushedAt: new Date(),
      },
    });

    // Push notification via WebSocket (if emitFn available)
    if (emitFn) {
      emitFn(recommendation.userId, 'recommendation:new', {
        matchIds: recommendation.matchIds,
        date: recommendation.recommendationDate,
      });
    }

    return true;
  } catch (error) {
    console.error(
      `[Cron] Failed to push recommendation (user: ${recommendation.userId}):`,
      error.message
    );
    return false;
  }
}

/**
 * Handle push failure retry logic
 * @param {object} recommendation - DailyRecommendation record
 * @param {object} [deps] - Dependency injection
 * @param {object} [deps.prismaClient] - Prisma client
 * @param {function} [deps.emitFn] - WebSocket push function
 * @param {number} [deps.retryDelay] - Retry delay (ms)
 */
export function scheduleRetry(recommendation, deps = {}) {
  const retryDelay = deps.retryDelay !== undefined ? deps.retryDelay : RETRY_DELAY_MS;
  const db = deps.prismaClient || prisma;

  const timer = setTimeout(async () => {
    try {
      // Re-fetch latest recommendation status
      const latest = await db.dailyRecommendation.findUnique({
        where: { id: recommendation.id },
      });

      if (!latest || latest.status === 'pushed') {
        return; // Already pushed successfully, no retry needed
      }

      if (latest.retryCount >= MAX_RETRY_COUNT) {
        // Max retries reached, mark as failed
        await db.dailyRecommendation.update({
          where: { id: recommendation.id },
          data: { status: 'failed' },
        });
        console.error(
          `[Cron] Push retry limit reached (user: ${recommendation.userId}), marked as failed`
        );
        return;
      }

      // Increment retry count
      await db.dailyRecommendation.update({
        where: { id: recommendation.id },
        data: { retryCount: { increment: 1 } },
      });

      // Attempt to re-push
      const success = await pushRecommendation(
        { ...recommendation, retryCount: latest.retryCount + 1 },
        deps
      );

      if (!success && latest.retryCount + 1 < MAX_RETRY_COUNT) {
        // Still failed and not at limit, schedule another retry
        scheduleRetry(recommendation, deps);
      } else if (!success) {
        // Max retries reached, mark as failed
        await db.dailyRecommendation.update({
          where: { id: recommendation.id },
          data: { status: 'failed' },
        });
        console.error(
          `[Cron] Push retry limit reached (user: ${recommendation.userId}), marked as failed`
        );
      }
    } catch (error) {
      console.error(`[Cron] Retry push error (user: ${recommendation.userId}):`, error.message);
    }
  }, retryDelay);

  retryTimers.push(timer);
}

/**
 * Notify user that no recommendations are available today (when no candidates)
 * @param {string} userId - User ID
 * @param {object} [deps] - Dependency injection
 * @param {function} [deps.emitFn] - WebSocket push function
 */
export function notifyNoCandidates(userId, deps = {}) {
  const emitFn = deps.emitFn || emitToUser;

  if (emitFn) {
    emitFn(userId, 'recommendation:new', {
      matchIds: [],
      message: 'No recommendations today. Consider adjusting your preferences for more matches.',
    });
  }

  console.log(`[Cron] Notified user ${userId}: no recommendations today`);
}

/**
 * Execute daily push (10:00 CST)
 * Push all pending DailyRecommendations
 * @param {object} [deps] - Dependency injection
 * @param {object} [deps.prismaClient] - Prisma client
 * @param {function} [deps.emitFn] - WebSocket push function
 * @param {number} [deps.retryDelay] - Retry delay (ms)
 * @returns {Promise<{ pushed: number, failed: number, noCandidatesNotified: number }>}
 */
export async function runDailyPush(deps = {}) {
  const db = deps.prismaClient || prisma;

  // Get all pending recommendations for today
  const today = getTodayCST();

  const pendingRecommendations = await db.dailyRecommendation.findMany({
    where: {
      status: 'pending',
      recommendationDate: today,
    },
  });

  // Get all failed (no candidates) recommendations for today
  const failedRecommendations = await db.dailyRecommendation.findMany({
    where: {
      status: 'failed',
      recommendationDate: today,
      matchIds: { equals: [] },
    },
  });

  let pushed = 0;
  let failed = 0;

  for (const rec of pendingRecommendations) {
    const success = await pushRecommendation(rec, deps);
    if (success) {
      pushed++;
    } else {
      failed++;
      // Schedule retry
      scheduleRetry(rec, deps);
    }
  }

  // Notify users with no candidates
  let noCandidatesNotified = 0;
  for (const rec of failedRecommendations) {
    notifyNoCandidates(rec.userId, deps);
    noCandidatesNotified++;
  }

  console.log(
    `[Cron] Daily push complete: ${pushed} succeeded, ${failed} failed, ${noCandidatesNotified} no-candidate notifications`
  );

  return { pushed, failed, noCandidatesNotified };
}

/**
 * Execute daily count reset (00:00 CST)
 * @param {object} [deps] - Dependency injection
 * @param {object} [deps.prismaClient] - Prisma client
 * @returns {Promise<{ deletedCount: number }>}
 */
export async function runDailyReset(deps = {}) {
  const result = await resetDailyCounts(deps);
  console.log(`[Cron] Daily count reset complete: deleted ${result.deletedCount} records`);
  return result;
}

/**
 * Start all cron jobs
 * TZ environment variable should be set to Asia/Shanghai
 * @param {object} [deps] - Dependency injection (for testing)
 * @param {object} [deps.prismaClient] - Prisma client
 * @param {function} [deps.emitFn] - WebSocket push function
 * @param {function} [deps.chatCompletionFn] - AI chat completion function
 * @param {object} [deps.chatCompletionDeps] - chatCompletion dependencies
 * @param {number} [deps.retryDelay] - Retry delay (ms)
 */
export function startCronJobs(deps = {}) {
  // 9:30 CST daily - Execute match calculation
  const matchJob = cron.schedule('30 9 * * *', async () => {
    console.log('[Cron] Starting daily match calculation...');
    try {
      await runDailyMatchCalculation(deps);
    } catch (error) {
      console.error('[Cron] Daily match calculation error:', error.message);
    }
  });

  // 10:00 CST daily - Push recommendation results
  const pushJob = cron.schedule('0 10 * * *', async () => {
    console.log('[Cron] Starting daily push...');
    try {
      await runDailyPush(deps);
    } catch (error) {
      console.error('[Cron] Daily push error:', error.message);
    }
  });

  // 00:00 CST daily - Reset "interested" count
  const resetJob = cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Starting daily count reset...');
    try {
      await runDailyReset(deps);
    } catch (error) {
      console.error('[Cron] Daily count reset error:', error.message);
    }
  });

  cronJobs = [matchJob, pushJob, resetJob];
  console.log('[Cron] Cron jobs started: 9:30 match calculation, 10:00 push, 00:00 count reset');
}

/**
 * Stop all cron jobs and clean up retry timers
 */
export function stopCronJobs() {
  for (const job of cronJobs) {
    job.stop();
  }
  cronJobs = [];

  for (const timer of retryTimers) {
    clearTimeout(timer);
  }
  retryTimers = [];

  console.log('[Cron] All cron jobs stopped');
}
