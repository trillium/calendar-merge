/**
 * Channel Renewal Job
 * Renews expiring Google Calendar watch channels daily at 2am
 * Watches expire after 7 days; this job renews them 24h before expiry
 */

import { schedule, type ScheduledTask } from 'node-cron';
import { logger } from '../utils';

const log = logger;

let task: ScheduledTask | null = null;

/**
 * Start the channel renewal cron job
 * Runs daily at 2:00 AM local time
 */
export function startChannelRenewalJob(): void {
  if (task) {
    log.warn('Channel renewal job already running');
    return;
  }

  // Daily at 2:00 AM
  task = schedule('0 2 * * *', async () => {
    log.info('Channel renewal job: starting');
    try {
      const { renewExpiringWatchChannels } = await import('../services/watch-channel.service');
      const result = await renewExpiringWatchChannels();
      log.info('Channel renewal job: complete', result);
    } catch (error) {
      log.error('Channel renewal job: failed', error);
    }
  });

  log.info('Channel renewal job scheduled (daily at 2:00 AM)');
}

/**
 * Stop the channel renewal cron job
 */
export function stopChannelRenewalJob(): void {
  if (task) {
    task.stop();
    task = null;
    log.info('Channel renewal job stopped');
  }
}
