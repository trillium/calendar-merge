/**
 * Batch sync service
 * Handles large-scale event syncing with round-robin processing
 */

import { db } from '../db';
import { listEvents } from './google-calendar.service';
import { batchCreateEvents, batchUpdateEvents } from './google-calendar-batch.service';
import { createBatchTask } from './cloud-tasks.service';
import { WatchData, BatchSyncProgress, RoundRobinStatus, EventMapping } from '../types';
import { logger, generateCompositeKey, transformEventData } from '../utils';
import { APP_CONFIG } from '../config';

const log = logger;

/**
 * Sync events using pageToken-based pagination
 * Fetches and processes one page of events at a time
 */
export async function syncEventsBatchPaginated(
  userId: string,
  sourceCalendarId: string,
  targetCalendarId: string,
  pageToken?: string,
  syncToken?: string
): Promise<{
  processedCount: number;
  nextPageToken?: string;
  finalSyncToken?: string;
}> {
  // Determine if this is incremental sync (has syncToken)
  const isIncrementalSync = !!syncToken;

  // Fetch ONLY one page of events (50)
  // For initial sync (no syncToken), only sync future events
  const result = await listEvents(userId, sourceCalendarId, {
    maxResults: 50, // Match batch size
    singleEvents: true,
    pageToken: pageToken, // Continue from where we left off
    syncToken: syncToken, // Use syncToken if provided (incremental sync)
    ...(!syncToken && !pageToken ? { timeMin: new Date().toISOString() } : {}),
  });

  const { events, nextPageToken, nextSyncToken } = result;

  // Separate creates from updates
  const createOps: Array<{ sourceEventId: string; sourceCalendarId: string; eventData: any }> = [];
  const updateOps: Array<{
    sourceEventId: string;
    sourceCalendarId: string;
    targetEventId: string;
    eventData: any;
  }> = [];

  for (const event of events) {
    if (!event.id || event.status === 'cancelled') continue;

    const mappingId = generateCompositeKey(sourceCalendarId, event.id);
    const mappingDoc = await db.getDoc<EventMapping>('eventMappings', mappingId);
    const eventData = transformEventData(event, sourceCalendarId);

    if (mappingDoc) {
      // Mapping exists - event was previously synced
      if (isIncrementalSync) {
        // Incremental sync: Google already filtered to changed events
        // This event was modified in source - update it in target
        updateOps.push({
          sourceEventId: event.id,
          sourceCalendarId,
          targetEventId: mappingDoc.targetEventId,
          eventData,
        });
      } else {
        // Initial sync: Mapping exists means already synced in previous attempt
        // Skip to avoid re-updating the same event
        log.debug(`Skipping already-synced event ${event.id}`);
        continue;
      }
    } else {
      // No mapping - new event, needs to be created
      createOps.push({ sourceEventId: event.id, sourceCalendarId, eventData });
    }
  }

  // Process THIS page's creates/updates
  if (createOps.length > 0) {
    await batchCreateEvents(userId, targetCalendarId, createOps);
  }

  if (updateOps.length > 0) {
    await batchUpdateEvents(userId, targetCalendarId, updateOps);
  }

  return {
    processedCount: events.length,
    nextPageToken, // Return for next batch
    finalSyncToken: nextSyncToken, // Will be set on final page
  };
}

/**
 * Paginate through ALL pages of events in-process.
 * Calls syncEventsBatchPaginated in a loop, respecting rate limits.
 * Returns the final syncToken (only available on the last page) and total count.
 *
 * This is the LOCAL execution path. When CLOUD_TASKS_ENABLED is true,
 * the orchestrator dispatches each page as a separate Cloud Task instead.
 */
export async function syncAllPages(
  userId: string,
  sourceCalendarId: string,
  targetCalendarId: string,
  syncToken?: string
): Promise<{ totalProcessed: number; finalSyncToken?: string }> {
  let pageToken: string | undefined;
  let totalProcessed = 0;
  let finalSyncToken: string | undefined;
  let pageNumber = 1;

  do {
    log.info(
      `syncAllPages: page ${pageNumber} for ${sourceCalendarId}` +
        (pageToken ? ` (pageToken: ${pageToken.slice(0, 20)}...)` : '')
    );

    const result = await syncEventsBatchPaginated(
      userId,
      sourceCalendarId,
      targetCalendarId,
      pageToken,
      // syncToken only on the FIRST page (Google rejects it with pageToken)
      pageNumber === 1 ? syncToken : undefined
    );

    totalProcessed += result.processedCount;
    pageToken = result.nextPageToken;
    finalSyncToken = result.finalSyncToken; // Only set on last page
    pageNumber++;

    // Rate limit between pages
    if (pageToken) {
      await sleep(APP_CONFIG.RATE_LIMIT_DELAY_MS);
    }
  } while (pageToken);

  log.info(
    `syncAllPages: completed for ${sourceCalendarId} — ${totalProcessed} events across ${pageNumber - 1} pages` +
      (finalSyncToken ? ' (syncToken captured)' : ' (no syncToken)')
  );

  return { totalProcessed, finalSyncToken };
}

