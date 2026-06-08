/**
 * Cron Jobs Entry Point
 * Centralized management of all cron job start and stop
 */
import { startCronJobs, stopCronJobs } from './dailyRecommendation.js';
import { startMatchExpiryCron, stopMatchExpiryCron } from './matchExpiry.js';
import { startCleanupCron, stopCleanupCron } from './cleanup.js';

/**
 * Start all cron jobs
 * @param {object} [deps] - Dependency injection (for testing)
 */
export function startAllCronJobs(deps = {}) {
  startCronJobs(deps);
  startMatchExpiryCron(deps);
  startCleanupCron(deps);
  console.log('[Cron] All cron jobs started');
}

/**
 * Stop all cron jobs
 */
export function stopAllCronJobs() {
  stopCronJobs();
  stopMatchExpiryCron();
  stopCleanupCron();
  console.log('[Cron] All cron jobs stopped');
}
