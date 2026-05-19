# PageToken Batch Sync Flow

**Date**: 2025-11-15 (Updated: 2025-11-16)

---

## Key Concept

Use Google Calendar API's `pageToken` for stable pagination instead of offset-based slicing.

**Benefits:**
- Fetch only 50 events at a time (not all 2500 upfront)
- Server-side cursor prevents duplicates/skips even if user modifies calendar during sync
- Handles retry failures correctly

---

## Core Flow

### 1. Start Sync
```typescript
// Fetch first page
const { events, nextPageToken, nextSyncToken } = await listEvents(userId, calendarId, {
  maxResults: 50,
  syncToken: watch.syncToken || undefined,
});

// Small sync? Process sequentially, save syncToken, done.
if (events.length < 10 && !nextPageToken) {
  // ... sequential processing
  return;
}

// Large sync? Initialize batch state
await db.setDoc('batchStates', batchStateId, {
  currentPageToken: undefined, // First page
  processedEvents: 0,
  status: 'pending',
});

// Process first page
const result = await syncEventsBatchPaginated(userId, calendarId, targetCalendarId, undefined, watch.syncToken);

// Schedule next batch if more pages exist
if (result.nextPageToken) {
  await createBatchTask({ batchStateId, batchNumber: 2, scheduleTime: Date.now() + 10000 });
}
```

---

### 2. Process Page
```typescript
export async function syncEventsBatchPaginated(
  userId: string,
  sourceCalendarId: string,
  targetCalendarId: string,
  pageToken?: string,
  syncToken?: string
) {
  const isIncrementalSync = !!syncToken;

  // Fetch ONE page (50 events)
  const { events, nextPageToken, nextSyncToken } = await listEvents(userId, sourceCalendarId, {
    maxResults: 50,
    pageToken,
    syncToken,
  });

  // Separate creates/updates
  const createOps = [];
  const updateOps = [];

  for (const event of events) {
    if (!event.id || event.status === 'cancelled') continue;

    const mappingDoc = await db.getDoc('eventMappings', generateCompositeKey(sourceCalendarId, event.id));
    const eventData = transformEventData(event, sourceCalendarId);

    if (mappingDoc) {
      if (isIncrementalSync) {
        // Webhook sync: Google already filtered changed events → UPDATE
        updateOps.push({ sourceEventId: event.id, targetEventId: mappingDoc.targetEventId, eventData });
      } else {
        // Initial sync: Mapping exists = already synced in previous attempt → SKIP
        continue;
      }
    } else {
      // No mapping → CREATE
      createOps.push({ sourceEventId: event.id, eventData });
    }
  }

  // Process using Batch API
  if (createOps.length > 0) await batchCreateEvents(userId, targetCalendarId, createOps);
  if (updateOps.length > 0) await batchUpdateEvents(userId, targetCalendarId, updateOps);

  return { processedCount: events.length, nextPageToken, finalSyncToken: nextSyncToken };
}
```

---

### 3. Cloud Tasks Callback
```typescript
// POST /batch/continue
const state = await db.getDoc('batchStates', batchStateId);

// Process next page using saved pageToken
const result = await syncEventsBatchPaginated(
  state.userId,
  state.calendarId,
  state.targetCalendarId,
  state.currentPageToken, // ← Resume from here
  undefined // No syncToken for initial sync
);

// Update state
await db.updateDoc('batchStates', batchStateId, {
  processedEvents: state.processedEvents + result.processedCount,
  currentPageToken: result.nextPageToken,
});

// More pages? Schedule next batch : Mark complete
if (result.nextPageToken) {
  await createBatchTask({ batchStateId, batchNumber: state.batchNumber + 1 });
} else {
  await db.updateDoc('watches', channelId, { syncToken: result.finalSyncToken });
}
```

---

## Critical Fix: Initial vs Incremental Sync

**Problem:** Without `isIncrementalSync` flag, failed syncs waste API calls re-updating already-synced events.

**Example:**
```
Attempt 1: Sync 2000 events → Fails at event 200
  Result: 200 EventMappings created

Attempt 2 (OLD BEHAVIOR):
  - Fetch 2000 events
  - Events 0-199 have mappings → updateOps[] ❌ WASTE
  - Events 200-1999 no mappings → createOps[]
  - Result: 200 wasted updates + 1800 creates

Attempt 2 (NEW BEHAVIOR):
  - Fetch 2000 events
  - Events 0-199 have mappings → SKIP ✅
  - Events 200-1999 no mappings → createOps[]
  - Result: 0 updates + 1800 creates
```

**When to update existing events:**
- ✅ **Incremental sync** (webhook with syncToken): Google pre-filtered changed events
- ❌ **Initial sync** (no syncToken): All events returned, mappings indicate "already done"

---

## State Schema

```typescript
interface BatchState {
  userId: string;
  calendarId: string;
  targetCalendarId: string;
  batchNumber: number;
  currentPageToken?: string;      // Resume point
  initialSyncToken?: string;      // Final token when done
  processedEvents: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}
```

---

## Error Handling

**PageToken expired (410 Gone):**
```typescript
if (error.code === 410) {
  // PageToken expires after ~1 hour inactivity
  // Restart sync from beginning
  await batchSyncRoundRobin(userId);
}
```

---

## Performance (500 events example)

- **Batches:** 10 (500 ÷ 50)
- **Time:** ~100s (10 × 10s delay)
- **API calls:** 10 listEvents + 10 batch operations
- **Quota:** 5 events/sec = 500 events/100s (within 500 req/100s limit ✅)
