# Cloud Tasks Flow - Detailed Step-by-Step

## Overview

When your app processes a batch and discovers more pages exist, it creates a Cloud Tasks task that will callback to continue processing. This works identically in local dev and production.

---

## Complete Flow with Details

### Step 1: ✅ Cloud Tasks Created in GCP

**Trigger:** Your app finishes processing page 1 of a calendar

**Location:** `batch-sync.service.ts:196-202`

```typescript
if (result.nextPageToken) {
  await createBatchTask({
    userId: "115699614043593531056",
    batchStateId: "115699614043593531056_primary_1763344076469",
    batchNumber: 2,
    scheduleTime: Date.now() + 10000  // Current time + 10 seconds
  });
}
```

**What happens in `createBatchTask()`:**

```typescript
// cloud-tasks.service.ts:38-51
const project = "calendar-merge-1759477062"  // From GCP_PROJECT
const serviceAccountEmail = "calendar-sync-sa@calendar-merge-1759477062.iam.gserviceaccount.com"

// ✅ Both exist now - no early return!
if (!project || !serviceAccountEmail) {
  // This block is SKIPPED now
}

// Continue to create the task...
const tasksClient = new CloudTasksClient();
const location = "us-central1";
const queue = "calendar-sync-queue";
const queuePath = "projects/calendar-merge-1759477062/locations/us-central1/queues/calendar-sync-queue";
const url = "https://cleaners-intellectual-guardian-intermediate.trycloudflare.com/batch/continue";

const payload = {
  userId: "115699614043593531056",
  batchStateId: "115699614043593531056_primary_1763344076469",
  batchNumber: 2
};

const task = {
  httpRequest: {
    httpMethod: 'POST',
    url: url,  // Your tunnel URL
    headers: {
      'Content-Type': 'application/json',
    },
    body: Buffer.from(JSON.stringify(payload)).toString('base64'),
    oidcToken: {
      serviceAccountEmail: "calendar-sync-sa@calendar-merge-1759477062.iam.gserviceaccount.com"
    },
  },
  scheduleTime: {
    seconds: Math.floor((Date.now() + 10000) / 1000)  // Unix timestamp
  },
};

// Actually create the task via GCP API
const [response] = await tasksClient.createTask({
  parent: queuePath,
  task
});
```

**Result:**
```
Task created: projects/calendar-merge-1759477062/locations/us-central1/queues/calendar-sync-queue/tasks/12345
```

**Logs you'll see:**
```
[INFO] Created Cloud Task for batch 2, state: 115699614043593531056_primary_1763344076469
  taskName: "projects/.../tasks/12345"
```

**What's stored in GCP:**
- **Queue:** `calendar-sync-queue` in `us-central1`
- **Task ID:** Randomly generated (e.g., `12345`)
- **Payload:** Base64-encoded JSON with userId, batchStateId, batchNumber
- **Execute at:** Current time + 10 seconds
- **Callback URL:** Your tunnel URL + `/batch/continue`
- **Auth:** OIDC token signed by service account

---

### Step 2: ✅ Wait 10 Seconds

**What happens:** Cloud Tasks holds the task in the queue

**GCP Infrastructure doing the waiting:**
- Task sits in `calendar-sync-queue`
- Status: `SCHEDULED`
- Cloud Tasks monitors the `scheduleTime`
- When current time >= scheduleTime, task becomes `RUNNING`

**During this time:**
- Your app has already returned from processing page 1
- User might trigger other operations
- Other calendars might be processing
- The task is just sitting in GCP's queue

**You can check the task status:**
```bash
gcloud tasks list --queue=calendar-sync-queue --location=us-central1
```

Output:
```
NAME                                          STATE      SCHEDULE_TIME
tasks/12345                                   SCHEDULED  2025-11-17T01:48:11Z
```

**Logs you'll see:** (None - GCP is waiting silently)

---

### Step 3: ✅ Cloud Tasks Makes HTTP POST Request

**Trigger:** 10 seconds have elapsed

