# Error Handling & Failure Recovery Analysis

## Current State: How Errors Are Tracked

### 1. Individual Event Failures (Within a Batch)

**Location:** `google-calendar-batch.service.ts`

Each event operation (create/update) is tracked individually:

```typescript
// google-calendar-batch.service.ts:63-108
const batchResults = await Promise.all(
  batch.map(async event => {
    try {
      const response = await calendar.events.insert({...});

      // SUCCESS: Create event mapping
      await db.setDoc('eventMappings', mappingId, mapping);

      return {
        sourceEventId: event.sourceEventId,
        success: true,        // ✅ Event succeeded
        targetEventId: response.data.id,
        statusCode: response.status,
      };
    } catch (error: any) {
      // FAILURE: Log and return error
      return {
        sourceEventId: event.sourceEventId,
        success: false,       // ❌ Event failed
        statusCode: error.code,
        error: error.message,
      };
    }
  })
);
```

**Result aggregation:**
```typescript
// google-calendar-batch.service.ts:144-148
return {
  successful: 15,   // Number of events that succeeded
  failed: 3,        // Number of events that failed
  results: [...]    // Array of individual results
};
```

**What happens to failed events?**
- ❌ **NOT retried automatically**
- ❌ **NOT tracked in Firestore**
- ✅ **Logged to console**
- ✅ **Returned in API response**

---

### 2. Batch-Level Failures (Entire Batch Crashes)

**Location:** `batch.controller.ts:130-147`

If the entire batch operation fails (network error, auth failure, etc.):

```typescript
// batch.controller.ts:130-147
try {
  const result = await syncEventsBatchPaginated(...);

  await db.updateDoc('batchStates', batchStateId, {
    processedEvents: state.processedEvents + result.processedCount,
    currentPageToken: result.nextPageToken,
    updatedAt: Date.now(),
  });
} catch (error) {
  logger.error('Error in continueBatch:', error);

  // Mark batch as failed in Firestore
  await db.updateDoc('batchStates', batchStateId, {
    status: 'failed',              // ❌ Batch marked as failed
    error: error.message,
    updatedAt: Date.now(),
  });

  res.status(500).json({...});    // Return error to scheduler
}
```

**What happens when a batch fails?**
- ✅ **Batch marked as `status: 'failed'` in Firestore**
- ✅ **Error message saved to `batchStates/{id}.error`**
- ❌ **No automatic retry** - batch sync stops
- ❌ **Remaining pages are NOT processed**

---

### 3. Calendar-Level Failures (Round-Robin)

**Location:** `incremental-sync.service.ts:81-97`

When processing incremental changes, if a calendar fails:

```typescript
// incremental-sync.service.ts:81-97
for (const watch of pendingWatches) {
  try {
    await syncEventsBatchPaginated(...);

    // SUCCESS: Clear pending flag
    await db.updateDoc('watches', watch.channelId, {
      pendingChanges: false,
      lastSyncedAt: Date.now(),
      'syncState.status': 'completed',
    });

    processed++;
  } catch (error: any) {
    // FAILURE: Keep pendingChanges=true to retry next cycle
    await db.updateDoc('watches', watch.channelId, {
      'syncState.status': 'pending',     // Reset to pending
      'syncState.error': error.message,  // Save error
    });

    // ⚠️ pendingChanges STAYS TRUE - will retry next scheduler run

    failed++;
    errors.push({
      calendarId: watch.calendarId,
      error: error.message,
    });
  }
}
```

**Result returned to scheduler:**
```typescript
return {
  processed: 3,   // Calendars that synced successfully
  failed: 1,      // Calendars that failed
  errors: [       // Details of failures
    { calendarId: "primary", error: "Rate limit exceeded" }
  ]
};
```

**What happens when calendar sync fails?**
- ✅ **`pendingChanges=true` flag STAYS SET**
- ✅ **Error saved to `syncState.error`**
- ✅ **Automatic retry on next scheduler run (15 min)**
- ✅ **Other calendars continue processing**

---

## How Scheduler Knows About Success/Failure

