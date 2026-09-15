/**
 * Incremental sync service
 * Processes calendars with pending changes (scheduler-driven)
 */

import { db } from '../db';
import { WatchData } from '../types';
import { logger } from '../utils';
import { syncEventsBatchPaginated } from './batch-sync.service';

const log = logger;

/**
 * Process all calendars with pending changes
 * Called by Cloud Scheduler every 15 minutes
 */
export async function processIncrementalChanges(): Promise<{
  processed: number;
  failed: number;
  errors: Array<{ calendarId: string; error: string }>;
}> {
  log.info('Starting incremental sync cycle');

  // Get all watches with pending changes
  const allWatches = await db.getAll<WatchData>('watches');
  const pendingWatches = allWatches.filter(
    (w) => w.pendingChanges && !w.paused && w.syncState?.status !== 'syncing'
  );

  if (pendingWatches.length === 0) {
    log.info('No pending changes to process');
    return { processed: 0, failed: 0, errors: [] };
  }

  log.info(`Processing ${pendingWatches.length} calendars with pending changes`);

  let processed = 0;
  let failed = 0;
  const errors: Array<{ calendarId: string; error: string }> = [];

  for (const watch of pendingWatches) {
    try {
      log.info('Processing incremental sync', {
        calendarId: watch.calendarId,
        channelId: watch.channelId,
      });

      // Mark as syncing
      await db.updateDoc('watches', watch.channelId, {
        'syncState.status': 'syncing',
        'syncState.startedAt': Date.now(),
      });

      // Process all changes using syncToken
      // This automatically handles pagination
      const result = await syncEventsBatchPaginated(
        watch.userId,
        watch.calendarId,
        watch.targetCalendarId,
        undefined, // No pageToken (start fresh)
        watch.syncToken || undefined // Use syncToken to get only changes
      );

      // Update watch: clear pending flag, save new syncToken
      await db.updateDoc('watches', watch.channelId, {
        pendingChanges: false,
        lastSyncedAt: Date.now(),
        syncToken: result.finalSyncToken || watch.syncToken,
        syncTokenUpdatedAt: Date.now(),
        'syncState.status': 'completed',
        'syncState.completedAt': Date.now(),
        'syncState.processedEvents': result.processedCount,
      });

      log.info('Incremental sync completed', {
        calendarId: watch.calendarId,
        eventsProcessed: result.processedCount,
      });

      processed++;
    } catch (error: any) {
      log.error('Incremental sync failed', error, {
        calendarId: watch.calendarId,
      });

      // Mark as failed but keep pendingChanges=true to retry next cycle
      await db.updateDoc('watches', watch.channelId, {
        'syncState.status': 'pending',
        'syncState.error': error.message,
      });

      failed++;
      errors.push({
        calendarId: watch.calendarId,
        error: error.message,
      });
    }
  }

  log.info('Incremental sync cycle complete', { processed, failed });

  return { processed, failed, errors };
}
