# Task: Implement PageToken for Batch Sync Consistency

**Date**: 2025-11-15
**Priority**: High
**Status**: Not Started
**Complexity**: Medium

---

## Problem Statement

Currently, the batch sync implementation uses Option A (re-fetch all events and slice by offset), which has a critical flaw:

**Between batches, the event list can change:**

- User adds/deletes events → Total count changes
- User modifies event times → Sort order changes
- Recurring events expand differently → List composition changes

This means `events.slice(offset, offset + 50)` might:

- ❌ Process duplicate events
- ❌ Skip events entirely
- ❌ Process wrong events at wrong offsets

## Solution: Implement PageToken-Based Batching

Use Google Calendar API's native pagination (`pageToken`) to maintain a **server-side cursor** that guarantees:

- ✅ Consistent snapshot of events
- ✅ No duplicates
- ✅ No skipped events
- ✅ Works even if user modifies calendar during sync

---

## Implementation Details

### 1. Update Firestore Collections

**GOOD NEWS**: `BatchState` interface already exists in `gcp/src/types/batch.types.ts:10-34` with pageToken support! ✅

**File**: `gcp/src/config/database.config.ts`

Add new collection to existing schema:

```typescript
export const DB_CONFIG = {
  // Firestore collections
  COLLECTIONS: {
    USERS: 'users',
    WATCHES: 'watches',
    EVENT_MAPPINGS: 'eventMappings',
    SYNC_STATE: 'syncState',  // ← Existing (for WatchData.syncState)
    BATCH_STATES: 'batchStates',  // ✨ NEW: For pageToken batch tracking
    OAUTH_STATE: 'oauthState',
  },
  // ... rest of config
}
```

**File**: `gcp/src/db/firestore.ts`

Add helper method (after line 83):

```typescript
  /**
   * Batch states collection
   */
  batchStates: () => getCollection(DB_CONFIG.COLLECTIONS.BATCH_STATES),
```

**Verify BatchState Interface** (already complete at `gcp/src/types/batch.types.ts:10-34`):

```typescript
export interface BatchState {
  userId: string;
  batchNumber: number;
  operation: 'create' | 'update' | 'mixed';  // ✅ Already has 'mixed'!

  // Calendar info
  calendarId: string;
  targetCalendarId: string;

  // PageToken tracking for consistent pagination
  currentPageToken?: string; // ✅ Already exists!
  initialSyncToken?: string; // ✅ Already exists!

  // Progress tracking
  processedEvents: number;
  failedEvents: number;
  totalEventsEstimate?: number; // ✅ Already optional!

  // Status
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  error?: string;
}
```

**Key Changes:**
- ✅ BatchState interface is already perfect - no changes needed!
- ✅ Add `BATCH_STATES` collection to database config
- ✅ Add `db.batchStates()` helper method
- ✅ Use existing `WatchData.syncState` for progress tracking in UI

---

### 2. Modify Initial Batch Creation

**File**: `gcp/src/services/batch-sync.service.ts`

**Function**: `syncEventsBatch()`

**Current Code** (lines ~140-200):

```typescript
async function syncEventsBatch(
  userId: string,
  sourceCalendarId: string,
  events: CalendarEvent[], // ❌ Already fetched all events
  targetCalendarId: string
): Promise<number> {
  // Separate creates from updates
  const createOps = [];
  const updateOps = [];

  for (const event of events) {
    // ... check mapping, categorize
  }

  // Process all creates in batches
  await batchCreateEvents(userId, targetCalendarId, createOps);

  // Process all updates in batches
  await batchUpdateEvents(userId, targetCalendarId, updateOps);
}
```

**New Approach**:

```typescript
async function syncEventsBatchPaginated(
  userId: string,
  sourceCalendarId: string,
  targetCalendarId: string,
  pageToken?: string // ✨ NEW: Start from specific page
): Promise<{
  processedCount: number;
  nextPageToken?: string;
  finalSyncToken?: string;
}> {
  // ✨ Fetch ONLY one page of events (50)
  const result = await listEvents(userId, sourceCalendarId, {
    maxResults: 50, // ✨ Match batch size
    singleEvents: true,
    pageToken: pageToken, // ✨ Continue from where we left off
    syncToken: undefined, // ✨ Initial sync (no syncToken yet)
  });

  const { events, nextPageToken, nextSyncToken } = result;

  // Separate creates from updates (same logic as before)
  const createOps = [];
  const updateOps = [];

  for (const event of events) {
    if (!event.id || event.status === "cancelled") continue;

    const mappingId = generateCompositeKey(sourceCalendarId, event.id);
    const mappingDoc = await db.getDoc("eventMappings", mappingId);
    const eventData = transformEventData(event, sourceCalendarId);

    if (mappingDoc) {
      updateOps.push({
        sourceEventId: event.id,
        targetEventId: mappingDoc.targetEventId,
        eventData,
      });
    } else {
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
    nextPageToken, // ✨ Return for next batch
    finalSyncToken: nextSyncToken, // ✨ Will be set on final page
  };
}
```

