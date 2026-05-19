/**
 * Cleanup Job
 * Removes orphaned watch channels (watches for deleted users) weekly
 */

import { schedule, type ScheduledTask } from 'node-cron';
import { logger } from '../utils';

const log = logger;

let task: ScheduledTask | null = null;

/**
 * Start the cleanup cron job
 * Runs weekly on Sunday at 3:00 AM
 */
export function startCleanupJob(): void {
  if (task) {
    log.warn('Cleanup job already running');
    return;
  }

  // Weekly on Sunday at 3:00 AM
  task = schedule('0 3 * * 0', async () => {
    log.info('Cleanup job: starting');
    try {
      const { cleanupOrphanedWatches } = await import('../services/watch-channel.service');
      const result = await cleanupOrphanedWatches();
      log.info('Cleanup job: complete', result);
    } catch (error) {
      log.error('Cleanup job: failed', error);
    }
  });

  log.info('Cleanup job scheduled (weekly Sunday at 3:00 AM)');
}

/**
 * Stop the cleanup cron job
 */
export function stopCleanupJob(): void {
  if (task) {
    task.stop();
    task = null;
    log.info('Cleanup job stopped');
  }
}
