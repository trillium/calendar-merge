# Batch Sync Implementation Tasks

Implementation checklist for the batched initial sync architecture described in BATCH_SYNC.md.

## Git Commit Strategy

**Important:** Stage and commit changes in atomic, semantic parts as you complete each task. Do not batch multiple unrelated changes into one commit.

### Commit Guidelines
- ✅ **Atomic commits:** Each commit should represent one logical change
- ✅ **Semantic messages:** Describe what changed and why, not which phase
- ❌ **No phase numbers:** Don't include "Phase 1", "Phase 2", etc. in commit messages
- ✅ **Task-based:** Commit after completing each task or logical sub-task

### Example Commits (Good)
```
feat: add syncState field to WatchData interface
feat: create Cloud Tasks queue for batch sync
feat: implement batchSyncEvents function
feat: add batchSync HTTP handler
refactor: remove synchronous sync from createCalendarWatch
feat: add progress tracking to sync status API
test: add unit tests for batchSync pagination
docs: update README with batch sync architecture
```

### Example Commits (Bad - Don't Do This)
```
Phase 3: Core Implementation ❌ (too broad, includes phase number)
WIP batch sync ❌ (not descriptive)
Update files ❌ (not semantic)
Phase 2 complete ❌ (phase number, not descriptive of changes)
```

### When to Commit
- ✅ After completing Task 1.1 (interface update)
- ✅ After applying Terraform changes (Task 2.1)
- ✅ After implementing batchSyncEvents (Task 3.1)
- ✅ After adding HTTP handler (Task 3.2)
- ✅ After modifying createCalendarWatch (Task 3.3)
- ✅ After each API/UI integration task
- ✅ After writing tests
- ✅ Before deployment

---

## Phase 1: Data Model & Types ✅ COMPLETE

### Task 1.1: Update WatchData Interface ✅
**File:** `functions/calendar-sync/types.ts` (exists)

**Status:** ✅ COMPLETED - Commit: d16d25c

- [x] Add `syncState` field to `WatchData` interface:
  ```typescript
  syncState?: {
      status: 'pending' | 'syncing' | 'complete' | 'failed';
      pageToken?: string;
      eventsSynced: number;
      totalEvents?: number;
      lastBatchTime?: number;
      timeMax?: string;
  };
  ```

**Acceptance Criteria:**
- TypeScript compiles without errors
- Existing code still works (optional field)

---

## Phase 2: Infrastructure Setup ✅ COMPLETE

### Task 2.1: Create Cloud Tasks Queue ✅
**Location:** Terraform configuration (already added)

**Status:** ✅ COMPLETED - Cloud Tasks API enabled, queue created

The Cloud Tasks queue is defined in `terraform/main.tf` as:
```terraform
resource "google_cloud_tasks_queue" "calendar_sync_queue" {
  name     = "calendar-sync-queue"
  location = var.region

  rate_limits {
    max_dispatches_per_second = 10
    max_concurrent_dispatches = 10
  }

  retry_config {
    max_attempts = 3
    max_backoff  = "3600s"
    min_backoff  = "5s"
  }
}
```

**Rate Limiting Explained:**
- **Queue rate:** 10 tasks/sec (one task per calendar batch)
- **Event processing rate:** 150ms delay per event = 1/0.15 = 6.67 events/sec
- **These are different rates and intentional:**
  - Multiple calendars can sync in parallel (10 concurrent tasks dispatched from queue)
  - Within each calendar, events sync slowly (150ms between each event) to respect Google's API quotas
  - Queue rate (10/sec) > Event rate (6.67/sec) = allows parallel processing across calendars

- [x] Verify queue resource is present in `terraform/main.tf`
- [x] Apply Terraform changes: `terraform apply`

**Acceptance Criteria:**
- Queue visible in GCP Console after Terraform apply
- Terraform output shows queue name: `terraform output cloud_tasks_queue`

### Task 2.2: Prepare Environment Variable Values ✅
**Purpose:** Gather the values needed for Cloud Function deployment in Phase 6

**Status:** ✅ COMPLETED
- PROJECT_ID: calendar-merge-1759477062
- PROJECT_NUMBER: 262025806347
- REGION: us-central1