**Key Changes:**

1. Don't fetch all events upfront
2. Fetch only 50 events per call (one page)
3. Use `pageToken` to continue from previous position
4. Return `nextPageToken` for next batch
5. Return `finalSyncToken` when pagination completes

---

### 3. Update Initial Trigger Logic

**File**: `gcp/src/services/batch-sync.service.ts`

**Function**: `batchSyncRoundRobin()`

**Current Code** (lines ~60-130):

```typescript
export async function batchSyncRoundRobin(
  userId: string
): Promise<RoundRobinStatus> {
  // Fetch ALL events
  const { events, nextSyncToken } = await listEvents(userId, calendarId, {
    maxResults: 2500,
    singleEvents: true,
    syncToken: watch.syncToken || undefined,
  });

  // Check if we should batch
  if (BATCH_API_ENABLED && events.length >= BATCH_THRESHOLD) {
    await syncEventsBatch(userId, sourceCalendarId, events, targetCalendarId);
  }

  // Save syncToken
  await db.updateDoc("watches", channelId, { syncToken: nextSyncToken });
}
```

**New Code**:

```typescript
export async function batchSyncRoundRobin(
  userId: string
): Promise<RoundRobinStatus> {
  // Get user's watched calendars
  const watches = await db.query<WatchData>("watches", "userId", "==", userId);

  for (const watch of watches) {
    if (watch.paused) continue;

    // ✨ Process FIRST page to determine if batching is needed
    const { events, nextPageToken, nextSyncToken } = await listEvents(
      userId,
      watch.calendarId,
      {
        maxResults: 50, // ✨ Fetch first page only
        singleEvents: true,
        syncToken: watch.syncToken || undefined,
      }
    );

    // If first page has < threshold AND no nextPageToken, use sequential
    if (events.length < BATCH_THRESHOLD && !nextPageToken) {
      log.info(`Small sync for ${watch.calendarId}: ${events.length} events`);

      for (const event of events) {
        await syncEvent(
          userId,
          watch.calendarId,
          event.id,
          watch.targetCalendarId
        );
        await sleep(RATE_LIMIT_DELAY_MS);
      }

      await db.updateDoc("watches", watch.channelId, {
        syncToken: nextSyncToken,
        syncTokenUpdatedAt: Date.now(),
      });

      continue;
    }

    // ✨ Large sync detected - initialize batch state
    log.info(`Batch sync for ${watch.calendarId}: Starting paginated sync`);

    const batchStateId = `${userId}_${watch.calendarId}_${Date.now()}`;

    await db.setDoc("batchStates", batchStateId, {
      userId,
      calendarId: watch.calendarId,
      targetCalendarId: watch.targetCalendarId,
      batchNumber: 1,
      operation: "mixed", // Will handle both creates and updates
      currentPageToken: undefined, // First batch has no token
      processedEvents: 0,
      failedEvents: 0,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // ✨ Process first page immediately
    const result = await syncEventsBatchPaginated(
      userId,
      watch.calendarId,
      watch.targetCalendarId,
      undefined // No pageToken for first batch
    );

    // ✨ Update state with results
    await db.updateDoc("batchStates", batchStateId, {
      processedEvents: result.processedCount,
      currentPageToken: result.nextPageToken,
      initialSyncToken: result.finalSyncToken, // Save if this was last page
      updatedAt: Date.now(),
    });

    // ✨ If there's more pages, schedule next batch via Cloud Tasks
    if (result.nextPageToken) {
      await createBatchTask({
        userId,
        batchStateId,
        batchNumber: 2,
        scheduleTime: Date.now() + BATCH_DELAY_MS,
      });

      log.info(`Scheduled batch 2 for ${watch.calendarId}`);
    } else {
      // ✨ No more pages - sync complete!
      await db.updateDoc("batchStates", batchStateId, {
        status: "completed",
        updatedAt: Date.now(),
      });

      // ✨ Save final syncToken to watch
      if (result.finalSyncToken) {
        await db.updateDoc("watches", watch.channelId, {
          syncToken: result.finalSyncToken,
          syncTokenUpdatedAt: Date.now(),
        });
      }

      log.info(
        `Batch sync complete for ${watch.calendarId}: ${result.processedCount} events`
      );
    }
  }

  return {
    userId,
    currentIndex: 0,
    calendarsProcessed: watches.length,
    eventsProcessed: 0, // TODO: Sum from batch states
    hasMore: false,
  };
}
```

