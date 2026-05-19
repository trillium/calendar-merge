# Cloud Scheduler for Initial Batch Sync (Local Dev)

## Problem

In local development:
- Cloud Tasks doesn't work (no service account credentials)
- Batch pagination stops after the first page
- We need a way to continue processing batches

## Solution

Use **Cloud Scheduler** to repeatedly trigger batch processing. The scheduler calls `/sync/trigger` every N minutes, and the app processes one page per call using round-robin state.

---

## Architecture

```
[Cloud Scheduler Job]
   Every 2 minutes
        |
        v
[Cloudflare Tunnel] --> [localhost:8080/sync/trigger]
        |
        +-> POST { userId: "user123" }
        |
        v
[batchSyncRoundRobin()]
        |
        +-> Reads Firestore: syncState/roundrobin_userId
        |       currentIndex: 0 (which calendar to process)
        |
        +-> Reads Firestore: batchStates/{batchStateId}
        |       currentPageToken: "abc123" (where to resume)
        |
        +-> Processes ONE page (50 events)
        |
        +-> Saves nextPageToken back to Firestore
        |
        +-> Updates currentIndex for next call
```

**Key insight:** The scheduler doesn't tell the app which batch to run. Instead:
1. **Firestore state** tracks which calendar and which page to process next
2. **Scheduler** just triggers the endpoint every N minutes
3. **App logic** reads Firestore state and resumes from where it left off

---

## Step-by-Step Setup

### 1. Start Local Tunnel

```bash
# Terminal 1: Start tunnel
cd /Users/trilliumsmith/code/calendar-merge-service/gcp
./dev-tunnel.sh
```

**Copy the tunnel URL:**
```
https://abc-def-123.trycloudflare.com
```

### 2. Update Environment

```bash
# gcp/.env
CLOUD_FUNCTION_URL=https://abc-def-123.trycloudflare.com
```

Restart dev server:
```bash
# Terminal 2
cd /Users/trilliumsmith/code/calendar-merge-service/gcp
pnpm dev
```

### 3. Create Cloud Scheduler Job

```bash
export GCP_PROJECT_ID="calendar-merge-1759477062"
export TUNNEL_URL="https://abc-def-123.trycloudflare.com"
export USER_ID="<your-test-user-id>"  # Get from Firestore users collection

# Create scheduler job that triggers every 2 minutes
gcloud scheduler jobs create http local-batch-sync \
  --project=${GCP_PROJECT_ID} \
  --location=us-central1 \
  --schedule="*/2 * * * *" \
  --uri="${TUNNEL_URL}/sync/trigger" \
  --http-method=POST \
  --message-body="{\"userId\":\"${USER_ID}\"}" \
  --headers="Content-Type=application/json" \
  --description="Local dev: Batch sync trigger every 2 minutes"
```

