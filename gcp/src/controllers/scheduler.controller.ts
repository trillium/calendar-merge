/**
 * Scheduler controller
 * Handles Cloud Scheduler triggered operations
 */

import { Request, Response } from 'express';
import { processIncrementalChanges } from '../services/incremental-sync.service';
import { renewExpiringWatchChannels } from '../services/watch-channel.service';
import { logger } from '../utils';

const log = logger;

/**
 * Cloud Scheduler endpoint for incremental sync
 * Called every 15 minutes to process calendars with pending changes
 */
export async function runIncrementalSync(_req: Request, res: Response): Promise<void> {
  log.info('Scheduler: Starting incremental sync');

  try {
    const result = await processIncrementalChanges();

    res.status(200).json({
      success: true,
      message: 'Incremental sync completed',
      ...result,
    });
  } catch (error) {
    log.error('Scheduler: Incremental sync failed', error);
    res.status(500).json({ error: 'Incremental sync failed' });
  }
}

/**
 * Cloud Scheduler endpoint for watch renewal
 * Called daily at 2am to renew expiring watch channels
 */
export async function runWatchRenewal(_req: Request, res: Response): Promise<void> {
  log.info('Scheduler: Starting watch renewal');

  try {
    const result = await renewExpiringWatchChannels();

    res.status(200).json({
      success: true,
      message: 'Watch renewal completed',
      ...result,
    });
  } catch (error) {
    log.error('Scheduler: Watch renewal failed', error);
    res.status(500).json({ error: 'Watch renewal failed' });
  }
}