---

### 4. Implement continueBatch() Handler

**File**: `gcp/src/controllers/batch.controller.ts`

**New Function**:

```typescript
import { Request, Response } from "express";
import { db } from "../config/firebase.config";
import { BatchState } from "../types/batch.types";
import { syncEventsBatchPaginated } from "../services/batch-sync.service";
import { createBatchTask } from "../services/cloud-tasks.service";
import { logger } from "../utils/logger";

const log = logger.child({ module: "batch-controller" });

export async function continueBatch(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { batchStateId, batchNumber } = req.body;

    if (!batchStateId || !batchNumber) {
      res.status(400).json({ error: "Missing batchStateId or batchNumber" });
      return;
    }

    // ✨ Load batch state from Firestore
    const state = await db.getDoc<BatchState>("batchStates", batchStateId);

    if (!state) {
      log.error(`Batch state not found: ${batchStateId}`);
      res.status(404).json({ error: "Batch state not found" });
      return;
    }

    if (state.status === "completed") {
      log.info(`Batch already completed: ${batchStateId}`);
      res.status(200).json({ message: "Batch already completed" });
      return;
    }

    // ✨ Mark as processing
    await db.updateDoc("batchStates", batchStateId, {
      status: "processing",
      batchNumber,
      updatedAt: Date.now(),
    });

    log.info(`Processing batch ${batchNumber} for state ${batchStateId}`);

    // ✨ Process next page using saved pageToken
    const result = await syncEventsBatchPaginated(
      state.userId,
      state.calendarId,
      state.targetCalendarId,
      state.currentPageToken // ✨ Continue from where we left off
    );

    // ✨ Update state with new progress
    await db.updateDoc("batchStates", batchStateId, {
      processedEvents: state.processedEvents + result.processedCount,
      currentPageToken: result.nextPageToken, // ✨ Save for next batch
      initialSyncToken: result.finalSyncToken || state.initialSyncToken,
      updatedAt: Date.now(),
    });

    // ✨ If there's more pages, schedule next batch
    if (result.nextPageToken) {
      await createBatchTask({
        userId: state.userId,
        batchStateId,
        batchNumber: batchNumber + 1,
        scheduleTime:
          Date.now() + parseInt(process.env.BATCH_DELAY_MS || "10000"),
      });

      log.info(`Scheduled batch ${batchNumber + 1} for state ${batchStateId}`);

      res.status(200).json({
        message: "Batch processed, next batch scheduled",
        batchNumber,
        nextBatch: batchNumber + 1,
        processedThisBatch: result.processedCount,
        totalProcessed: state.processedEvents + result.processedCount,
      });
    } else {
      // ✨ No more pages - sync complete!
      await db.updateDoc("batchStates", batchStateId, {
        status: "completed",
        updatedAt: Date.now(),
      });

      // ✨ Save final syncToken to watch channel
      if (result.finalSyncToken) {
        const watches = await db.query<WatchData>(
          "watches",
          "userId",
          "==",
          state.userId,
          "calendarId",
          "==",
          state.calendarId
        );

        if (watches.length > 0) {
          await db.updateDoc("watches", watches[0].channelId, {
            syncToken: result.finalSyncToken,
            syncTokenUpdatedAt: Date.now(),
            "syncState.status": "completed",
            "syncState.completedAt": Date.now(),
            "syncState.processedEvents":
              state.processedEvents + result.processedCount,
          });
        }
      }

      log.info(
        `Batch sync completed: ${batchStateId}, total events: ${
          state.processedEvents + result.processedCount
        }`
      );

      res.status(200).json({
        message: "Batch sync completed",
        batchNumber,
        totalProcessed: state.processedEvents + result.processedCount,
        finalSyncToken: result.finalSyncToken,
      });
    }
  } catch (error) {
    log.error("Error in continueBatch:", error);

    // ✨ Mark batch as failed
    if (req.body.batchStateId) {
      await db.updateDoc("batchStates", req.body.batchStateId, {
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        updatedAt: Date.now(),
      });
    }

    res.status(500).json({
      error: "Batch processing failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
```