**What Cloud Tasks does:**

1. **Generate OIDC Token:**
   ```
   Cloud Tasks → Google Auth Service
   "Sign a token using calendar-sync-sa@... for audience: https://cleaners-intellectual-guardian-intermediate.trycloudflare.com"

   Returns: eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

2. **Prepare HTTP Request:**
   ```
   POST https://cleaners-intellectual-guardian-intermediate.trycloudflare.com/batch/continue

   Headers:
     Content-Type: application/json
     Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
     User-Agent: Google-Cloud-Tasks
     X-CloudTasks-QueueName: calendar-sync-queue
     X-CloudTasks-TaskName: tasks/12345
     X-CloudTasks-TaskRetryCount: 0
     X-CloudTasks-TaskExecutionCount: 1

   Body (decoded from base64):
   {
     "userId": "115699614043593531056",
     "batchStateId": "115699614043593531056_primary_1763344076469",
     "batchNumber": 2
   }
   ```

3. **Make the HTTP Request:**
   ```
   Cloud Tasks → Internet → Cloudflare CDN
   ```

**Cloud Tasks retry behavior:**
- If request fails (timeout, 5xx error): Retry with exponential backoff
- Max retries: Configurable (default: unlimited with backoff)
- Retry interval: 1s, 2s, 4s, 8s, 16s, ... up to max (default: 1 hour)
- If request succeeds (2xx response): Delete task from queue

**Logs you'll see in GCP Cloud Tasks console:**
```
Task 12345: Executing
  URL: https://cleaners-intellectual-guardian-intermediate.trycloudflare.com/batch/continue
  Attempt: 1
  Status: Success (200)
  Duration: 2.3s
```

---

### Step 4: ✅ Tunnel Routes to localhost:8080

**Cloudflare Tunnel receives the request:**

```
Cloudflare Edge Server (San Francisco)
    |
    +-> DNS: cleaners-intellectual-guardian-intermediate.trycloudflare.com
    |
    +-> Tunnel routing table:
        "Route all requests to tunnel ID: abc123..."
    |
    +-> Find active tunnel connection
        Tunnel daemon running on: trilliumsmith's laptop
        Connected via: WebSocket to Cloudflare
    |
    +-> Send request through tunnel:
        POST /batch/continue
        Headers: [all from Cloud Tasks]
        Body: {"userId":"...","batchStateId":"...","batchNumber":2}
```

**Your local tunnel daemon forwards:**

```
cloudflared process (running in terminal)
    |
    +-> Receives HTTP request from Cloudflare
    |
    +-> Forwards to: http://localhost:8080/batch/continue
    |
    +-> Preserves all headers (including Authorization)
```

**You'll see in tunnel terminal:**
```
2025-11-17T01:48:11Z INF Request: POST /batch/continue
2025-11-17T01:48:11Z INF Proxying to http://localhost:8080
```

---

### Step 5: ✅ Your App Processes Page 2

**Express receives the request:**

```
Express app (localhost:8080)
    |
    +-> Request logging middleware (index.ts:47)
```

**Logs:**
```
[INFO] Incoming request {
  method: 'POST',
  path: '/batch/continue',
  headers: {
    'content-type': 'application/json',
    'user-agent': 'Google-Cloud-Tasks',
    'authorization': 'Bearer eyJ...'
  }
}
```

**Route matching:**
```
routes/index.ts:25
  router.use('/batch', createBatchRoutes())
      |
      +-> routes/batch.routes.ts:15
          router.post('/continue', continueBatch)
              |
              +-> controllers/batch.controller.ts:18
                  export async function continueBatch(req, res)
```

**Controller processes:**

```typescript
// batch.controller.ts:18-59

const { batchStateId, batchNumber } = req.body;
// batchStateId: "115699614043593531056_primary_1763344076469"
// batchNumber: 2