**Note:** No OIDC auth for local dev (Cloudflare Tunnel doesn't verify OIDC tokens)

### 4. Start the Scheduler

The job is created in **ENABLED** state by default. To manually trigger:

```bash
gcloud scheduler jobs run local-batch-sync \
  --project=${GCP_PROJECT_ID} \
  --location=us-central1
```

---

## How It Works

### First Call (Minute 0)

```
Scheduler → POST /sync/trigger { userId: "user123" }
    |
    v
batchSyncRoundRobin("user123")
    |
    +-> Firestore: No roundrobin state exists
    +-> Initialize: currentIndex = 0
    +-> Get watches[0] = { calendarId: "primary", ... }
    +-> Create batchState: { batchNumber: 1, currentPageToken: null }
    +-> syncEventsBatchPaginated(userId, "primary", pageToken=null)
    |       +-> Fetch first 50 events
    |       +-> Returns: { processedCount: 50, nextPageToken: "page2" }
    |
    +-> Save to Firestore:
    |   batchStates/{id}: { currentPageToken: "page2", processedEvents: 50 }
    |   syncState/roundrobin_user123: { currentIndex: 0 }
    |
    +-> Response: { hasMore: true, eventsProcessed: 50 }
```

### Second Call (Minute 2)

```
Scheduler → POST /sync/trigger { userId: "user123" }
    |
    v
batchSyncRoundRobin("user123")
    |
    +-> Firestore: roundrobin_user123 = { currentIndex: 0 }
    +-> Get watches[0] = { calendarId: "primary", ... }
    +-> Find existing batchState: { currentPageToken: "page2", batchNumber: 1 }
    +-> syncEventsBatchPaginated(userId, "primary", pageToken="page2")
    |       +-> Fetch next 50 events
    |       +-> Returns: { processedCount: 50, nextPageToken: "page3" }
    |
    +-> Save to Firestore:
    |   batchStates/{id}: { currentPageToken: "page3", processedEvents: 100 }
    |
    +-> Response: { hasMore: true, eventsProcessed: 50 }
```

### Final Call (Minute N)

```
Scheduler → POST /sync/trigger { userId: "user123" }
    |
    v
batchSyncRoundRobin("user123")
    |
    +-> syncEventsBatchPaginated(userId, "primary", pageToken="pageN")
    |       +-> Fetch last 20 events
    |       +-> Returns: { processedCount: 20, nextPageToken: null, finalSyncToken: "xyz" }
    |
    +-> No nextPageToken! Calendar sync complete.
    +-> Save syncToken to watch: watches/{channelId}: { syncToken: "xyz" }
    +-> Update round-robin: { currentIndex: 1 }  ← Move to next calendar
    +-> Response: { hasMore: true, currentIndex: 1 }
```

### Next Call (Minute N+2)

```
Scheduler → POST /sync/trigger { userId: "user123" }
    |
    v
batchSyncRoundRobin("user123")
    |
    +-> Firestore: roundrobin_user123 = { currentIndex: 1 }
    +-> Get watches[1] = { calendarId: "calendar2@gmail.com", ... }
    +-> Start syncing second calendar...
```

---

## Current Code Issue

The current code at `batch-sync.service.ts:196-202` tries to use Cloud Tasks:

```typescript
if (result.nextPageToken) {
  await createBatchTask({  // ← This fails in local dev!
    userId,
    batchStateId,
    batchNumber: 2,
    scheduleTime: Date.now() + APP_CONFIG.BATCH_DELAY_MS,
  });
```

**Problem:** `createBatchTask()` returns `'local-dev-skipped'` in local dev, but the code doesn't handle continuation.

---

## Fix Required

We need to modify `batchSyncRoundRobin()` to:

1. **Always save the current pageToken** to Firestore
2. **Resume from pageToken** on the next scheduler call
3. **NOT create Cloud Tasks** in local dev - let scheduler handle it

### Current Flow (Broken in Local Dev)

```
Call 1: Process page 1 → Create Cloud Task for page 2
Call 2: (Cloud Task) Process page 2 → Create Cloud Task for page 3
...
```

### New Flow (Works in Local Dev)

```
Call 1: Process page 1 → Save pageToken="page2"
        ↓ (2 minutes later, scheduler triggers)
Call 2: Read pageToken="page2" → Process page 2 → Save pageToken="page3"
        ↓ (2 minutes later, scheduler triggers)
Call 3: Read pageToken="page3" → Process page 3 → Complete
```

---

## Required Code Changes

I'll show you the changes needed in the next message. The key changes:

1. **Load existing batchState** if it exists (to resume pagination)
2. **Save pageToken** to batchState after each page
3. **Resume from pageToken** on next call
4. **Skip Cloud Tasks** entirely in local dev

Do you want me to make these changes to the code?

---

## Testing

### 1. Initialize a Watch

```bash
curl -X POST http://localhost:8080/calendars/watch \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "your-user-id",
    "calendarId": "primary",
    "targetCalendarId": "target@gmail.com"
  }'
```

### 2. Check Firestore

Before triggering sync:
```
syncState/roundrobin_userId: (doesn't exist yet)
batchStates/*: (empty)
```

### 3. Trigger First Call

```bash
gcloud scheduler jobs run local-batch-sync \
  --project=${GCP_PROJECT_ID} \
  --location=us-central1
```

Watch your local dev server logs:
```
[INFO] Round-robin batch sync triggered { userId: 'user123' }
[INFO] Round-robin: Syncing calendar primary (1/1)
[INFO] Starting batch sync for primary
[INFO] Batch sync processing page 1: 50 events
```

### 4. Check Firestore Again

After first call:
```
syncState/roundrobin_userId: { currentIndex: 0 }
batchStates/{id}: {
  userId: "user123",
  calendarId: "primary",
  batchNumber: 1,
  currentPageToken: "page2token",
  processedEvents: 50,
  status: "processing"
}
```

### 5. Wait 2 Minutes (or Trigger Manually)

```bash
# Trigger immediately for testing
gcloud scheduler jobs run local-batch-sync \
  --project=${GCP_PROJECT_ID} \
  --location=us-central1
```

Watch logs:
```
[INFO] Round-robin batch sync triggered { userId: 'user123' }
[INFO] Resuming from page token: page2token
[INFO] Batch sync processing page 2: 50 events
```

### 6. Repeat Until Complete

The scheduler keeps calling every 2 minutes until:
- All pages processed (no nextPageToken)
- All calendars synced (currentIndex wraps to 0 and all complete)

---

## Monitoring

### Watch Scheduler Execution

```bash
# View job details
gcloud scheduler jobs describe local-batch-sync \
  --project=${GCP_PROJECT_ID} \
  --location=us-central1

# View recent executions in Cloud Console
open "https://console.cloud.google.com/cloudscheduler?project=${GCP_PROJECT_ID}"
```

### Watch Local Logs

Your dev server will show:
```
[INFO] Incoming request { method: 'POST', path: '/sync/trigger' }
[INFO] Round-robin batch sync triggered { userId: 'user123' }
[INFO] Round-robin: Syncing calendar primary (1/3)
[INFO] Batch sync processing page 2: 50 events processed
[INFO] Next page token saved: page3token
```

### Check Firestore State

```bash
# In another terminal
gcloud firestore documents list \
  --collection-ids=batchStates \
  --project=${GCP_PROJECT_ID}
```

---

## Cleanup

```bash
# Delete scheduler job when done
gcloud scheduler jobs delete local-batch-sync \
  --project=${GCP_PROJECT_ID} \
  --location=us-central1 \
  --quiet

# Clear Firestore state
# (Use Firestore console or delete via app)
```

---

## Summary

✅ **Cloud Scheduler** calls `/sync/trigger` every 2 minutes
✅ **Firestore state** tracks pagination progress
✅ **App resumes** from where it left off each call
✅ **No Cloud Tasks** needed in local dev
✅ **Works with tunnel** for local testing

**Next step:** Update `batchSyncRoundRobin()` to properly save/resume from pageToken instead of relying on Cloud Tasks.