### Scheduler Receives HTTP Response

```typescript
// scheduler.controller.ts:17-31
export async function runIncrementalSync(_req: Request, res: Response) {
  try {
    const result = await processIncrementalChanges();

    // SUCCESS: Return stats
    res.status(200).json({
      success: true,
      message: 'Incremental sync completed',
      processed: 3,    // ✅ How many calendars succeeded
      failed: 1,       // ❌ How many calendars failed
      errors: [...]    // Details of failures
    });
  } catch (error) {
    // CATASTROPHIC FAILURE: Entire scheduler run crashed
    res.status(500).json({
      error: 'Incremental sync failed'
    });
  }
}
```

**Cloud Scheduler sees:**
- ✅ **HTTP 200** = Scheduler run completed (even if some calendars failed)
- ❌ **HTTP 500** = Catastrophic failure (entire run crashed)

**Important:** Even if some calendars fail (HTTP 200 + `failed: 1`), the scheduler considers the run **successful** because the code handled the error gracefully.

---

## What Gets Stored in Firestore

### batchStates Collection

```typescript
batchStates/{batchStateId} = {
  userId: "user123",
  calendarId: "primary",
  targetCalendarId: "target@gmail.com",

  // Progress
  batchNumber: 3,
  processedEvents: 150,
  failedEvents: 5,              // ⚠️ This field exists but ISN'T POPULATED!

  // Pagination
  currentPageToken: "page4token",
  initialSyncToken: "syncXYZ",

  // Status
  status: "processing",         // pending | processing | completed | failed
  error: "Rate limit exceeded", // Only set if entire batch crashes

  // Timestamps
  createdAt: 1234567890,
  updatedAt: 1234567891,
  completedAt: 1234567892,
}
```

**Problem:** `failedEvents` counter exists but **is never incremented**!

### watches Collection

```typescript
watches/{channelId} = {
  userId: "user123",
  calendarId: "primary",
  targetCalendarId: "target@gmail.com",

  // Incremental sync flags
  pendingChanges: true,         // ⚠️ Stays true if sync failed
  lastChangeNotification: 1234567890,
  lastSyncedAt: 1234567891,

  // Sync state
  syncState: {
    status: "pending",          // pending | syncing | completed
    startedAt: 1234567890,
    completedAt: null,
    processedEvents: 150,
    error: "Auth token expired" // ⚠️ Last error message
  },

  // Sync token for incremental updates
  syncToken: "syncABC123",
  syncTokenUpdatedAt: 1234567892,
}
```

**How scheduler uses this:**
- Reads `pendingChanges=true` → knows to process this calendar
- After success: Sets `pendingChanges=false`
- After failure: **Leaves `pendingChanges=true`** → auto-retry next run

---

## Critical Gaps in Error Handling

### ❌ Gap 1: No Failed Event Retry

**Problem:**
```typescript
// google-calendar-batch.service.ts returns:
{
  successful: 47,
  failed: 3,      // ⚠️ These 3 events are LOST
  results: [
    { sourceEventId: "evt1", success: false, error: "Network timeout" },
    { sourceEventId: "evt2", success: false, error: "Invalid event" },
    { sourceEventId: "evt3", success: false, error: "Calendar full" },
  ]
}
```

**Current behavior:**
- Failed events are logged
- Batch continues with other events
- **No retry mechanism**
- **No tracking of which events failed**

**What SHOULD happen:**
1. Store failed event IDs in Firestore
2. Create retry task (with exponential backoff)
3. Limit retries (max 3 attempts)
4. After max retries, save to "permanently failed" collection

---

### ❌ Gap 2: Batch State Doesn't Track Failed Events

**Problem:**
```typescript
// batch-sync.service.ts:84-90
if (createOps.length > 0) {
  await batchCreateEvents(userId, targetCalendarId, createOps);
  // ⚠️ Result has { successful: 47, failed: 3 } but we ignore it!
}

if (updateOps.length > 0) {
  await batchUpdateEvents(userId, targetCalendarId, updateOps);
  // ⚠️ Same problem - ignoring failed count!
}
```