// Load state from Firestore
const state = await db.getDoc('batchStates', batchStateId);
/*
state = {
  userId: "115699614043593531056",
  calendarId: "primary",
  targetCalendarId: "target@gmail.com",
  batchNumber: 1,
  currentPageToken: "page2token",  ← WHERE TO RESUME
  processedEvents: 50,
  status: "processing"
}
*/

// Mark as processing
await db.updateDoc('batchStates', batchStateId, {
  status: 'processing',
  batchNumber: 2,  // Update to current batch
  updatedAt: Date.now(),
});

// Process next page using saved pageToken
const result = await syncEventsBatchPaginated(
  state.userId,
  state.calendarId,
  state.targetCalendarId,
  state.currentPageToken  // ← "page2token"
);
/*
result = {
  processedCount: 50,
  nextPageToken: "page3token",  ← MORE PAGES!
  finalSyncToken: null
}
*/
```

**Logs:**
```
[INFO] Processing batch 2 for state 115699614043593531056_primary_1763344076469
[INFO] Fetching events with pageToken: page2token
[INFO] Google Calendar API returned 50 events
[INFO] Batch create complete: 50 successful, 0 failed
```

**Update Firestore:**
```typescript
await db.updateDoc('batchStates', batchStateId, {
  processedEvents: state.processedEvents + result.processedCount,  // 50 + 50 = 100
  currentPageToken: result.nextPageToken,  // "page3token"
  initialSyncToken: result.finalSyncToken || state.initialSyncToken,
  updatedAt: Date.now(),
});
```

**More pages? Create next task:**
```typescript
if (result.nextPageToken) {  // "page3token" exists!
  await createBatchTask({
    userId: state.userId,
    batchStateId,
    batchNumber: 3,  // Next batch
    scheduleTime: Date.now() + 10000,  // +10 seconds
  });

  // This creates another Cloud Tasks task for batch 3
  // The cycle repeats!
}
```

**Logs:**
```
[INFO] Scheduled batch 3 for state 115699614043593531056_primary_1763344076469
[INFO] Created Cloud Task for batch 3, state: 115699614043593531056_primary_1763344076469
  taskName: "projects/.../tasks/67890"
```

**Return response to Cloud Tasks:**
```typescript
res.status(200).json({
  message: 'Batch processed, next batch scheduled',
  batchNumber: 2,
  nextBatch: 3,
  processedThisBatch: 50,
  totalProcessed: 100,
});
```

**Cloud Tasks receives 200 OK:**
- Task marked as successful
- Task deleted from queue
- No retry needed

---

### Step 6: 🔄 Cycle Repeats (10 seconds later)

**Cloud Tasks executes task 67890 (batch 3):**

```
[10 seconds later]

Cloud Tasks → HTTP POST /batch/continue
  Body: { batchNumber: 3, batchStateId: "...", userId: "..." }
    |
    v
Tunnel → localhost:8080
    |
    v
continueBatch() → Process page 3 (pageToken: "page3token")
    |
    +-> 50 more events processed
    +-> totalProcessed: 150
    +-> nextPageToken: "page4token"
    |
    +-> Create Cloud Tasks task for batch 4

[10 seconds later]

Cloud Tasks → Batch 4...

[Eventually - no more pages]

continueBatch() → Process final page
    |
    +-> 20 events processed
    +-> totalProcessed: 170
    +-> nextPageToken: null  ← DONE!
    +-> finalSyncToken: "syncABC123"
    |
    +-> Mark batchState as "completed"
    +-> Save syncToken to watch channel
    +-> NO new Cloud Tasks task created
```

---

## Firestore State Progression

### After Page 1:
```javascript
batchStates/{batchStateId}: {
  batchNumber: 1,
  processedEvents: 50,
  currentPageToken: "page2token",
  status: "processing"
}
```

### After Page 2:
```javascript
batchStates/{batchStateId}: {
  batchNumber: 2,
  processedEvents: 100,
  currentPageToken: "page3token",
  status: "processing"
}
```

### After Page 3:
```javascript
batchStates/{batchStateId}: {
  batchNumber: 3,
  processedEvents: 150,
  currentPageToken: "page4token",
  status: "processing"
}
```

### After Final Page:
```javascript
batchStates/{batchStateId}: {
  batchNumber: 4,
  processedEvents: 170,
  currentPageToken: null,
  initialSyncToken: "syncABC123",
  status: "completed"
}

