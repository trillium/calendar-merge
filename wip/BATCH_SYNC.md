# Batched Initial Sync Architecture

## Problem

When setting up calendar sync, we need to sync all future events (potentially 2500+ events spanning up to 2 years). Processing all events at once causes:
- Cloud Function timeouts (>60 seconds)
- Rate limit exhaustion (10 requests/second limit)
- Poor user experience (setup hangs)

## Solution Overview

Break initial sync into small batches processed asynchronously using Cloud Tasks. Each batch:
- Syncs 50 events (~10-15 seconds)
- Enqueues the next batch with a 2-second delay
- Chains until all events are synced
- Stores progress in Firestore

## Architecture

### Function 1: `createCalendarWatch` (existing, modified)

**Description:** Sets up webhook subscription and kicks off initial sync

**Deployment:** Cloud Function (existing location)

**Triggered by:** User clicking "Start Syncing" button

**Process:**
1. Creates Google Calendar webhook subscription
2. Calculates `timeMax` (2 years from now) for sync window
3. Stores watch data in Firestore with initial `syncState`:
   ```
   syncState: {
     status: 'pending',
     eventsSynced: 0,
     timeMax: '2027-10-25T...'  // 2 years from now
     // Note: NO pageToken or syncToken initially
   }
   ```
4. Enqueues first `batchSync` task via Cloud Tasks (5-second delay)
5. Returns success immediately (no timeout risk)

**Important:** Does NOT fetch events or obtain syncToken - that's handled by the batch sync process.

---

### Function 2: `batchSync` (new)

**Description:** Syncs one batch of events, then chains to next batch

**Deployment:** New Cloud Function

**Triggered by:**
- **Initially:** Cloud Task enqueued by `createCalendarWatch` (5 seconds after setup)
- **Subsequently:** Cloud Task enqueued by itself (2 seconds between batches)

**Process:**
1. Reads watch data from Firestore (includes `pageToken` if not first batch)
2. Fetches 50 events from Google Calendar API:
   - Uses `timeMin: now` and `timeMax: 2 years from now`
   - Uses `pageToken` for pagination (undefined on first batch)
   - Sorts by `startTime`
3. Syncs events one-by-one to target calendar:
   - 150ms delay between events (rate limiting)
   - Creates/updates event mappings in Firestore
4. Updates progress in Firestore:
   - Increments `eventsSynced` counter
   - Updates `lastBatchTime` timestamp
5. **Handles Google's pagination response:**
   - If `response.data.nextPageToken` exists (more pages):
     - Stores `pageToken` in Firestore
     - Enqueues next `batchSync` task (2-second delay)
   - If `response.data.nextSyncToken` exists (final page):
     - Stores `syncToken` in Firestore
     - Marks `syncState.status: 'complete'`
   - **Note:** Google returns ONE or the OTHER, never both

---

### Function 3: `webhook` (existing, unchanged)

**Description:** Handles ongoing incremental syncs after initial sync completes

**Deployment:** Cloud Function (existing location)

**Triggered by:** Google Calendar webhook notifications

**Process:**
- Uses `syncToken` for efficient incremental sync
- Only processes changed/new events
- Fast (typically <5 events per webhook)

---

## Flow Diagram

```
┌─────────────────┐
│   User Setup    │
│  (UI Button)    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ createCalendarWatch()   │
│ - Create webhook        │
│ - Store watch data      │
│ - Enqueue first batch   │
│ - Return success ✓      │
└────────┬────────────────┘
         │ (5 sec delay)
         ▼
┌─────────────────────────┐
│ batchSync() - Batch 1   │
│ - Fetch 50 events       │
│ - Sync to target cal    │
│ - Update progress       │
└────────┬────────────────┘
         │ (2 sec delay)
         ▼
┌─────────────────────────┐
│ batchSync() - Batch 2   │
│ - Fetch next 50 events  │
│ - Sync to target cal    │
│ - Update progress       │
└────────┬────────────────┘
         │ (2 sec delay)
         ▼
         ⋮
         │
         ▼
┌─────────────────────────┐
│ batchSync() - Final     │
│ - Fetch last events     │
│ - Sync to target cal    │
│ - Store syncToken       │
│ - Mark complete ✓       │
└─────────────────────────┘

┌─────────────────────────┐
│   Ongoing Webhooks      │
│ - Incremental sync      │
│ - Uses syncToken        │
│ - Fast updates          │
└─────────────────────────┘
```

## Timing & Performance

### Per Batch
- 50 events × 150ms rate limit = 7.5 seconds
- API calls + processing ≈ 10-15 seconds per batch
- 2 second delay before next batch

### Total Time Examples
| Total Events | Batches | Estimated Time |
|--------------|---------|----------------|
| 100 events   | 2       | ~30 seconds    |
| 500 events   | 10      | ~2.5 minutes   |
| 1000 events  | 20      | ~5 minutes     |
| 2500 events  | 50      | ~12 minutes    |