---

### 5. Update Google Calendar Service

**File**: `gcp/src/services/google-calendar.service.ts`

**Function**: `listEvents()`

**Ensure it returns pageToken:**

```typescript
export async function listEvents(
  userId: string,
  calendarId: string,
  options: {
    maxResults?: number;
    syncToken?: string;
    pageToken?: string; // ✨ Add this
    singleEvents?: boolean;
    timeMin?: string;
    timeMax?: string;
  } = {}
): Promise<{
  events: CalendarEvent[];
  nextSyncToken?: string;
  nextPageToken?: string; // ✨ Add this
}> {
  const calendar = await getCalendarClient(userId);

  const response = await calendar.events.list({
    calendarId,
    maxResults: options.maxResults || 2500,
    singleEvents: options.singleEvents ?? true,
    orderBy: options.singleEvents ? "startTime" : undefined,
    syncToken: options.syncToken,
    pageToken: options.pageToken, // ✨ Pass through
    timeMin: options.timeMin,
    timeMax: options.timeMax,
  });

  return {
    events: response.data.items || [],
    nextSyncToken: response.data.nextSyncToken,
    nextPageToken: response.data.nextPageToken, // ✨ Return this
  };
}
```

---

### 6. Update Cloud Tasks Service

**File**: `gcp/src/services/cloud-tasks.service.ts`

**Update task payload:**

```typescript
interface BatchTaskPayload {
  userId: string;
  batchStateId: string; // ✨ Reference to Firestore batchState doc
  batchNumber: number;
  // Remove: operation, totalBatches (stored in Firestore now)
}

export async function createBatchTask(params: {
  userId: string;
  batchStateId: string;
  batchNumber: number;
  scheduleTime: number;
}): Promise<void> {
  const tasksClient = new CloudTasksClient();
  const project = process.env.GCP_PROJECT_ID;
  const location = process.env.CLOUD_TASKS_LOCATION || "us-central1";
  const queue = process.env.CLOUD_TASKS_QUEUE || "calendar-sync-queue";

  const queuePath = tasksClient.queuePath(project!, location, queue);
  const url = `${process.env.GCP_BACKEND_URL}/batch/continue`;

  const payload: BatchTaskPayload = {
    userId: params.userId,
    batchStateId: params.batchStateId,
    batchNumber: params.batchNumber,
  };

  const task = {
    httpRequest: {
      httpMethod: "POST",
      url,
      headers: {
        "Content-Type": "application/json",
      },
      body: Buffer.from(JSON.stringify(payload)).toString("base64"),
      oidcToken: {
        serviceAccountEmail: process.env.GCP_SERVICE_ACCOUNT_EMAIL,
      },
    },
    scheduleTime: {
      seconds: Math.floor(params.scheduleTime / 1000),
    },
  };

  await tasksClient.createTask({ parent: queuePath, task });

  log.info(
    `Created Cloud Task for batch ${params.batchNumber}, state: ${params.batchStateId}`
  );
}
```

---

## Testing Plan

### 1. Unit Tests

!! THESE ARE SUGGESTSIONS, use vitest

**File**: `gcp/src/services/batch-sync.service.test.ts`

```typescript
describe("syncEventsBatchPaginated", () => {
  it("should fetch only 50 events per page", async () => {
    // Mock listEvents to return 50 events + nextPageToken
    // Verify maxResults: 50 is passed
    // Verify nextPageToken is returned
  });

  it("should use pageToken to continue from previous batch", async () => {
    // Call with pageToken = 'token123'
    // Verify listEvents receives pageToken: 'token123'
  });

  it("should return finalSyncToken on last page", async () => {
    // Mock listEvents to return no nextPageToken but yes nextSyncToken
    // Verify finalSyncToken is returned
  });
});

describe("continueBatch", () => {
  it("should load state from Firestore and process next page", async () => {
    // Create mock batch state with currentPageToken
    // Call continueBatch
    // Verify state.currentPageToken was used
    // Verify state was updated with new pageToken
  });

  it("should complete sync when no nextPageToken returned", async () => {
    // Mock last page (no nextPageToken)
    // Verify status set to 'completed'
    // Verify syncToken saved to watch
  });
});
```

