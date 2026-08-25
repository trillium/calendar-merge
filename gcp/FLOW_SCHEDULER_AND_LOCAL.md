# Scheduler-Driven Batch Sync Flow

## Overview

Cloud Scheduler triggers batch processing at regular intervals. The app processes one page at a time and saves state to Firestore. On the next scheduler run, it resumes from where it left off.

---

## ASCII Flow Diagram

```
================================================================================
INITIALIZATION: User Sets Up Watch Channels
================================================================================

[NextJS Frontend]
    |
    +-> User selects calendars to sync
    |
    v
POST /calendars/watch
    |
    +-> watchChannelService.createWatchChannel()
    |
    +-> Firestore: watches/{channelId}
        {
          userId: "user123",
          calendarId: "primary",
          targetCalendarId: "target@gmail.com",
          syncState: { status: "pending" },
          syncToken: null  // No syncToken yet (initial sync needed)
        }


================================================================================
TRIGGER: Cloud Scheduler Starts Batch Sync
================================================================================

[Cloud Scheduler Job] (runs every 2 minutes)
    |
    | Cron: */2 * * * *
    | POST https://tunnel.trycloudflare.com/sync/trigger
    | Body: { "userId": "user123" }
    |
    v
[Cloudflare Tunnel] → [Local Dev Server: localhost:8080]
    |
    v
sync.controller.ts: triggerBatchSync()
    |
    v
batch-sync.service.ts: batchSyncRoundRobin(userId)


================================================================================
BATCH PROCESSING: Round-Robin with Pagination
================================================================================

batchSyncRoundRobin(userId):
    |
    +-> Query Firestore: watches WHERE userId = "user123"
    |       Result: [watch1, watch2, watch3]
    |
    +-> Filter: activeWatches (not paused, not syncing)
    |       Result: [watch1, watch2, watch3]
    |
    +-> Read Firestore: syncState/roundrobin_user123
    |       { currentIndex: 0 }  ← Which calendar to process
    |
    +-> Select: watch = activeWatches[0]  ← "primary"
    |
    +-> Mark as syncing:
    |   UPDATE watches/{channelId}: syncState.status = "syncing"
    |
    +-> Create batch state:
    |   Firestore: batchStates/{batchStateId}
    |   {
    |     userId: "user123",
    |     calendarId: "primary",
    |     targetCalendarId: "target@gmail.com",
    |     batchNumber: 1,
    |     currentPageToken: null,  ← No token for first page
    |     processedEvents: 0,
    |     status: "pending"
    |   }
    |
    +-> syncEventsBatchPaginated(userId, "primary", "target@gmail.com")
        |
        +-> Google Calendar API: events.list(maxResults=50)
        |       Returns: { events: [50 events], nextPageToken: "page2token" }
        |
        +-> For each event:
        |   +-> Check Firestore: eventMappings/{calendarId}_{eventId}
        |   +-> Mapping exists? → SKIP (already synced)
        |   +-> No mapping? → CREATE
        |
        +-> batchCreateEvents() → Google Batch API (up to 50 creates)
        |
        +-> Return:
            {
              processedCount: 50,
              nextPageToken: "page2token",
              finalSyncToken: null  ← Not set until last page
            }


================================================================================
DECISION POINT: More Pages?
================================================================================

Back in batchSyncRoundRobin():
    |
    +-> Update Firestore: batchStates/{batchStateId}
    |   {
    |     processedEvents: 50,
    |     currentPageToken: "page2token",  ← SAVE FOR NEXT RUN
    |     updatedAt: timestamp
    |   }
    |
    +-> if (result.nextPageToken) ← MORE PAGES EXIST
        |
        | YES → More pages to process
        |
        +-> createBatchTask() ← Try to schedule next batch
        |       |
        |       +-> Check: GCP_SERVICE_ACCOUNT_EMAIL exists?
        |       |
        |       | NO (local dev) →
        |       +-> Log: "Skipping Cloud Tasks - scheduler will handle"
        |       +-> Return: "local-dev-skipped"
        |
        +-> Update Firestore: batchStates/{batchStateId}
        |       status: "processing"  ← Still in progress
        |
        +-> Update Firestore: syncState/roundrobin_user123
        |       currentIndex: 1  ← Move to next calendar
        |
        +-> Return: { hasMore: true, currentIndex: 1 }


================================================================================
SELF-TRIGGER: Move to Next Calendar
================================================================================

Back in sync.controller.ts:
    |
    +-> if (result.hasMore)
        |
        +-> fetch("https://tunnel.trycloudflare.com/sync/trigger")
        |       Body: { "userId": "user123" }
        |
        +-> (Fire and forget - don't wait for response)


[2 minutes later - Scheduler triggers again]
    |
    v
POST /sync/trigger { "userId": "user123" }
    |
    v
batchSyncRoundRobin(userId):
    |
    +-> Read Firestore: syncState/roundrobin_user123
    |       { currentIndex: 1 }  ← Second calendar
    |
    +-> Select: watch = activeWatches[1]  ← "work@gmail.com"
    |
    +-> Process first page of second calendar...
    |
    +-> Move to currentIndex: 2
    |
    +-> Self-trigger next batch


[Eventually - all calendars processed]
    |
    +-> currentIndex wraps to 0
    +-> hasMore: false (all calendars done for this round)
    +-> No self-trigger
    +-> Wait for scheduler to run again


================================================================================
PROBLEM: Pagination is Abandoned
================================================================================

CURRENT BEHAVIOR:
    |
    Calendar 1: Process page 1 (50 events) → Move to calendar 2
    Calendar 2: Process page 1 (50 events) → Move to calendar 3
    Calendar 3: Process page 1 (50 events) → Done
    |
    ❌ Calendar 1 still has pages 2, 3, 4... (never processed!)


WHAT SHOULD HAPPEN:
    |
    Calendar 1: Process page 1 → Save pageToken
    [Scheduler run 2]
    Calendar 1: Process page 2 → Save pageToken
    [Scheduler run 3]
    Calendar 1: Process page 3 → Save pageToken
    [Scheduler run 4]
    Calendar 1: Process page 4 → No more pages → Move to calendar 2
    [Scheduler run 5]
    Calendar 2: Process page 1 → etc.


================================================================================
FIRESTORE STATE TRACKING
================================================================================

watches/{channelId}:
{
  userId: "user123",
  calendarId: "primary",
  targetCalendarId: "target@gmail.com",
  syncState: {
    status: "syncing",     ← Current status
    startedAt: 1234567890,
    processedEvents: 50    ← Running total
  },
  syncToken: null          ← Set when sync completes
}

batchStates/{batchStateId}:
{
  userId: "user123",
  calendarId: "primary",
  targetCalendarId: "target@gmail.com",
  batchNumber: 1,
  currentPageToken: "page2token",  ← WHERE TO RESUME
  processedEvents: 50,
  status: "processing",            ← Still in progress
  createdAt: 1234567890,
  updatedAt: 1234567891
}

syncState/roundrobin_user123:
{
  currentIndex: 1  ← Which calendar in the array to process next
}


================================================================================
PRODUCTION vs LOCAL DEV
================================================================================

PRODUCTION (Cloud Run/Functions):
    |
    +-> Cloud Scheduler → POST /sync/trigger
    |
    +-> Process page 1
    |
    +-> createBatchTask() → Cloud Tasks API
    |       Creates task: POST /batch/continue (10 sec delay)
    |
    [10 seconds later]
    |
    +-> Cloud Tasks → POST /batch/continue
    |
    +-> batch.controller.ts: continueBatch()
    |       +-> Read batchState from Firestore
    |       +-> Get currentPageToken
    |       +-> syncEventsBatchPaginated(pageToken)
    |       +-> Process page 2
    |       +-> Create next Cloud Tasks task
    |
    (Repeat until no nextPageToken)


LOCAL DEV (Tunnel):
    |
    +-> Cloud Scheduler → Tunnel → POST /sync/trigger
    |
    +-> Process page 1
    |
    +-> createBatchTask() → ❌ No GCP_SERVICE_ACCOUNT_EMAIL
    |       Returns: "local-dev-skipped"
    |
    +-> ⚠️  PAGINATION STOPS
    |       No mechanism to continue to page 2!
    |
    +-> Moves to next calendar instead


PROPOSED FIX FOR LOCAL DEV:
    |
    Option 1: Scheduler calls /batch/continue directly
    |   +-> Cloud Scheduler Job 1: POST /sync/trigger (start new sync)
    |   +-> Cloud Scheduler Job 2: POST /batch/continue (every 30 sec)
    |       Query Firestore for pending batches, process them
    |
    Option 2: Modify batchSyncRoundRobin() to resume pagination
    |   +-> Check for existing batchState with currentPageToken
    |   +-> If exists, resume from pageToken instead of starting new calendar
    |   +-> Only move to next calendar when currentPageToken is null


================================================================================
SCHEDULER JOBS NEEDED
================================================================================

# Job 1: Trigger initial batch sync (every 2 minutes)
gcloud scheduler jobs create http batch-sync-trigger \
  --schedule="*/2 * * * *" \
  --uri="${TUNNEL_URL}/sync/trigger" \
  --http-method=POST \
  --message-body='{"userId":"user123"}'

# Job 2: Process pending batch continuations (every 30 seconds)
gcloud scheduler jobs create http batch-continue-processor \
  --schedule="*/1 * * * *" \
  --uri="${TUNNEL_URL}/scheduler/process-batches" \
  --http-method=POST

# Job 3: Incremental sync (every 15 minutes)
gcloud scheduler jobs create http incremental-sync \
  --schedule="*/15 * * * *" \
  --uri="${TUNNEL_URL}/scheduler/incremental" \
  --http-method=POST


================================================================================
NEEDED ENDPOINT: /scheduler/process-batches
================================================================================

New endpoint to process pending batch continuations:

GET Firestore: batchStates WHERE status = "processing"
    |
    +-> For each pending batch:
        |
        +-> Read: currentPageToken, batchNumber
        |
        +-> POST /batch/continue
            {
              batchStateId: "...",
              batchNumber: 2,
              userId: "user123"
            }
        |
        +-> batch.controller.ts: continueBatch()
            |
            +-> Load batchState from Firestore
            +-> syncEventsBatchPaginated(pageToken)
            +-> Process next page
            +-> Update currentPageToken
            +-> If no more pages:
                +-> Mark batchState as "completed"
                +-> Save syncToken to watch


This way:
- Scheduler triggers batch processing at regular intervals
- App processes whatever work is pending
- No dynamic scheduler job creation needed
- Works same in local dev and production
```

---

## Summary

**Current Issue:** Pagination is abandoned after first page in local dev

**Root Cause:** `createBatchTask()` skips Cloud Tasks in local dev, but no alternative continuation mechanism exists

**Solution Needed:**
1. Add `/scheduler/process-batches` endpoint
2. Scheduler calls it every 30-60 seconds
3. Endpoint queries Firestore for pending batches and processes them
4. Works identically in local dev and production