### Rate Limiting
- **Per event:** 150ms delay = ~6.5 events/second
- **Per batch:** 2 second delay between batches
- **Well under** Google's 10 requests/second limit

## Data Model Changes

### WatchData Interface Addition

```typescript
interface WatchData {
    // ... existing fields (userId, calendarId, channelId, etc.)
    syncToken?: string;  // Existing field - for incremental sync via webhooks

    syncState?: {
        status: 'pending' | 'syncing' | 'complete' | 'failed';
        pageToken?: string;           // For pagination during batch sync
        eventsSynced: number;         // Progress counter
        totalEvents?: number;         // If known
        lastBatchTime?: number;       // Unix timestamp
        timeMax?: string;             // ISO date (2 years from now)
    };
}
```

**Token Usage Clarification:**
- `syncState.pageToken` - Used during batch sync to paginate through events (transient)
- `syncToken` (root level) - Stored after final batch, used by webhooks for incremental updates (permanent)
- Google returns `nextPageToken` on intermediate pages, `nextSyncToken` only on final page

## Benefits

### 1. No Timeouts
- Each batch completes in 10-15 seconds
- Well under Cloud Function timeout limits

### 2. Rate Limit Friendly
- Respects Google's 10 requests/second quota
- Built-in delays prevent exhaustion

### 3. Progress Tracking
- UI can show "Syncing: 450/1000 events" progress
- `syncState` in Firestore provides real-time status

### 4. Resilient
- If a batch fails, can be retried manually
- Each batch is independent and idempotent

### 5. Simple Architecture
- Only 1 new function (`batchSync`)
- Uses existing Cloud Tasks infrastructure
- Minimal changes to existing code

## Security Model

### Authentication Flow

**Cloud Tasks → batchSync Function:**
1. `batchSync` function deployed with `--no-allow-unauthenticated`
2. Cloud Tasks uses service account: `service-PROJECT_NUMBER@gcp-sa-cloudtasks.iam.gserviceaccount.com`
3. Service account granted `roles/cloudfunctions.invoker` permission
4. Cloud Tasks includes OIDC token in request headers
5. Cloud Functions automatically validates token before execution

**Result:** Only Cloud Tasks can invoke `batchSync` - no public access possible.

### Task Creation (enqueueBatchSync)

When creating Cloud Tasks, include OIDC authentication:
```typescript
await client.createTask({
  parent: queuePath,
  task: {
    httpRequest: {
      httpMethod: 'POST',
      url: functionUrl,
      headers: { 'Content-Type': 'application/json' },
      body: Buffer.from(JSON.stringify({ channelId })).toString('base64'),
      oidcToken: {
        serviceAccountEmail: `service-${projectNumber}@gcp-sa-cloudtasks.iam.gserviceaccount.com`,
        audience: functionUrl,
      },
    },
    scheduleTime: {
      seconds: Date.now() / 1000 + delaySeconds,
    },
  },
});
```

## Infrastructure Requirements

### New Components
1. **Cloud Tasks Queue:** `calendar-sync-queue`
   - Required for task chaining
   - Created via Terraform

2. **New Cloud Function:** `batchSync`
   - HTTP trigger (authenticated)
   - Only invokable by Cloud Tasks service account
   - Accepts `{ channelId }` payload

### IAM Permissions Required
- Cloud Tasks service account needs `roles/cloudfunctions.invoker` on `batchSync` function
- Application service account needs `roles/cloudtasks.enqueuer` on queue

### Environment Variables Needed
- `FUNCTION_URL` - Base URL for Cloud Functions (for task enqueueing)
- `PROJECT_ID` - GCP project ID (existing)
- `PROJECT_NUMBER` - GCP project number (for Cloud Tasks service account)
- `REGION` - GCP region (default: us-central1)

## User Experience

### Setup Flow
1. User clicks "Start Syncing"
2. UI shows "Setting up sync..." (2-3 seconds)
3. Setup completes, UI shows "Syncing in progress... (0 events synced)"
4. User can navigate away - sync continues in background
5. UI polls status, shows progress: "Syncing... (150/500 events)"
6. When complete: "Sync active - 500 events synced"

### Status API
UI can query current sync status:
```
GET /api/sync/status
→ { status: 'syncing', progress: { synced: 150, total: 500 } }
```

## Future Enhancements

### Retry Logic
- Automatically retry failed batches with exponential backoff
- Store failure count in `syncState`

### Cancellation
- Add endpoint to stop in-progress sync
- Set `syncState.status: 'cancelled'` to halt chain

### Parallel Batches
- For users with multiple source calendars
- Process each calendar's batches independently

### Smart Batch Sizing
- Adjust batch size based on API latency
- Larger batches when API is fast, smaller when slow
