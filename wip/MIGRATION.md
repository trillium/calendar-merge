# Batch Sync Migration: Parallel → Round-Robin

## Problem Statement

Current implementation spawns parallel batch sync tasks (one per calendar), causing:
- **Rate limit errors**: 3 calendars × 2.8 req/sec = 8.4 req/sec (exceeds Google's 10/sec limit)
- **No retry mechanism**: Failed events are logged but not retried
- **Incomplete syncs**: Users end up with missing events in target calendar

## Current Architecture

### Flow
```
Setup → createCalendarWatch(cal1) → enqueueBatchSync(channelId1)
     → createCalendarWatch(cal2) → enqueueBatchSync(channelId2)
     → createCalendarWatch(cal3) → enqueueBatchSync(channelId3)

→ 3 Cloud Tasks created
→ 3 batchSync instances run in parallel
→ Each self-enqueues next batch independently
```

### Issues
1. Parallel execution causes quota exhaustion
2. Each calendar operates independently (no coordination)
3. Failed events are not tracked or retried
4. Doesn't scale (10 calendars = 10× worse)

---

## New Architecture: Round-Robin Batch Sync

### Single Task Coordination

```
Setup → createCalendarWatch(cal1) → store in Firestore
     → createCalendarWatch(cal2) → store in Firestore
     → createCalendarWatch(cal3) → store in Firestore
     → createSyncCoordination(userId) → store coordination state
     → enqueueBatchSync(userId) → 1 Cloud Task

→ 1 batchSync instance
→ Processes calendars in round-robin order
→ Cal1 batch → Cal2 batch → Cal3 batch → Cal1 batch → ...
```

### Key Changes

1. **Single Cloud Task** per user (not per calendar)
2. **Firestore coordination document** tracks current calendar index
3. **Round-robin processing** ensures fair progress across all calendars
4. **Failed events queue** for retry with exponential backoff

---

## Data Model Changes

### New: Coordination Document

**Storage:** Nested field in existing `users/{userId}` document

```typescript
// Document path: users/{userId}
// Access via: firestore.doc(`users/${userId}`)
{
  // Existing user fields (tokens, email, config, etc.)
  ...

  // NEW: Sync coordination state (nested object)
  syncCoordination: {
    currentIndex: number,        // Which calendar to process next (0-based index into channelIds array)
    channelIds: string[],        // Array of watch channelIds to sync in round-robin order
    status: 'running' | 'complete' | 'failed',  // Overall sync status
    createdAt: Timestamp,        // When sync started
    lastIterationAt: Timestamp,  // Last time a batch was processed
    iterationCount: number,      // Number of batches processed (safety: prevent infinite loops)
  }
}
```

**Code examples:**
```typescript
// Read
const userDoc = await firestore.doc(`users/${userId}`).get();
const syncCoord = userDoc.data()?.syncCoordination;

// Update
await firestore.doc(`users/${userId}`).update({
  'syncCoordination.currentIndex': 1,
  'syncCoordination.iterationCount': FieldValue.increment(1)
});
```

**channelId Format:**
- Base64-encoded string: `Buffer.from(${userId}-${calendarId}-${timestamp}).toString('base64')`
- Example: `MTE1Njk5NjE0MDQzNTkzNTMxMDU2LXRyaWxsaXVtQGhhdHNmYWJ1bG91cy5jb20tMTc2MTQyNDM4NjkwMw==`
- Created in `watch.ts:32`
- Stored as document ID in `watches/{channelId}`

### Modified: Watch Document

**Document Path:** `watches/{channelId}`

```typescript
{
  // Existing fields...
  syncState: {
    status: 'pending' | 'syncing' | 'complete' | 'failed',
    eventsSynced: number,
    pageToken: string | null,
    timeMax: string,

    // NEW: Retry tracking
    failedEvents: string[],     // Event IDs that failed
    retryCount: number,          // Times this watch has been retried
    lastError: string | null,    // Last error message
    lastErrorAt: Timestamp | null,
  }
}
```

---

## Important Terminology: pageToken vs syncToken

**pageToken** - Used for pagination within a single request:
- Returned by `events.list()` when there are more results
- Only valid for the current query parameters
- Expires after ~1 hour
- Used like: `events.list({ pageToken: 'abc123' })` → gets next 50 events

**syncToken** - Used for incremental syncing:
- Returned by `events.list()` on the **final page** of results
- Represents "sync point in time"
- Used for future webhook-triggered syncs to get only changed events
- More stable than pageToken
- Used like: `events.list({ syncToken: 'xyz789' })` → gets only events changed since last sync

**In batch sync:**
- We use `pageToken` to iterate through all pages (batch 1, 2, 3...)
- On the **last page**, Google returns `nextSyncToken` (not nextPageToken)
- We save that `syncToken` for future webhook syncs

---

## Implementation Plan

### Phase 1: Add Coordination (No Breaking Changes)

**Files to modify:**
- `functions/calendar-sync/watch.ts`
- `nextjs/app/api/setup/route.ts`

**Current Flow:**
```javascript
// POST /api/setup (current)
for (const calendarId of sourceCalendars) {
  await createCalendarWatch(userId, calendarId, webhookUrl, targetCalendar);
  // ↓ createCalendarWatch internally calls:
  // ↓ enqueueBatchSync(channelId, 5)
  // ↓ This creates 1 Cloud Task per calendar
}
// Result: 3 calendars = 3 parallel tasks
```

**New Flow:**
```javascript
// POST /api/setup (new)
const channelIds = [];
for (const calendarId of sourceCalendars) {
  const channelId = await createCalendarWatch(userId, calendarId, webhookUrl, targetCalendar);
  // ↑ Modified: doesn't call enqueueBatchSync anymore
  channelIds.push(channelId);
}

// Create coordination after all watches exist
await createSyncCoordination(userId, channelIds);

// Enqueue ONE task for round-robin processing
await enqueueBatchSync(userId, 5);

// Result: 3 calendars = 1 task (round-robin)
```

**Changes:**
1. **Modify** `createCalendarWatch()` - remove `enqueueBatchSync()` call, return `channelId`
2. **Add** new function: `createSyncCoordination(userId, channelIds)`
3. **Modify** `POST /api/setup` - collect channelIds from all watches
4. **Modify** `POST /api/setup` - call `createSyncCoordination()` after all watches created
5. **Modify** `POST /api/setup` - call `enqueueBatchSync(userId)` once at end

**Deployment:** Can deploy without breaking existing syncs (new field ignored)

---

### Phase 2: Modify batchSync Function

**Files to modify:**
- `functions/calendar-sync/batchSync.ts`
- `functions/calendar-sync/index.ts`

**Changes:**

#### New function signature:
```typescript
// OLD
export async function batchSync(req: Request, res: Response)
  → Extract channelId from body
  → batchSyncEvents(channelId)

// NEW
export async function batchSync(req: Request, res: Response)
  → Extract userId from body
  → batchSyncRoundRobin(userId)
```

#### New round-robin logic:
```typescript
async function batchSyncRoundRobin(userId: string) {
  // 1. Read coordination state and get next channelId to process (atomic transaction)
  const userRef = firestore.doc(`users/${userId}`);

  const channelId = await firestore.runTransaction(async (tx) => {
    const userDoc = await tx.get(userRef);
    const syncCoord = userDoc.data()?.syncCoordination;

    if (!syncCoord) {
      throw new Error('Sync coordination not found');
    }

    const { currentIndex, channelIds, iterationCount } = syncCoord;

    // Safety: max iterations check
    if (iterationCount > 2000) {
      throw new Error('Max iterations exceeded');
    }

    // 2. Get current watch to process
    const currentChannelId = channelIds[currentIndex];

    // 3. Increment index for next iteration (round-robin)
    const nextIndex = (currentIndex + 1) % channelIds.length;

    // 4. Update coordination state atomically
    tx.update(userRef, {
      'syncCoordination.currentIndex': nextIndex,
      'syncCoordination.lastIterationAt': FieldValue.serverTimestamp(),
      'syncCoordination.iterationCount': iterationCount + 1,
    });

    // 5. Return channelId from transaction
    return currentChannelId;
  });

  // channelId is now the value returned from the transaction

  // 6. Process 1 batch for this calendar
  await processSingleBatch(channelId);

  // 7. Get current state to check if all calendars complete
  const userDoc = await userRef.get();
  const channelIds = userDoc.data()?.syncCoordination?.channelIds || [];

  // 8. Check if all calendars complete
  const allComplete = await checkAllComplete(channelIds);

  if (!allComplete) {
    // 9. Enqueue next iteration with delay between batches
    // 2 second delay allows rate limits to reset and reduces API pressure
    await enqueueBatchSync(userId, 2);
  } else {
    // 10. All calendars complete - mark coordination as complete
    await userRef.update({
      'syncCoordination.status': 'complete'
    });
    console.log('All calendars synced!');
  }
}
```

#### Helper functions:
```typescript
async function processSingleBatch(channelId: string) {
  // Existing batchSyncEvents logic, but for 1 batch only
  // - Check if watch is complete → skip
  // - Check if watch has failed too many times → mark failed, skip
  // - Process 1 batch (50 events)
  // - Track failed events
  // - Update pageToken
}

async function checkAllComplete(channelIds: string[]): Promise<boolean> {
  const watches = await Promise.all(
    channelIds.map(id => firestore.doc(`watches/${id}`).get())
  );

  return watches.every(w => {
    const status = w.data()?.syncState?.status;
    return status === 'complete' || status === 'failed';
  });
}
```

**Deployment:** BREAKING - Must coordinate with Phase 1

---

### Phase 3: Add Retry Logic

**Files to modify:**
- `functions/calendar-sync/sync.ts`
- `functions/calendar-sync/batchSync.ts`

**Changes:**

#### Track quota errors:
```typescript
// In syncEvent()
export async function syncEvent(...): Promise<{success: boolean, eventId?: string}> {
  try {
    // ... existing logic
    return { success: true };
  } catch (error: any) {
    // Check for quota error
    if (error.code === 403 && error.message.includes('Quota exceeded')) {
      console.log(`Quota error for event ${sourceEventId}, will retry`);
      return { success: false, eventId: sourceEventId };
    }

    // Other errors - log and continue
    console.error(`Error syncing event ${sourceEventId}:`, error);
    return { success: false };
  }
}
```

#### Collect failed events:
```typescript
// In processSingleBatch()
const failedEvents: string[] = [];

for (const event of events) {
  const result = await syncEvent(...);
  if (!result.success && result.eventId) {
    failedEvents.push(result.eventId);
  }
  await sleep(RATE_LIMIT_DELAY_MS);
}

// Store failed events for retry
if (failedEvents.length > 0) {
  await watchDoc.ref.update({
    'syncState.failedEvents': FieldValue.arrayUnion(...failedEvents)
  });
}
```

#### Retry failed events (exponential backoff):
```typescript
// At start of next batch for this calendar
const watchData = watchDoc.data();
const failedEvents = watchData.syncState?.failedEvents || [];

if (failedEvents.length > 0 && retryCount < 5) {
  console.log(`Retrying ${failedEvents.length} failed events`);

  const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 30000);
  await sleep(backoffDelay);

  const retriedSuccess: string[] = [];
  for (const eventId of failedEvents) {
    const result = await syncEvent(calendarId, eventId, ...);
    if (result.success) {
      retriedSuccess.push(eventId);
    }
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  // Remove successfully retried events
  await watchDoc.ref.update({
    'syncState.failedEvents': failedEvents.filter(id => !retriedSuccess.includes(id)),
    'syncState.retryCount': retryCount + 1,
  });
}
```

**Deployment:** Safe to deploy incrementally

---

### Phase 4: Safety Mechanisms

**Add timeouts and limits:**

```typescript
// Max retry attempts per watch
const MAX_RETRY_COUNT = 5;

// Max time a sync can run
const MAX_SYNC_DURATION_MS = 60 * 60 * 1000; // 1 hour

// Max iterations - calculated based on worst case:
// Assume: 10 calendars × 5000 events each × 50 events/batch = 1000 batches
// Add 50% buffer for retries = 1500
// Round up to 2000 for safety
const MAX_ITERATIONS = 2000;

// Check in processSingleBatch()
if (watchData.syncState.retryCount >= MAX_RETRY_COUNT) {
  await watchDoc.ref.update({
    'syncState.status': 'failed',
    'syncState.lastError': 'Max retries exceeded',
  });
  return; // Skip this calendar
}

// Check in batchSyncRoundRobin()
const syncStartTime = coordData.createdAt.toMillis();
if (Date.now() - syncStartTime > MAX_SYNC_DURATION_MS) {
  throw new Error('Sync timeout - has been running for over 1 hour');
}

if (iterationCount > MAX_ITERATIONS) {
  throw new Error(`Max iterations (${MAX_ITERATIONS}) exceeded - possible infinite loop`);
}
```

**Skip completed calendars:**
```typescript
async function getNextWatchToProcess(channelIds: string[], startIndex: number) {
  let checked = 0;
  let currentIndex = startIndex;

  while (checked < channelIds.length) {
    const channelId = channelIds[currentIndex];
    const watch = await firestore.doc(`watches/${channelId}`).get();
    const status = watch.data()?.syncState?.status;

    if (status !== 'complete' && status !== 'failed') {
      return { channelId, index: currentIndex };
    }

    currentIndex = (currentIndex + 1) % channelIds.length;
    checked++;
  }

  // All complete or failed
  return null;
}
```

---

## Critical Edge Cases & Solutions

### User Stops Sync Mid-Process

**Problem:** User clicks "Stop & Unsubscribe" while sync running
- Watches deleted from Firestore
- Next iteration references deleted channelIds
- Error: Watch not found

**Solution:**
```typescript
async function processSingleBatch(channelId: string) {
  const watchDoc = await firestore.doc(`watches/${channelId}`).get();

  if (!watchDoc.exists) {
    console.log(`Watch ${channelId} deleted by user, removing from coordination`);
    // Remove from coordination channelIds array
    await removeFromCoordination(channelId);
    return;
  }

  // Continue processing...
}

async function removeFromCoordination(channelId: string) {
  const userId = await getUserIdFromChannelId(channelId);
  const coordRef = firestore.doc(`users/${userId}`);

  await firestore.runTransaction(async (tx) => {
    const userDoc = await tx.get(coordRef);
    const syncCoord = userDoc.data()?.syncCoordination;
    const channelIds = syncCoord.channelIds.filter(id => id !== channelId);

    tx.update(coordRef, {
      'syncCoordination.channelIds': channelIds
    });
  });
}

// Helper: Extract userId from channelId (which is base64-encoded)
function getUserIdFromChannelId(channelId: string): string {
  // channelId format: base64(`${userId}-${calendarId}-${timestamp}`)
  // Example encoded: MTE1Njk5NjE0MDQzNTkzNTMxMDU2LXRyaWxsaXVtQGhhdHNmYWJ1bG91cy5jb20tMTc2MTQyNDM4NjkwMw==
  // Example decoded: 115699614043593531056-trillium@hatsfabulous.com-1761424386903
  // See watch.ts:32 where this is created

  const decoded = Buffer.from(channelId, 'base64').toString('utf-8');
  const userId = decoded.split('-')[0];
  return userId;

  // Alternative: Query Firestore (slower but more reliable if encoding changes)
  // const watchDoc = await firestore.doc(`watches/${channelId}`).get();
  // return watchDoc.data()?.userId;
}
```

---

### OAuth Tokens Revoked

**Problem:** User revokes OAuth access mid-sync
- `getAuthClient()` fails for ALL calendars
- All syncs stuck in 'syncing' state forever

**Solution:**
```typescript
async function processSingleBatch(channelId: string) {
  try {
    const watchData = watchDoc.data();
    const auth = await getAuthClient(watchData.userId);
    // Continue processing...
  } catch (error: any) {
    if (error.message.includes('tokens') || error.message.includes('No tokens found')) {
      console.error(`OAuth tokens invalid for user ${watchData.userId}`);

      // Mark ALL watches for this user as failed
      await markAllUserWatchesFailed(
        watchData.userId,
        'OAuth tokens invalid or revoked'
      );

      throw new Error('OAuth tokens invalid - stopping sync');
    }
    throw error;
  }
}

async function markAllUserWatchesFailed(userId: string, errorMessage: string) {
  const watches = await firestore
    .collection('watches')
    .where('userId', '==', userId)
    .get();

  const batch = firestore.batch();
  watches.docs.forEach(doc => {
    batch.update(doc.ref, {
      'syncState.status': 'failed',
      'syncState.lastError': errorMessage,
      'syncState.lastErrorAt': FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
}
```

---

### PageToken Expiration

**Problem:** PageToken expires (Google TTL ~1 hour)
- Calendar has 1000 events
- Sync takes 30 minutes
- pageToken becomes invalid mid-sync
- Error: Invalid pageToken

**Solution:**
```typescript
async function fetchEventBatch(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  syncState: any
) {
  try {
    const response = await calendar.events.list({
      calendarId,
      timeMin: new Date().toISOString(),
      timeMax: syncState.timeMax,
      maxResults: 50,
      pageToken: syncState.pageToken,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return response;
  } catch (error: any) {
    // PageToken expired or invalid
    if (error.code === 410 || error.message.includes('pageToken')) {
      console.log('PageToken expired, restarting sync from beginning');

      // Restart from beginning
      const response = await calendar.events.list({
        calendarId,
        timeMin: new Date().toISOString(),
        timeMax: syncState.timeMax,
        maxResults: 50,
        pageToken: null, // No token - start fresh
        singleEvents: true,
        orderBy: 'startTime',
      });

      // Reset sync state
      await watchDoc.ref.update({
        'syncState.pageToken': null,
        // Keep eventsSynced count - event mappings (using sourceCalendarId_sourceEventId
        // as unique keys) prevent duplicate event creation during re-processing
      });

      return response;
    }

    throw error;
  }
}
```

---

### Calendar Deleted (404 Errors)

**Problem:** Source or target calendar deleted mid-sync
- Source deleted: events.list() returns 404
- Target deleted: events.insert() returns 404
- Sync stuck retrying forever

**Solution:**
```typescript
// Source calendar deleted
async function fetchEventBatch(...) {
  try {
    const response = await calendar.events.list({...});
    return response;
  } catch (error: any) {
    if (error.code === 404) {
      console.error(`Source calendar ${calendarId} not found (deleted?)`);

      await watchDoc.ref.update({
        'syncState.status': 'failed',
        'syncState.lastError': 'Source calendar not found (may have been deleted)',
        'syncState.lastErrorAt': FieldValue.serverTimestamp(),
      });

      return null; // Signal to skip this calendar
    }
    throw error;
  }
}

// Target calendar deleted
async function syncEvent(...) {
  try {
    await calendarClient.events.insert({
      calendarId: targetCalendarId,
      requestBody: eventData,
    });
  } catch (error: any) {
    if (error.code === 404 && error.message.includes(targetCalendarId)) {
      console.error(`Target calendar ${targetCalendarId} not found (deleted?)`);

      // Fail ALL watches using this target calendar
      const watches = await firestore
        .collection('watches')
        .where('targetCalendarId', '==', targetCalendarId)
        .get();

      const batch = firestore.batch();
      watches.docs.forEach(doc => {
        batch.update(doc.ref, {
          'syncState.status': 'failed',
          'syncState.lastError': 'Target calendar deleted',
          'syncState.lastErrorAt': FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();

      throw new Error('Target calendar not found - stopping sync');
    }
    throw error;
  }
}
```

---

### Task Deduplication

**Problem:** Multiple tasks might be created for same user
- User double-clicks "Configure Sync"
- Or function error causes retry
- 2+ tasks running simultaneously → race conditions

**Solution:**
```typescript
// Use deterministic task names based on userId + iteration
async function enqueueBatchSync(userId: string, delaySeconds: number) {
  const client = await getTasksClient();
  const projectId = process.env.PROJECT_ID;
  const region = process.env.REGION;

  // Get current iteration count within transaction to ensure uniqueness
  // Note: This happens AFTER the transaction in batchSyncRoundRobin increments it,
  // so we use the already-incremented value
  const coordRef = firestore.doc(`users/${userId}/syncCoordination`);
  const coord = await coordRef.get();
  const iterationCount = coord.data()?.iterationCount || 0;

  // Create unique, deterministic task name based on userId + iteration count
  // This prevents duplicate tasks even if enqueueBatchSync is called multiple times
  const taskName = `projects/${projectId}/locations/${region}/queues/calendar-sync-queue/tasks/sync-${userId}-${iterationCount}`;

  const queuePath = client.queuePath(projectId, region, 'calendar-sync-queue');

  try {
    await client.createTask({
      parent: queuePath,
      task: {
        name: taskName, // Explicit name prevents duplicates
        httpRequest: {
          httpMethod: 'POST',
          url: functionUrl,
          headers: { 'Content-Type': 'application/json' },
          body: Buffer.from(JSON.stringify({ userId })).toString('base64'),
          oidcToken: {
            serviceAccountEmail: serviceAccountEmail,
            audience: functionUrl,
          },
        },
        scheduleTime: {
          seconds: Math.floor(Date.now() / 1000) + delaySeconds,
        },
      },
    });

    console.log(`Task enqueued: ${taskName}`);
  } catch (error: any) {
    // Task already exists - this can happen if:
    // 1. Previous iteration failed after incrementing iterationCount but before task completed
    // 2. Multiple calls to enqueueBatchSync happened simultaneously
    // This is safe because the existing task will continue processing
    if (error.code === 6) { // ALREADY_EXISTS
      console.log(`Task ${taskName} already exists, skipping duplicate`);
      return;
    }
    throw error;
  }
}

/**
 * Note on Task Deduplication Edge Case:
 *
 * If iteration N completes, increments count to N+1, and enqueues task for N+1,
 * but then the Cloud Function crashes before task N+1 runs, we could have:
 * - iterationCount = N+1 in Firestore
 * - Task N+1 never ran
 *
 * When we retry/restart:
 * - Read iterationCount (N+1)
 * - Try to create task for iteration N+1
 * - Get ALREADY_EXISTS error
 * - Skip (OK - task N+1 will eventually run)
 *
 * This is handled correctly by the ALREADY_EXISTS check above.
 */
}

// Prevent double-setup
async function createSyncCoordination(userId: string, channelIds: string[]) {
  const userRef = firestore.doc(`users/${userId}`);

  const existing = await userRef.get();
  if (existing.exists) {
    const syncCoord = existing.data()?.syncCoordination;
    if (syncCoord?.status === 'running') {
      throw new Error('Sync already in progress for this user');
    }
  }

  // Store coordination as nested object in user document
  await userRef.set({
    syncCoordination: {
      currentIndex: 0,
      channelIds,  // Array of watch channelIds
      status: 'running',
      createdAt: FieldValue.serverTimestamp(),
      lastIterationAt: FieldValue.serverTimestamp(),
      iterationCount: 0,
    }
  }, { merge: true }); // merge: true preserves other user fields like tokens, config
}
```

---

### Empty Calendar

**Problem:** Calendar has 0 future events
- events.list() returns empty items array
- Need to mark as complete immediately

**Solution:**
```typescript
async function processSingleBatch(channelId: string) {
  // ... fetch events ...

  const events = response.data.items || [];

  if (events.length === 0 && response.data.nextSyncToken) {
    // Calendar is empty or all events synced
    // Note: nextSyncToken (not pageToken) indicates this is the final page
    // and we can use this token for future incremental syncs via webhook
    console.log(`Calendar ${channelId} has no events, marking complete`);

    await watchDoc.ref.update({
      'syncState.status': 'complete',
      'syncToken': response.data.nextSyncToken,
      'syncState.pageToken': null,
    });

    return; // Done with this calendar
  }

  // Otherwise process events...
}
```

---

### All Calendars Fail Immediately

**Problem:** All calendars fail in first batch (e.g., bad OAuth)
- checkAllComplete() returns true
- Sync marked as "complete" but nothing actually synced
- User thinks it worked

**Solution:**
```typescript
async function checkAllComplete(channelIds: string[]): Promise<boolean> {
  const watches = await Promise.all(
    channelIds.map(id => firestore.doc(`watches/${id}`).get())
  );

  const allDone = watches.every(w => {
    const status = w.data()?.syncState?.status;
    return status === 'complete' || status === 'failed';
  });

  if (allDone) {
    // Check if ANY events were actually synced
    const hasAnySuccess = watches.some(w => {
      const eventsSynced = w.data()?.syncState?.eventsSynced || 0;
      return eventsSynced > 0;
    });

    const allFailed = watches.every(w => {
      const status = w.data()?.syncState?.status;
      return status === 'failed';
    });

    if (allFailed) {
      console.error('All calendars failed - no events synced');
      throw new Error('All calendars failed - check OAuth tokens and calendar access');
    }

    if (!hasAnySuccess) {
      console.warn('Sync complete but no events were synced');
    }
  }

  return allDone;
}
```

---

### Very Large Event Descriptions

**Problem:** Event has huge description (>1MB)
- Firestore doc size limit: 1MB
- event_mapping write fails
- Sync stuck

**Solution:**
```typescript
async function syncEvent(...) {
  // ... fetch source event ...

  const MAX_DESCRIPTION_LENGTH = 10000; // characters

  const eventData = {
    summary: `[${calendarName}] ${sourceEvent.data.summary || '(No title)'} - ${busyStatus}`,
    description: sourceEvent.data.description,
    start: sourceEvent.data.start,
    end: sourceEvent.data.end,
    location: sourceEvent.data.location,
    status: sourceEvent.data.status,
    transparency,
    visibility: 'private',
  };

  // Truncate description if too large
  if (eventData.description && eventData.description.length > MAX_DESCRIPTION_LENGTH) {
    console.warn(`Event ${sourceEventId} has large description (${eventData.description.length} chars), truncating`);
    eventData.description =
      eventData.description.substring(0, MAX_DESCRIPTION_LENGTH) +
      '\n\n[Description truncated due to length]';
  }

  // ... continue syncing ...
}
```

---

## Migration Steps

### Before Migration
1. ✅ Create this document
2. ⬜ Review with team
3. ⬜ Create feature branch: `feat/round-robin-batch-sync`
4. ⬜ Update tests

### Development
1. ⬜ Implement Phase 1 (coordination setup)
2. ⬜ Implement Phase 2 (round-robin logic)
3. ⬜ Implement Phase 3 (retry logic)
4. ⬜ Implement Phase 4 (safety mechanisms)
5. ⬜ Test with 1, 3, 5, 10 calendars
6. ⬜ Test quota error handling

### Deployment
1. ⬜ Deploy coordination code (Phase 1) to Next.js
2. ⬜ Deploy updated batchSync (Phases 2-4) to Cloud Functions
3. ⬜ Monitor logs for errors
4. ⬜ Test with real user accounts

### Post-Migration
1. ⬜ Monitor sync success rates
2. ⬜ Monitor retry counts
3. ⬜ Check for stuck syncs
4. ⬜ Verify no rate limit errors

---

## Rollback Plan

If issues occur:

1. **Next.js:** Revert to calling `enqueueBatchSync(channelId)` per calendar
2. **Cloud Functions:** Redeploy previous version of batchSync
3. **Cleanup:** Delete orphaned coordination documents

---

## Testing Checklist

- [ ] 1 calendar with 10 events
- [ ] 3 calendars with 50 events each
- [ ] 5 calendars with 200 events each
- [ ] Simulate quota error (mock API)
- [ ] Test with paused calendar mid-sync
- [ ] Test with deleted calendar mid-sync
- [ ] Verify no duplicates created
- [ ] Verify all events synced
- [ ] Test concurrent user setups
- [ ] Measure total sync time vs parallel

---

## Performance Impact (Estimated)

### Current (Parallel)
- 3 calendars × 150 events = 450 events total
- **Estimated** processing time: ~15 minutes (with quota errors and retries)
- **Estimated** success rate: ~85% (some events lost to quota errors)

### New (Round-Robin)
- 3 calendars × 150 events = 450 events total
- **Estimated** processing time: ~25 minutes (sequential but no quota errors)
- **Estimated** success rate: ~100% (retry ensures all events synced)

**Trade-off:** Slower but reliable

**Note:** Actual performance will vary based on:
- Number of calendars
- Events per calendar
- Network latency
- API quota availability
- Event complexity (description size, attachments, etc.)

---

## Open Questions

1. Should we allow users to configure sync priority (which calendar processes first)?
2. Should we show per-calendar progress in the UI?
3. Should we send email notification when sync completes?
4. What happens if user deletes a source calendar mid-sync?
5. Should we add manual "retry failed events" button in UI?

---

## References

- Current batchSync: `functions/calendar-sync/batchSync.ts`
- Current setup: `nextjs/app/api/setup/route.ts`
- Event sync logic: `functions/calendar-sync/sync.ts`
- Google Calendar quota: https://developers.google.com/calendar/api/guides/quota
