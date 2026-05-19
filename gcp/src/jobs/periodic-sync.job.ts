/**
 * Periodic Sync Job
 * Processes calendars with pending incremental changes every 15 minutes
 * Backup mechanism — webhooks handle most changes in real-time,
 * this catches anything missed
 */

import { schedule, type ScheduledTask } from 'node-cron';
import { logger } from '../utils';

const log = logger;

let task: ScheduledTask | null = null;

/**
 * Start the periodic incremental sync cron job
 * Runs every 15 minutes
 */
export function startPeriodicSyncJob(): void {
  if (task) {
    log.warn('Periodic sync job already running');
    return;
  }

  // Every 15 minutes
  task = schedule('*/15 * * * *', async () => {
    log.info('Periodic sync job: starting');
    try {
      const { processIncrementalChanges } = await import('../services/incremental-sync.service');
      const result = await processIncrementalChanges();
      log.info('Periodic sync job: complete', result);
    } catch (error) {
      log.error('Periodic sync job: failed', error);
    }
  });

  log.info('Periodic sync job scheduled (every 15 minutes)');
}

/**
 * Stop the periodic sync cron job
 */
export function stopPeriodicSyncJob(): void {
  if (task) {
    task.stop();
    task = null;
    log.info('Periodic sync job stopped');
  }
}