### 2. Integration Test

**File**: `gcp/src/services/batch-sync.integration.test.ts`

```typescript
describe("PageToken Batch Sync (Integration)", () => {
  it("should sync 200 events across 4 batches using pageToken", async () => {
    // Use test calendar with 200 events
    // Trigger initial sync
    // Verify 4 batches created (50 events each)
    // Verify pageToken changes between batches
    // Verify all 200 events synced exactly once
    // Verify final syncToken saved
  });

  it("should handle user adding events mid-sync", async () => {
    // Start sync with 100 events
    // After batch 1, add 10 new events to source calendar
    // Continue sync
    // Verify: Either new events included OR excluded (but no crashes/duplicates)
  });
});
```

### 3. Manual Testing Steps

1. **Small sync (< 50 events)**:

   - Connect calendar with 20 events
   - Verify: Uses sequential sync (no batching)
   - Verify: syncToken saved immediately

2. **Medium sync (50-150 events)**:

   - Connect calendar with 100 events
   - Verify: Uses paginated batching (2 batches)
   - Verify: pageToken changes between batches
   - Verify: syncToken saved after batch 2

3. **Large sync (2000+ events)**:

   - Connect calendar with 2000 events
   - Verify: Uses paginated batching (~40 batches)
   - Verify: Consistent progress (no duplicates/skips)
   - Verify: Total time ~400 seconds (40 batches × 10s)

4. **User modifications during sync**:
   - Start sync with 500 events
   - During batch 3, add/modify/delete events in source calendar
   - Verify: Sync completes without errors
   - Verify: No duplicate events in target calendar

---

## Files to Modify

### Core Implementation

1. ✅ `gcp/src/types/batch.types.ts` - Update BatchState interface
2. ✅ `gcp/src/services/batch-sync.service.ts` - Implement syncEventsBatchPaginated
3. ✅ `gcp/src/services/batch-sync.service.ts` - Update batchSyncRoundRobin
4. ✅ `gcp/src/controllers/batch.controller.ts` - Implement continueBatch
5. ✅ `gcp/src/services/google-calendar.service.ts` - Return nextPageToken
6. ✅ `gcp/src/services/cloud-tasks.service.ts` - Update task payload

### Testing

7. ✅ `gcp/src/services/batch-sync.service.test.ts` - Add pageToken tests
8. ✅ `gcp/src/services/batch-sync.integration.test.ts` - Integration tests

### Documentation

9. ✅ create `wip/gcp/FLOW_SECTION_UPDATE.md` - Update to reflect pageToken implementation

- this will hold the changes that will be added to `wip/gcp/FLOW.md` later.

10. ✅ Update README with pageToken details

---

## Success Criteria

✅ **Consistency**: No duplicate or skipped events across batches
✅ **Resilience**: Handles user modifications during sync gracefully
✅ **Performance**: Same ~10s delay between batches (quota compliance)
✅ **State Management**: BatchState correctly tracks pageToken
✅ **Completion**: Final syncToken saved for incremental updates
✅ **Testing**: All unit and integration tests pass
✅ **Documentation**: FLOW.md updated with pageToken details

---

## Rollout Plan

### Phase 1: Implementation

- Implement all code changes above
- Add comprehensive tests

### Phase 2: Testing

- Ensure unit tests pass

---

## Notes

- **Backward Compatibility**: Does not matter at all
- **Error Handling**: If Google Calendar API errors on a pageToken, entire batch should fail and retry
- **Quota**: PageToken approach uses same quota as current (1 request per 50 events batched)
- **State Cleanup**: BatchState documents should be deleted after 7 days (add cleanup job)

---

## Questions for Review

1. Should we support resuming mid-batch if a batch fails partway through? (Currently: retry entire batch)
   Look at what our batching tool lib we use does already and adhere to their best practices
2. How to handle pageToken expiration? (Google invalidates after ~1 hour of inactivity)
   Expiration should mean we restart from scratch, that means the sync failed
3. Should we add a maximum batch count limit? (e.g., fail if > 100 batches / 5000 events)
   No
4. Do we need a UI to show batch progress? (Currently: hidden from user)
   Our firebase currently contains a section that has a batch sync state, if possible we should use it.
