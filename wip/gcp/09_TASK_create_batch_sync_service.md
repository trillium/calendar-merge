# Task 09: Create Batch Sync Service

**Status:** Not Started
**Priority:** High
**Estimated Time:** 3-4 hours
**Dependencies:** Task 08 (Event Sync Service)

---

## Objective

Port batch sync logic from `functions/calendar-sync/batchSync.ts` for processing large numbers of events efficiently.

## Why This Task?

- Handles initial syncs with many events (too many for webhook)
- Implements round-robin syncing for multiple calendars
- Critical for user onboarding (first sync)

## Source File

Reference: `functions/calendar-sync/batchSync.ts` (592 lines)

## Target File

```
gcp/src/services/
└── batch-sync.service.ts  (Batch sync logic)
```

## Steps

### 1. Create batch-sync.service.ts

**File:** `gcp/src/services/batch-sync.service.ts`

```typescript
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
    const activeWatches = watches.filter(w => {
      const status = w.syncState?.status;
      return !w.paused && status !== 'pending' && status !== 'syncing';
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

    const hasMore = events.length === batchSize; // More events might exist

    log.info(
      `Round-robin sync complete: ${syncedCount} events synced, moving to index ${nextIndex}, hasMore: ${hasMore}`
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
```

### 2. Update services/index.ts

Add exports:

```typescript
// Batch sync service
export {
  batchSyncEvents,
  batchSyncRoundRobin,
  getBatchSyncProgress,
  resetBatchSyncState,
} from './batch-sync.service';
```

## Key Features

### Round-Robin Syncing
- Processes one calendar at a time for users with multiple calendars
- Stores state in Firestore to resume between invocations
- Prevents overwhelming the API with too many simultaneous requests

### Progress Tracking
- Updates sync state in Firestore every 10 events
- Provides real-time progress via `getBatchSyncProgress()`
- Handles failures gracefully

### Backward Compatibility
- `batchSyncEvents()` supports old API (by channelId)
- `batchSyncRoundRobin()` is the new preferred method (by userId)

## Validation Checklist

- [ ] batch-sync.service.ts created
- [ ] batchSyncEvents() function ported
- [ ] batchSyncRoundRobin() function implemented
- [ ] Progress tracking works
- [ ] Error handling and state management
- [ ] TypeScript compiles: `pnpm build`
- [ ] Exports added to services/index.ts

## Next Task

→ **10_TASK_create_watch_channel_service.md** - Port watch.ts logic

## Notes

- Combines the 592 lines from batchSync.ts into a cleaner service
- Round-robin is more efficient than processing all calendars at once
- Rate limiting prevents quota exhaustion
- Sync state is persisted in Firestore for resumability