watches/{channelId}: {
  syncToken: "syncABC123",  ← Saved for incremental sync
  syncState: {
    status: "completed",
    processedEvents: 170,
    completedAt: 1763344200000
  }
}
```

---

## Key Differences: Local vs Production

### Local Dev (Current Setup):
```
[Your Laptop]
  |
  +-> Express app (localhost:8080)
  |
  +-> Cloudflare Tunnel daemon
      |
      +-> WebSocket to Cloudflare Edge
          |
          +-> Public URL: https://cleaners-intellectual-guardian-intermediate.trycloudflare.com
              |
              +-> Cloud Tasks makes requests here
```

**Characteristics:**
- ✅ Uses production Cloud Tasks service
- ✅ Real GCP queue (`calendar-sync-queue`)
- ✅ Real OIDC authentication
- ✅ Same code path as production
- ⚠️ Tunnel URL changes on restart
- ⚠️ Tunnel must be running
- 💰 Uses GCP quota/billing

### Production (Cloud Run):
```
[GCP Infrastructure]
  |
  +-> Cloud Run container
      |
      +-> Public URL: https://calendar-sync-abc123.run.app
          |
          +-> Cloud Tasks makes requests here
```

**Characteristics:**
- ✅ Same Cloud Tasks service
- ✅ Same queue
- ✅ Same OIDC authentication
- ✅ Stable URL (doesn't change)
- ✅ Auto-scales
- 💰 Uses GCP quota/billing

**The only difference:** How the app is hosted. The Cloud Tasks flow is identical!

---

## Monitoring & Debugging

### Check Cloud Tasks Queue:
```bash
# List all tasks in queue
gcloud tasks list --queue=calendar-sync-queue --location=us-central1

# Get details of specific task
gcloud tasks describe TASK_ID --queue=calendar-sync-queue --location=us-central1

# View queue configuration
gcloud tasks queues describe calendar-sync-queue --location=us-central1
```

### Check Logs:
```bash
# Cloud Tasks execution logs
gcloud logging read "resource.type=cloud_tasks_queue AND resource.labels.queue_id=calendar-sync-queue" --limit=50

# Your app logs (local)
# Just watch your terminal where pnpm dev is running

# Your app logs (production)
gcloud logging read "resource.type=cloud_run_revision" --limit=50
```

### Force Delete Stuck Task:
```bash
gcloud tasks delete TASK_ID --queue=calendar-sync-queue --location=us-central1
```

---

## Troubleshooting

### "Task keeps retrying"
- Check your `/batch/continue` endpoint returns 200
- Check logs for errors during processing
- Cloud Tasks retries on 5xx errors or timeouts

### "Task not executing"
- Check queue is not paused: `gcloud tasks queues describe calendar-sync-queue --location=us-central1`
- Check tunnel is running: `ps aux | grep cloudflared`
- Check tunnel URL matches GCP_BACKEND_URL

### "OIDC authentication failed"
- Verify GCP_SERVICE_ACCOUNT_EMAIL is correct
- Verify service account has Cloud Tasks Enqueuer role
- Check Authorization header in logs

### "Can't create tasks"
- Verify queue exists: `gcloud tasks queues list --location=us-central1`
- Create if missing: `gcloud tasks queues create calendar-sync-queue --location=us-central1`
- Check IAM permissions for creating tasks

---

## Summary

**Local Dev Now Works Exactly Like Production:**

1. App processes page 1 → Creates Cloud Tasks task
2. Cloud Tasks waits 10 seconds (in GCP)
3. Cloud Tasks calls tunnel URL with OIDC auth
4. Tunnel routes to localhost:8080
5. App processes page 2 → Creates next task
6. Repeat until all pages done

**No "local-dev-skipped" anymore!** 🎉