**Fix needed:**
```typescript
if (createOps.length > 0) {
  const result = await batchCreateEvents(userId, targetCalendarId, createOps);

  // Update batch state with failures
  await db.updateDoc('batchStates', batchStateId, {
    failedEvents: (state.failedEvents || 0) + result.failed
  });

  // Store failed event IDs for retry
  if (result.failed > 0) {
    const failedIds = result.results
      .filter(r => !r.success)
      .map(r => r.sourceEventId);

    await db.updateDoc('batchStates', batchStateId, {
      failedEventIds: [...(state.failedEventIds || []), ...failedIds]
    });
  }
}
```

---

### ❌ Gap 3: No Visibility into Partial Failures

**Problem:**
Scheduler sees:
```json
{
  "success": true,
  "processed": 3,
  "failed": 0
}
```

But doesn't know that **within those 3 calendars**, 15 events actually failed!

**Fix needed:**
Return more detailed stats:
```json
{
  "success": true,
  "calendars": {
    "processed": 3,
    "failed": 0
  },
  "events": {
    "processed": 150,
    "succeeded": 135,
    "failed": 15
  },
  "failures": [
    { "calendarId": "primary", "eventId": "evt1", "error": "Network timeout" },
    { "calendarId": "primary", "eventId": "evt2", "error": "Invalid event" }
  ]
}
```

---

### ❌ Gap 4: Failed Batches Don't Resume

**Problem:**
```
Batch 1: ✅ Process 50 events
Batch 2: ✅ Process 50 events
Batch 3: ❌ CRASH (network error)
Batch 4: ⏸️  NEVER RUNS (batch marked failed, stops)
```

**Current state in Firestore:**
```typescript
batchStates/{id} = {
  status: "failed",
  processedEvents: 100,      // Only processed 2 batches
  currentPageToken: "page3", // Token to resume, but never used
  error: "Network timeout"
}
```

**Fix needed:**
- Scheduler should check for `status: 'failed'` batches
- Retry from `currentPageToken`
- Implement exponential backoff
- Max retry attempts

---

## Retry Strategy: What's Missing

### Current State: TODO Stubs

```typescript
// cloud-tasks.service.ts:101-107
export async function createRetryTask(
  userId: string,
  failedEventIds: string[],
  attempt: number
): Promise<string> {
  // TODO: Implementation
}

// batch.controller.ts:158-160
export async function retryFailedEvents(req: Request, res: Response): Promise<void> {
  // TODO: Implementation
}
```

### Recommended Implementation

```typescript
// New type in batch.types.ts
export interface FailedEventRetry {
  userId: string;
  calendarId: string;
  targetCalendarId: string;
  eventId: string;
  attempt: number;           // 1, 2, 3 (max 3)
  lastAttemptAt: number;
  error: string;
  status: 'pending' | 'retrying' | 'abandoned';
}

// Firestore collection
failedEvents/{userId}_{eventId} = {
  userId: "user123",
  calendarId: "primary",
  targetCalendarId: "target@gmail.com",
  eventId: "evt123",
  attempt: 1,
  lastAttemptAt: 1234567890,
  error: "Network timeout",
  status: "pending",
  nextRetryAt: 1234567950  // Exponential backoff
}
```

**Retry schedule:**
- Attempt 1: Immediate
- Attempt 2: 5 minutes later
- Attempt 3: 15 minutes later
- After 3 failures: Mark as `status: 'abandoned'`

---

## Scheduler's View: Success vs Failure

### ✅ Scheduler Run Succeeds (HTTP 200)

```json
{
  "success": true,
  "processed": 5,    // 5 calendars synced
  "failed": 1,       // 1 calendar failed (will retry next run)
  "errors": [
    { "calendarId": "work@gmail.com", "error": "Rate limit exceeded" }
  ]
}
```

**Cloud Scheduler interprets this as:** ✅ Success (next run in 15 min)