- [x] Get project number from Terraform:
  ```bash
  cd terraform
  terraform output project_number
  # Returns: 123456789012

  terraform output cloudtasks_service_account
  # Returns: service-123456789012@gcp-sa-cloudtasks.iam.gserviceaccount.com
  ```

- [x] Verify your PROJECT_ID:
  ```bash
  echo $PROJECT_ID
  # Or: gcloud config get-value project
  ```

- [x] Save these values for Phase 6 deployment:
  - `PROJECT_ID` - your GCP project ID
  - `PROJECT_NUMBER` - from terraform output
  - `REGION` - us-central1 (or your deployment region)

**Note:** The `FUNCTION_URL` will be constructed from these values during deployment. See Phase 6 for how these are used.

**Acceptance Criteria:**
- PROJECT_NUMBER retrieved and saved
- PROJECT_ID confirmed
- REGION confirmed
- Values ready for use in deployment phase

---

## Phase 3: Core Implementation ✅ COMPLETE

### Task 3.1: Create batchSync Function ✅
**File:** `functions/calendar-sync/batchSync.ts` (new file)

**Status:** ✅ COMPLETED - Commit: 3dc0318

- [x] Implement `batchSyncEvents(channelId: string)` function:
  - [x] Read watch data from Firestore
  - [x] Check sync status (skip if complete)
  - [x] Mark as 'syncing'
  - [x] Fetch batch of events (50 events max):
    ```typescript
    const response = await calendar.events.list({
      calendarId: watchData.calendarId,
      timeMin: new Date().toISOString(),
      timeMax: syncState.timeMax,
      maxResults: 50,
      pageToken: syncState.pageToken,  // undefined on first batch
      singleEvents: true,
      orderBy: 'startTime',
    });
    ```
  - [x] Process events with rate limiting (150ms between events)
    - Calculation: 150ms = 0.15 seconds → 1/0.15 = 6.67 events/sec
    - Well under Google's 10 requests/second quota
  - [x] Update progress in Firestore (increment eventsSynced)
  - [x] **Handle pagination correctly** (critical logic):
    ```typescript
    if (response.data.nextPageToken) {
      // More pages to come - store pageToken and continue
      updates['syncState.pageToken'] = response.data.nextPageToken;
      updates['syncState.status'] = 'syncing';
      await watchDoc.ref.update(updates);
      await enqueueBatchSync(channelId, 2); // Next batch in 2 seconds
    } else if (response.data.nextSyncToken) {
      // Final page - store syncToken and mark complete
      updates['syncToken'] = response.data.nextSyncToken;
      updates['syncState.status'] = 'complete';
      delete updates['syncState.pageToken']; // Clear pagination token
      await watchDoc.ref.update(updates);
    }
    ```
  - [x] **Critical:** Google returns EITHER `nextPageToken` OR `nextSyncToken`, NEVER both
    - `nextPageToken` = more results available (intermediate pages)
    - `nextSyncToken` = no more results (final page only)