/** Simple async sleep helper */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Round-robin batch sync - syncs one calendar at a time for a user
 * More efficient for users with multiple calendars
 *
 * Execution modes:
 *   - Local (CLOUD_TASKS_ENABLED=false, default): paginates all pages in-process via syncAllPages()
 *   - Cloud Tasks (CLOUD_TASKS_ENABLED=true): dispatches each page as a separate task
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

    // Initialize batch state (always use batch API regardless of size)
    log.info(`Starting batch sync for ${calendarId}`);

    const batchStateId = `${userId}_${calendarId}_${Date.now()}`;

    await db.setDoc('batchStates', batchStateId, {
      userId,
      calendarId,
      targetCalendarId,
      batchNumber: 1,
      operation: 'mixed' as const, // Will handle both creates and updates
      currentPageToken: undefined, // First batch has no token
      processedEvents: 0,
      failedEvents: 0,
      status: 'pending' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // ── Execution mode branch ─────────────────────────────────────────
    if (!APP_CONFIG.CLOUD_TASKS_ENABLED) {
      // LOCAL MODE: paginate all pages in-process
      const { totalProcessed, finalSyncToken } = await syncAllPages(
        userId,
        calendarId,
        targetCalendarId,
        watch.syncToken || undefined
      );

      // Update batch state as completed
      await db.updateDoc('batchStates', batchStateId, {
        processedEvents: totalProcessed,
        status: 'completed' as const,
        updatedAt: Date.now(),
      });

      // Save syncToken + stats to the watch
      const watchDoc = await db.getDoc<WatchData>('watches', channelId);
      const currentTotal = watchDoc?.stats?.totalEventsSynced || 0;
      const updateFields: Record<string, unknown> = {
        'syncState.status': 'completed',
        'syncState.completedAt': Date.now(),
        'syncState.processedEvents': totalProcessed,
        'stats.totalEventsSynced': currentTotal + totalProcessed,
        'stats.lastSyncTime': Date.now(),
        'stats.lastSyncEventCount': totalProcessed,
      };
      if (finalSyncToken) {
        updateFields.syncToken = finalSyncToken;
        updateFields.syncTokenUpdatedAt = Date.now();
        log.info(`Saved syncToken for ${calendarId}`);
      }
      await db.updateDoc('watches', channelId, updateFields);

      log.info(`Batch sync complete for ${calendarId}: ${totalProcessed} events`);

      // Advance round-robin to next calendar
      const nextIndex = (currentIndex + 1) % activeWatches.length;
      await db.setDoc('syncState', `roundrobin_${userId}`, {
        currentIndex: nextIndex,
      });

      return {
        userId,
        currentIndex: nextIndex,
        calendarsProcessed: 1,
        eventsProcessed: totalProcessed,
        hasMore: nextIndex !== 0,
      };
    }

    // ── CLOUD TASKS MODE: dispatch page-by-page via Cloud Tasks ──────
    // Process first page immediately
    const result = await syncEventsBatchPaginated(
      userId,
      calendarId,
      targetCalendarId,
      undefined, // No pageToken for first batch
      watch.syncToken || undefined // Use syncToken if available
    );

    // Update state with results
    await db.updateDoc('batchStates', batchStateId, {
      processedEvents: result.processedCount,
      currentPageToken: result.nextPageToken,
      initialSyncToken: result.finalSyncToken, // Save if this was last page
      updatedAt: Date.now(),
    });

    // If there's more pages, schedule next batch via Cloud Tasks
    if (result.nextPageToken) {
      await createBatchTask({
        userId,
        batchStateId,
        batchNumber: 2,
        scheduleTime: Date.now() + APP_CONFIG.BATCH_DELAY_MS,
      });

      await db.updateDoc('batchStates', batchStateId, {
        status: 'processing' as const,
      });

      // Update round-robin to next calendar
      const nextIndex = (currentIndex + 1) % activeWatches.length;
      await db.setDoc('syncState', `roundrobin_${userId}`, {
        currentIndex: nextIndex,
      });

      return {
        userId,
        currentIndex: nextIndex,
        calendarsProcessed: 0, // Still processing this calendar
        eventsProcessed: result.processedCount,
        hasMore: true,
      };
    } else {
      // No more pages - sync complete!
      await db.updateDoc('batchStates', batchStateId, {
        status: 'completed' as const,
        updatedAt: Date.now(),
      });

      // Save final syncToken to watch and update stats
      const watchDoc = await db.getDoc<WatchData>('watches', channelId);
      const currentTotal = watchDoc?.stats?.totalEventsSynced || 0;
      const updateFields: Record<string, unknown> = {
        'syncState.status': 'completed',
        'syncState.completedAt': Date.now(),
        'syncState.processedEvents': result.processedCount,
        'stats.totalEventsSynced': currentTotal + result.processedCount,
        'stats.lastSyncTime': Date.now(),
        'stats.lastSyncEventCount': result.processedCount,
      };
      if (result.finalSyncToken) {
        updateFields.syncToken = result.finalSyncToken;
        updateFields.syncTokenUpdatedAt = Date.now();
      }
      await db.updateDoc('watches', channelId, updateFields);

      log.info(`Batch sync complete for ${calendarId}: ${result.processedCount} events`);

      // Update round-robin state (move to next calendar)
      const nextIndex = (currentIndex + 1) % activeWatches.length;
      await db.setDoc('syncState', `roundrobin_${userId}`, {
        currentIndex: nextIndex,
      });

      return {
        userId,
        currentIndex: nextIndex,
        calendarsProcessed: 1,
        eventsProcessed: result.processedCount,
        hasMore: nextIndex !== 0,
      };
    }
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