**What actually happened:**
- 5 calendars processed successfully
- 1 calendar failed (but will auto-retry because `pendingChanges=true`)
- Inside those 5 successful calendars, **some events might have failed** (scheduler doesn't know!)

---

### ❌ Scheduler Run Fails (HTTP 500)

```json
{
  "error": "Incremental sync failed",
  "message": "Firestore unavailable"
}
```

**Cloud Scheduler interprets this as:** ❌ Failure

**What actually happened:**
- Catastrophic failure (DB down, auth expired, code crash)
- **Nothing** was processed
- Scheduler will retry based on retry config (exponential backoff)

---

## Summary Table

| Failure Type | Detected? | Tracked in Firestore? | Auto-Retry? | Max Retries? | Visibility |
|--------------|-----------|----------------------|-------------|--------------|------------|
| **Individual event fails** | ✅ Yes | ❌ No | ❌ No | N/A | Logs only |
| **Batch crashes** | ✅ Yes | ✅ Yes (`status: failed`) | ❌ No | N/A | Firestore + HTTP 500 |
| **Calendar sync fails** | ✅ Yes | ✅ Yes (`syncState.error`) | ✅ Yes (15 min) | ♾️ Forever | Firestore + HTTP 200 |
| **Scheduler run crashes** | ✅ Yes | ❌ No | ✅ Yes (GCP handles) | ⚙️ Configurable | Cloud Scheduler logs |

---

## Recommendations

### 1. Track Failed Events

Update `batch-sync.service.ts` to track individual event failures:

```typescript
const createResult = await batchCreateEvents(userId, targetCalendarId, createOps);
const updateResult = await batchUpdateEvents(userId, targetCalendarId, updateOps);

// Track failures
const allFailures = [
  ...createResult.results.filter(r => !r.success),
  ...updateResult.results.filter(r => !r.success),
];

if (allFailures.length > 0) {
  // Save to Firestore for retry
  for (const failure of allFailures) {
    await db.setDoc('failedEvents', `${userId}_${failure.sourceEventId}`, {
      userId,
      calendarId: sourceCalendarId,
      targetCalendarId,
      eventId: failure.sourceEventId,
      error: failure.error,
      attempt: 1,
      lastAttemptAt: Date.now(),
      status: 'pending',
    });
  }
}
```

### 2. Implement Retry Task

Create a separate scheduler job that runs every 30 minutes:

```bash
gcloud scheduler jobs create http retry-failed-events \
  --schedule="*/30 * * * *" \
  --uri="${TUNNEL_URL}/scheduler/retry-failed" \
  --http-method=POST
```

### 3. Add Failed Event Count to Responses

Update scheduler controller to return event-level stats:

```typescript
res.status(200).json({
  success: true,
  calendars: { processed: 3, failed: 1 },
  events: {
    processed: 150,
    succeeded: 135,
    failed: 15  // ← NEW: Show event failures
  },
  errors: [...]
});
```

### 4. Dashboard Visibility

Create a Firestore query endpoint:

```typescript
GET /admin/failed-events?userId=user123

Response:
{
  "total": 15,
  "byCalendar": {
    "primary": 10,
    "work@gmail.com": 5
  },
  "events": [
    {
      "eventId": "evt123",
      "calendarId": "primary",
      "attempt": 2,
      "error": "Network timeout",
      "nextRetryAt": 1234567950
    }
  ]
}
```

---

## Local Development Testing

### Simulate Event Failure

Temporarily modify `google-calendar-batch.service.ts`:

```typescript
// Force 20% of events to fail for testing
if (Math.random() < 0.2) {
  throw new Error('Simulated failure for testing');
}
```

### Check Firestore

After running batch sync:
```
batchStates/{id}:
  failedEvents: 8
  failedEventIds: ["evt1", "evt2", ...]

failedEvents/{userId}_{eventId}:
  status: "pending"
  attempt: 1
```

### Monitor Logs

```
[INFO] Batch create complete: 42 successful, 8 failed
[WARN] Failed to create event evt1: Network timeout
[INFO] Saved 8 failed events for retry
```