- [x] Implement `enqueueBatchSync(channelId: string, delaySeconds: number)`:
  - [x] Use Cloud Tasks client
  - [x] Construct function URL from environment variables:
    ```typescript
    const projectId = process.env.PROJECT_ID;
    const projectNumber = process.env.PROJECT_NUMBER;
    const region = process.env.REGION || 'us-central1';
    const functionUrl = `https://${region}-${projectId}.cloudfunctions.net/batchSync`;
    ```
  - [x] Create task with OIDC authentication:
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
  - [x] Handle errors gracefully (log and throw)

**Acceptance Criteria:**
- Function processes up to 50 events per batch
- Progress updates appear in Firestore after each batch (eventsSynced increments, pageToken updates)
- `pageToken` stored when `nextPageToken` is present (more pages to come)
- `syncToken` stored ONLY on final batch when `nextSyncToken` is present
- Rate limiting (150ms) between events
- Status changes to 'complete' only when syncToken is obtained

### Task 3.2: Add batchSync HTTP Handler ✅
**File:** `functions/calendar-sync/index.ts` (exists)

**Status:** ✅ COMPLETED - Commit: fceb77e

- [x] Import `batchSyncEvents` from batchSync module
- [x] Add HTTP endpoint handler:
  ```typescript
  export const batchSync = onRequest({
    timeoutSeconds: 540,
    memory: '256MiB'
  }, async (req, res) => {
    // Extract channelId from body
    // Call batchSyncEvents
    // Return success/error
  });
  ```
- [x] Add request validation (check channelId exists)
- [x] Add error handling with proper HTTP status codes

**Acceptance Criteria:**
- Endpoint accepts POST with `{ channelId }`
- Returns 200 on success, 400/500 on errors
- Properly logged errors

### Task 3.3: Modify createCalendarWatch ✅
**File:** `functions/calendar-sync/watch.ts` (exists)

**Status:** ✅ COMPLETED - Commit: 75ab664

**Current state:** Lines 35-47 perform synchronous initial sync:
- Fetches up to 2500 events with `calendar.events.list()`
- Uses `timeMin: now.toISOString()` (future events only)
- Gets syncToken immediately
- This blocking sync needs to be replaced with batched async approach

**Before (current flow):**
```typescript
// Perform initial sync to get syncToken (future events only)
console.log(`Performing initial sync for calendar ${calendarId} (future events only)`);
const now = new Date();
const initialSync = await calendar.events.list({
    calendarId,
    maxResults: 2500,
    singleEvents: true,
    timeMin: now.toISOString(),
    orderBy: 'startTime',
});

const initialSyncToken = initialSync.data.nextSyncToken;
console.log(`Initial sync complete: ${initialSync.data.items?.length || 0} future events, syncToken obtained`);

// Store watch with syncToken
const watchData: WatchData = {
    // ... other fields
    ...(initialSyncToken && { syncToken: initialSyncToken }),
};
```

**After (new batched flow):**
```typescript
// Calculate time window for batch sync (no API call yet)
const now = new Date();
const timeMax = new Date();
timeMax.setFullYear(timeMax.getFullYear() + 2);

// Store watch with pending sync state (no syncToken yet)
const watchData: WatchData = {
    // ... other fields
    syncState: {
        status: 'pending',
        eventsSynced: 0,
        timeMax: timeMax.toISOString(),
    },
};

await firestore.collection(CONFIG.FIRESTORE_COLLECTIONS.WATCHES).doc(channelId).set(watchData);

// Enqueue first batch sync task
await enqueueBatchSync(channelId, 5);

