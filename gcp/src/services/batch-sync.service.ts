/**
 * Batch sync service
 * Handles large-scale event syncing with round-robin processing
 */

import { db } from '../db';
import { listEvents } from './google-calendar.service';
import { syncEvent } from './event-sync.service';
import { WatchData, BatchSyncProgress, RoundRobinStatus } from '../types';
import { logger, sleep } from '../utils';
import { APP_CONFIG } from '../config';

const log = logger;

/**
 * Batch sync events for a specific channel
 * Legacy API - processes all events for one calendar
 */
export async function batchSyncEvents(channelId: string): Promise<void> {
  log.info(`Starting batch sync for channel ${channelId}`);

  try {
    const watchData = await db.getDoc<WatchData>('watches', channelId);

    if (!watchData) {
      log.warn(`Watch ${channelId} not found`);
      return;
    }

    const { userId, calendarId, targetCalendarId, paused } = watchData;

    if (paused) {
      log.info(`Sync paused for channel ${channelId}`);
      return;
    }

    if (!targetCalendarId || !userId) {
      log.warn(`Missing configuration for ${calendarId}`);
      return;
    }

    // Update sync state to 'syncing'
    await db.updateDoc('watches', channelId, {
      'syncState.status': 'syncing',
      'syncState.startedAt': Date.now(),
    });

    // Fetch all events
    const { events, nextSyncToken } = await listEvents(userId, calendarId, {
      maxResults: 2500,
      singleEvents: true,
    });

    log.info(`Fetched ${events.length} events for batch sync`);

    // Update total events count
    await db.updateDoc('watches', channelId, {
      'syncState.totalEvents': events.length,
      'syncState.processedEvents': 0,
    });

    // Process events with rate limiting
    let syncedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (!event.id) continue;

      const result = await syncEvent(userId, calendarId, event.id, targetCalendarId);

      if (result.success) {
        syncedCount++;
      } else {
        failedCount++;
      }

      // Update progress periodically (every 10 events)
      if (i % 10 === 0) {
        await db.updateDoc('watches', channelId, {
          'syncState.processedEvents': i + 1,
        });
      }

      // Rate limiting
      if (i < events.length - 1) {
        await sleep(APP_CONFIG.RATE_LIMIT_DELAY_MS);
      }
    }

    // Update final state
    await db.updateDoc('watches', channelId, {
      'syncState.status': 'completed',
      'syncState.completedAt': Date.now(),
      'syncState.processedEvents': events.length,
      'syncState.failedEvents': failedCount,
      syncToken: nextSyncToken,
      syncTokenUpdatedAt: Date.now(),
    });

    log.info(`Batch sync complete for channel ${channelId}: ${syncedCount} synced, ${failedCount} failed`);
  } catch (error) {
    log.error(`Error in batch sync for channel ${channelId}`, error);

    // Mark as failed
    await db.updateDoc('watches', channelId, {
      'syncState.status': 'failed',
      'syncState.error': error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
}

/**
 * Round-robin batch sync - syncs one calendar at a time for a user
 * More efficient for users with multiple calendars
 */
export async function batchSyncRoundRobin(userId: string): Promise<RoundRobinStatus> {
  log.info(`Starting round-robin batch sync for user ${userId}`);

  try {
    // Get all watches for user
    const watches = await db.query<WatchData>('watches', 'userId', '==', userId);

    if (watches.length === 0) {
      log.warn(`No watches found for user ${userId}`);
      return {
        userId,
        currentIndex: 0,
        calendarsProcessed: 0,
        eventsProcessed: 0,
        hasMore: false,
      };
    }

    // Filter active watches (not paused, not already syncing)
    // Note: 'pending' watches are ready to sync, only exclude 'syncing' to prevent double-syncing
    const activeWatches = watches.filter(w => {
      const status = w.syncState?.status;
      return !w.paused && status !== 'syncing';
    });

    if (activeWatches.length === 0) {
      log.info(`No active watches to sync for user ${userId}`);
      return {
        userId,
        currentIndex: 0,
        calendarsProcessed: 0,
        eventsProcessed: 0,
        hasMore: false,
      };
    }

    // Get or initialize round-robin state
    const stateDoc = await db.getDoc<{ currentIndex: number }>('syncState', `roundrobin_${userId}`);
    let currentIndex = stateDoc?.currentIndex || 0;

    // Wrap around if needed
    if (currentIndex >= activeWatches.length) {
      currentIndex = 0;
    }

    const watch = activeWatches[currentIndex];
    const { calendarId, targetCalendarId, channelId } = watch;

    log.info(`Round-robin: Syncing calendar ${calendarId} (${currentIndex + 1}/${activeWatches.length})`);

    // Mark as syncing
    await db.updateDoc('watches', channelId, {
      'syncState.status': 'syncing',
      'syncState.startedAt': Date.now(),
    });

    // Fetch events in batches
    const batchSize = APP_CONFIG.BATCH_SIZE;
    const { events, nextSyncToken } = await listEvents(userId, calendarId, {
      maxResults: batchSize,
      singleEvents: true,
      syncToken: watch.syncToken || undefined,
    });

    log.info(`Processing ${events.length} events for calendar ${calendarId}`);

    // Sync events
    let syncedCount = 0;
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (!event.id) continue;

      const result = await syncEvent(userId, calendarId, event.id, targetCalendarId);
      if (result.success) syncedCount++;

      // Rate limiting
      if (i < events.length - 1) {
        await sleep(APP_CONFIG.RATE_LIMIT_DELAY_MS);
      }
    }

    // Update watch with sync token
    await db.updateDoc('watches', channelId, {
      'syncState.status': 'completed',
      'syncState.completedAt': Date.now(),
      syncToken: nextSyncToken,
      syncTokenUpdatedAt: Date.now(),
    });

    // Update round-robin state (move to next calendar)
    const nextIndex = (currentIndex + 1) % activeWatches.length;
    await db.setDoc('syncState', `roundrobin_${userId}`, {
      currentIndex: nextIndex,
    });

    // hasMore is true if:
    // 1. More calendars exist (haven't wrapped back to start), OR
    // 2. Current calendar might have more events (returned full batch)
    const hasMore = nextIndex !== 0 || events.length === batchSize;

    log.info(
      `Round-robin sync complete: ${syncedCount} events synced, moving to index ${nextIndex}, hasMore: ${hasMore} (nextIndex !== 0: ${nextIndex !== 0}, events.length === batchSize: ${events.length === batchSize})`
    );

    return {
      userId,
      currentIndex: nextIndex,
      calendarsProcessed: 1,
      eventsProcessed: syncedCount,
      hasMore,
    };
  } catch (error) {
    log.error(`Error in round-robin batch sync for user ${userId}`, error);
    throw error;
  }
}

/**
 * Get batch sync progress for a channel
 */
export async function getBatchSyncProgress(channelId: string): Promise<BatchSyncProgress | null> {
  const watchData = await db.getDoc<WatchData>('watches', channelId);

  if (!watchData || !watchData.syncState) {
    return null;
  }

  const { syncState } = watchData;

  return {
    totalCalendars: 1,
    processedCalendars: syncState.status === 'completed' ? 1 : 0,
    currentCalendar: watchData.calendarId,
    totalEvents: syncState.totalEvents || 0,
    syncedEvents: syncState.processedEvents || 0,
    failedEvents: syncState.failedEvents || 0,
    errors: syncState.error
      ? [
          {
            calendarId: watchData.calendarId,
            error: syncState.error,
            timestamp: syncState.completedAt || Date.now(),
          },
        ]
      : [],
  };
}

/**
 * Reset batch sync state for a channel
 */
export async function resetBatchSyncState(channelId: string): Promise<void> {
  await db.updateDoc('watches', channelId, {
    'syncState.status': 'pending',
    'syncState.startedAt': null,
    'syncState.completedAt': null,
    'syncState.totalEvents': 0,
    'syncState.processedEvents': 0,
    'syncState.failedEvents': 0,
    'syncState.error': null,
  });

  log.info(`Batch sync state reset for channel ${channelId}`);
}