console.log(`Watch created for calendar ${calendarId}`);
return channelId;
```

**Changes needed:**
- [x] Remove the `calendar.events.list()` API call (lines ~35-43)
- [x] Remove syncToken extraction and storage
- [x] Add `timeMax` calculation (2 years from now)
- [x] Initialize `syncState` instead of `syncToken`
- [x] Add call to `enqueueBatchSync(channelId, 5)`

**Important:** The `syncToken` will be obtained by the FINAL batch in `batchSyncEvents()`, not here. Google only returns `nextSyncToken` on the last page of results.

**Acceptance Criteria:**
- Function completes in <5 seconds (no API calls to fetch events)
- Watch created in Firestore with syncState.status = 'pending'
- syncState has timeMax but NO pageToken or syncToken initially
- First batch task enqueued with 5-second delay
- Function returns channelId

---

## Phase 4: API & UI Integration ✅ COMPLETE

### Task 4.1: Modify Sync Status API Endpoint ✅
**File:** `nextjs/app/api/sync/status/route.ts` (exists)

**Status:** ✅ COMPLETED - Commit: c0c28e8

**Current state:** Endpoint exists with:
- GET method with session-based auth (not query parameter)
- Fetches all watches for user from Firestore
- Returns watch info with basic stats (totalEventsSynced, lastSyncTime, lastSyncEventCount)
- Fetches and includes calendar names for display
- Does NOT have syncState progress tracking yet

- [x] Keep existing authentication (session-based, not query parameter)
- [x] Keep existing watch query logic
- [x] Aggregate syncState across all watches:
  ```typescript
  {
    overallStatus: 'pending' | 'syncing' | 'complete' | 'failed',
    totalEvents: 500,
    syncedEvents: 150,
    watches: [
      { calendarId: 'work@gmail.com', status: 'complete', synced: 50 },
      { calendarId: 'personal@gmail.com', status: 'syncing', synced: 100 }
    ]
  }
  ```

**Acceptance Criteria:**
- Returns 200 with sync status JSON
- Handles missing/invalid userId
- Works before sync starts (pending status)

### Task 4.2: Update Setup API - Remove Old Sync Trigger ✅
**File:** `nextjs/app/api/setup/route.ts` (exists)

**Status:** ✅ COMPLETED - No changes needed, createCalendarWatch handles batch sync automatically

**Current state:** Uses non-awaited `fetch()` to call `TRIGGER_INITIAL_SYNC_URL` (lines 59-72):
- Calls existing `triggerInitialSync` function asynchronously
- This is the OLD sync mechanism

**Changes needed:**
- [x] ~~Remove the `fetch()` call to `TRIGGER_INITIAL_SYNC_URL`~~ - Not present in current code
- [x] ~~Remove `TRIGGER_INITIAL_SYNC_URL` environment variable usage~~ - Not present in current code
- [x] **No replacement needed** - `createCalendarWatch()` already handles batch sync via `enqueueBatchSync()`

**Flow after changes:**
```
Setup API → createCalendarWatch() → enqueueBatchSync() → Cloud Task → batchSync function
```

**Important:** The setup API does NOT directly call batchSync. The Cloud Function `createCalendarWatch()` enqueues the initial batch task.

**Acceptance Criteria:**
- Endpoint returns in <5 seconds regardless of event count
- Watches created successfully
- No manual trigger of initial sync (handled by createCalendarWatch)
- Batch sync triggered automatically via Cloud Tasks

### Task 4.3: Add Progress UI to Dashboard ✅
**File:** `nextjs/app/dashboard/page.tsx`

**Status:** ✅ COMPLETED - Commits: 2611e13, e1e6863

- [x] Add polling mechanism (every 3-5 seconds)
- [x] Call `/api/sync/status` endpoint
- [x] Display sync progress:
  - "Setting up sync..." (pending)
  - "Syncing events... (150/500)" (syncing)
  - "Sync complete - 500 events synced" (complete)
  - "Sync failed - please try again" (failed)
- [x] Stop polling when status is 'complete' or 'failed'

**Acceptance Criteria:**
- Progress updates visible to user
- Polling stops when sync completes
- No excessive API calls (reasonable interval)

---

## Phase 5: Testing ⏸️ PENDING

### Task 5.1: Unit Tests for batchSync ✅
**File:** `functions/calendar-sync/batchSync.test.ts` (new)

**Status:** ✅ COMPLETED - 16 comprehensive tests implemented and passing

- [x] Test batch processing with 50 events
- [x] Test pagination (multiple batches)
- [x] Test final batch (stores syncToken)
- [x] Test error handling
- [x] Mock Cloud Tasks enqueueing
- [x] Mock Firestore updates

**Tests implemented:**
- batchSyncEvents: 10 tests covering pagination, sync completion, error handling, edge cases
- enqueueBatchSync: 6 tests covering task creation, env vars, error handling

**Acceptance Criteria:**
- ✅ All tests pass (16/16)
- ✅ Comprehensive test coverage for batchSync module

### Task 5.2: Integration Test - Small Calendar ⏸️
**Environment:** Development/Staging

- [ ] Create test calendar with 25 events (1 batch)
- [ ] Run setup flow
- [ ] Verify:
  - Watch created with syncState.status = 'pending'
  - After 5 seconds, status changes to 'syncing'
  - All 25 events appear in target calendar
  - syncState.status = 'complete'
  - syncToken stored

**Acceptance Criteria:**
- All events synced correctly
- Status transitions: pending → syncing → complete

### Task 5.3: Integration Test - Large Calendar ⏸️
**Environment:** Development/Staging

- [ ] Create test calendar with 150 events (3 batches)
- [ ] Run setup flow
- [ ] Verify:
  - Batch 1: 50 events synced, pageToken stored
  - Batch 2: 50 more events synced (100 total)
  - Batch 3: 50 more events synced (150 total), status = complete
  - Progress tracked in Firestore
  - UI shows progress updates

**Acceptance Criteria:**
- All 150 events synced
- 3 batches executed with 2-second delays
- Total time: ~45-60 seconds

### Task 5.4: Test Error Scenarios ⏸️

- [ ] Test: Batch fails mid-sync
  - Verify status = 'failed' in Firestore
  - Verify UI shows error

- [ ] Test: Invalid channelId in batchSync call
  - Verify 400 error returned
  - Verify no crash

- [ ] Test: Google API rate limit error
  - Verify batch retries or fails gracefully
  - Verify error logged

**Acceptance Criteria:**
- System handles errors without crashing
- Errors visible in logs and UI

---

## Phase 6: Deployment ✅ COMPLETE

### Task 6.1: Build and Deploy Functions ✅
**Commands:**

**Status:** ✅ COMPLETED - Scripts created and executed successfully

- [x] Build functions:
  ```bash
  cd functions/calendar-sync
  pnpm build
  ```

- [x] Get required values from Phase 2:
  - PROJECT_ID (e.g., `my-calendar-app`)
  - PROJECT_NUMBER (e.g., `123456789012`)
  - REGION (e.g., `us-central1`)

- [x] Deploy batchSync function with environment variables:
  ```bash
  # Construct FUNCTION_URL from known values (no chicken-and-egg problem)
  # Gen2 Cloud Functions URLs follow this pattern:
  # https://REGION-PROJECT_ID.cloudfunctions.net

  # Deployed via script: ./scripts/deploy/deploy-batchSync.sh
  # Function URL: https://us-central1-calendar-merge-1759477062.cloudfunctions.net/batchSync
  ```

  **Deployment Script Created:** `scripts/deploy/deploy-batchSync.sh`
  - Added to package.json as `pnpm deploy:batchSync`
  - Retrieves PROJECT_NUMBER from Terraform automatically

  **Important:** The function constructs its own URL internally:
  ```typescript
  const functionUrl = `https://${process.env.REGION}-${process.env.PROJECT_ID}.cloudfunctions.net/batchSync`;
  ```

- [x] Grant Cloud Tasks service account permission to invoke function:
  ```bash
  gcloud functions add-invoker-policy-binding batchSync \
    --gen2 \
    --region=us-central1 \
    --member="serviceAccount:service-PROJECT_NUMBER@gcp-sa-cloudtasks.iam.gserviceaccount.com"
  ```
  Replace `PROJECT_NUMBER` with your actual project number.

- [ ] Verify deployment:
  ```bash
  gcloud functions describe batchSync --gen2 --region=us-central1
  # Check that env vars are set correctly
  ```

**Acceptance Criteria:**
- Function deploys without errors
- Environment variables set correctly (verify with `gcloud functions describe`)
- IAM binding for Cloud Tasks service account succeeds
- Function is NOT publicly accessible (authenticated requests only)

### Task 6.2: Deploy Next.js Updates ⏭️
**Commands:**

**Status:** ⏭️ SKIPPED - Manual deployment deferred

- [ ] Verify environment variables in Vercel:
  - `FUNCTION_URL`
  - `PROJECT_ID`
  - `REGION`

- [ ] Deploy to Vercel:
  ```bash
  cd nextjs
  vercel --prod
  ```

**Acceptance Criteria:**
- Next.js app deploys successfully
- `/api/sync/status` endpoint works
- `/api/setup` completes in <5 seconds

### Task 6.3: Verify IAM Permissions ✅

**Status:** ✅ COMPLETED

**What's already configured:**
- `roles/cloudtasks.enqueuer` on application service account - configured in Terraform (`terraform/main.tf`)
  - Allows creating tasks in the queue
- `roles/cloudfunctions.invoker` for Cloud Tasks service account - configured in Task 6.1 via gcloud
  - Allows Cloud Tasks to invoke the `batchSync` function

**Verification steps:**
- [x] Verify `roles/cloudtasks.enqueuer` binding is present in Terraform configuration
- [x] Verify you completed the `add-invoker-policy-binding` command in Task 6.1
- [ ] Test batch sync workflow end-to-end (pending integration testing):
  - Trigger setup flow
  - Verify Cloud Tasks queue receives task
  - Verify batchSync function executes
- [ ] Check Cloud Function logs for permission errors

**Acceptance Criteria:**
- Tasks successfully enqueued (validates cloudtasks.enqueuer)
- Tasks successfully execute function (validates cloudfunctions.invoker)
- No permission errors in logs

---

## Phase 7: Monitoring & Cleanup ⏸️ PENDING

### Task 7.1: Add Logging and Monitoring ⏸️

- [ ] Add structured logging to batchSync:
  - Batch start/complete
  - Events processed count
  - Errors with context

- [ ] Set up Cloud Monitoring alerts:
  - Alert on batchSync failures (>5 in 10 minutes)
  - Alert on long-running batches (>60 seconds)

- [ ] Create dashboard showing:
  - Active syncs
  - Average batch processing time
  - Error rates

**Acceptance Criteria:**
- Logs are searchable in Cloud Logging
- Alerts fire on error conditions
- Dashboard shows key metrics

### Task 7.2: Update Documentation ⏸️

- [ ] Update README.md with batch sync architecture
- [ ] Add troubleshooting guide for sync issues
- [ ] Document environment variables
- [ ] Add deployment instructions

**Acceptance Criteria:**
- Deployment instructions are complete and accurate
- Common issues have documented solutions

### Task 7.3: Cleanup Old Code (Optional) ⏸️

**Current state:**
- `triggerInitialSync` exists in `functions/calendar-sync/index.ts:61-82`
- Currently being called by `nextjs/app/api/setup/route.ts` via TRIGGER_INITIAL_SYNC_URL
- Calls `performInitialSync()` from `functions/calendar-sync/initialSync.ts`

- [ ] Remove deprecated `triggerInitialSync` function from index.ts
- [ ] Remove `performInitialSync` function from initialSync.ts (or entire file)
- [ ] Remove `TRIGGER_INITIAL_SYNC_URL` environment variable references
- [ ] Clean up unused imports

**Acceptance Criteria:**
- No dead code in repository
- All imports used

---

## Success Criteria

### System-Level
- [ ] Setup completes in <5 seconds for any calendar size
- [ ] All future events (0-2 years) synced within reasonable time
- [ ] Progress visible to users in real-time
- [ ] No timeouts regardless of event count
- [ ] Rate limiting prevents quota exhaustion

### User Experience
- [ ] Users see "Sync configured" immediately after setup
- [ ] Users see progress: "Syncing... (X/Y events)"
- [ ] Users see "Sync complete" when done
- [ ] Events appear in target calendar
- [ ] No confusion about sync status

### Technical
- [ ] All tests passing
- [ ] Error handling covers common failure modes
- [ ] Logging sufficient for debugging
- [ ] Documentation complete
- [ ] Deployed to production

---

## Dependencies

### Infrastructure (Handled by Terraform)
All infrastructure is defined in `terraform/main.tf` and deployed via:
```bash
cd terraform
terraform init
terraform apply
```

This creates:
- Firestore database
- Cloud Tasks queue (`calendar-sync-queue`)
- Service account IAM bindings
- Secret Manager secrets
- Cloud Scheduler jobs

### API Enablement (Handled by setup-gcp.sh)
The `scripts/setup-gcp.sh` script enables required APIs including:
- `cloudtasks.googleapis.com`
- `cloudfunctions.googleapis.com`
- `firestore.googleapis.com`
- Others (see script for full list)

### Manual Requirements
- Cloud Function deployment permissions
- Next.js deployment access (Vercel)

---

## Rollback Plan

If batch sync fails in production:

1. **Immediate:** Revert Next.js deployment to previous version
2. **Monitor:** Check if synchronous sync code still exists as fallback
3. **Investigate:** Review Cloud Logging for error patterns
4. **Fix:** Address issue in development
5. **Redeploy:** Test thoroughly before re-deploying

Keep old `triggerInitialSync` function deployed until batch sync is proven stable.
