# Using Real Cloud Tasks for Local Development

**Date**: 2025-11-14
**Status**: 💡 Recommended Approach
**Goal**: Use production Cloud Tasks (free tier) instead of emulator

---

## Why This Is Better Than Emulation

### Current Setup: You Already Have HTTPS Tunnel!

Looking at `gcp/.env`:
```bash
CLOUD_FUNCTION_URL=https://sector-ace-shell-warranties.trycloudflare.com
```

**You're already exposing localhost:8080 to the internet via cloudflared!**

This means:
- ✅ Google Calendar webhooks can reach you (already working)
- ✅ **Cloud Tasks can reach you too** (same mechanism!)
- ✅ No emulator needed
- ✅ Tests real GCP infrastructure
- ✅ Free tier: 1M operations/month

### Comparison

| Approach | Pros | Cons |
|----------|------|------|
| **Emulator** | No GCP needed | Community-maintained, doesn't test real service, extra process |
| **Real Cloud Tasks** ⭐ | Tests real service, free tier generous, no extra process, already have tunnel | Requires GCP project (you have one) |

---

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ LOCAL DEVELOPMENT (via cloudflared tunnel)                  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Your Machine (localhost:8080)                               │
│       ↕                                                       │
│  cloudflared tunnel                                          │
│       ↕                                                       │
│  https://sector-ace-shell-warranties.trycloudflare.com       │
│                                                               │
└───────────────────────────────────┬─────────────────────────┘
                                    │
                                    │ HTTPS (public internet)
                                    │
┌───────────────────────────────────┴─────────────────────────┐
│ GOOGLE CLOUD (calendar-merge-1759477062)                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Cloud Tasks Queue                                           │
│    └─> Schedule task (10 seconds)                           │
│    └─> Execute: POST https://sector-ace...trycloudflare.com │
│                                                               │
│  Google Calendar API                                         │
│    └─> Send webhooks to: https://sector-ace...              │
│                       (already working!)                     │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. User triggers sync
   └─> POST https://sector-ace-shell-warranties.trycloudflare.com/sync/trigger

2. Your local Express server processes batch 1
   └─> Syncs 50 events via Google Calendar API

3. Creates Cloud Task (REAL GCP Cloud Tasks)
   └─> Schedule: +10 seconds
   └─> URL: https://sector-ace-shell-warranties.trycloudflare.com/batch/continue
   └─> Body: { userId: "user123", batchNumber: 2 }

4. Your function returns immediately
   └─> No compute waste! ✅

5. Cloud Tasks waits 10 seconds

6. Cloud Tasks executes task
   └─> POST https://sector-ace-shell-warranties.trycloudflare.com/batch/continue
   └─> Goes through cloudflared tunnel
   └─> Reaches your localhost:8080

7. Your local server processes batch 2
   └─> Repeat until complete
```

---

## Setup (Minimal Changes)

### No Docker Needed! 🎉

Your existing 3-process setup stays the same:
```bash
Terminal 1: cd gcp && pnpm dev          # Express server on :8080
Terminal 2: cd nextjs && pnpm dev       # Next.js on :3000
Terminal 3: cloudflared tunnel ...      # HTTPS tunnel (already doing this!)
```

### Configuration Changes

#### 1. Update `gcp/.env` (ADDITIONS)

```bash
# Cloud Tasks Configuration (use REAL Cloud Tasks)
# No emulator host needed - we'll use production Cloud Tasks!
CLOUD_TASKS_PROJECT_ID=calendar-merge-1759477062  # Your real project
CLOUD_TASKS_LOCATION=us-central1
CLOUD_TASKS_QUEUE=calendar-sync-queue

# Important: Tasks will call this URL (your cloudflared tunnel)
# This is ALREADY set for webhooks!
CLOUD_FUNCTION_URL=https://sector-ace-shell-warranties.trycloudflare.com
```

#### 2. Update `gcp/src/config/app.config.ts` (ADDITIONS)

```typescript
export const APP_CONFIG = {
  // ... existing config

  // Cloud Tasks (use real Cloud Tasks, even in dev)
  CLOUD_TASKS_PROJECT_ID: process.env.CLOUD_TASKS_PROJECT_ID || process.env.GCP_PROJECT || '',
  CLOUD_TASKS_LOCATION: process.env.CLOUD_TASKS_LOCATION || 'us-central1',
  CLOUD_TASKS_QUEUE: process.env.CLOUD_TASKS_QUEUE || 'calendar-sync-queue',
} as const;
```

### That's It!

No docker-compose, no emulator, no extra processes. Just use the real Cloud Tasks service.

---

## Authentication

### Development (Local with Tunnel)

Cloud Tasks will use **OIDC token authentication** when calling your endpoint:

```typescript
// Cloud Tasks creates task with OIDC token
const task = {
  httpRequest: {
    url: 'https://sector-ace-shell-warranties.trycloudflare.com/batch/continue',
    oidcToken: {
      serviceAccountEmail: `calendar-merge-1759477062@appspot.gserviceaccount.com`,
    },
  },
};
```

**For local dev**: You may need to disable/relax OIDC verification or add middleware to handle it.

**Option 1**: Skip OIDC verification in development
```typescript
// In your endpoint handler
if (APP_CONFIG.NODE_ENV === 'development') {
  // Skip OIDC verification for local tunnel
} else {
  // Verify OIDC token in production
}
```

**Option 2**: Accept tasks from your service account
```typescript
// Verify the Authorization header contains valid OIDC token
// from your service account
```

---

## Advantages Over Emulator

### 1. **No Extra Process**
- ❌ Emulator: Need to run Docker container
- ✅ Real: Just use what you already have

### 2. **Tests Real Infrastructure**
- ❌ Emulator: Community-maintained, may have quirks
- ✅ Real: Exact same service as production

### 3. **Better Debugging**
- ❌ Emulator: Limited observability
- ✅ Real: View tasks in GCP Console
  - See task status, retries, errors
  - Full Cloud Logging integration
  - Monitor queue backlog

### 4. **Production Parity**
- ❌ Emulator: Different behavior possible
- ✅ Real: Identical to production

### 5. **No Installation**
- ❌ Emulator: Requires Docker, port management
- ✅ Real: Just gcloud auth (already have)

### 6. **Built-in Rate Limiting & Retries** ⭐
- ❌ Emulator: Limited configuration support
- ✅ Real: Queue-level rate limiting + automatic retry with exponential backoff
  - Set `max-dispatches-per-second` at queue level
  - Automatic retry configuration
  - No code changes needed!

---

## Cloud Tasks Queue Configuration (The Secret Weapon)

### Rate Limiting at Queue Level

Cloud Tasks can **enforce rate limits automatically** - no code needed!

```bash
gcloud tasks queues update calendar-sync-queue \
  --max-dispatches-per-second=5 \
  --max-concurrent-dispatches=10 \
  --location=us-central1
```

**What this means**:
- **5 dispatches/second** = 500 dispatches/100 seconds
- **Exactly at Google Calendar API quota limit!**
- Cloud Tasks **automatically spaces out** task execution
- **No sleep() needed in your code at all!**

### Simplified Code Flow

**Before** (manual rate limiting):
```typescript
for (let i = 0; i < events.length; i += 50) {
  await processBatch(events.slice(i, i + 50));

  if (i + 50 < events.length) {
    await sleep(10000); // Manual 10-second delay
  }
}
```

**After** (queue handles rate limiting):
```typescript
// Just create all tasks immediately!
for (let i = 0; i < events.length; i += 50) {
  await createBatchTask(userId, batchNumber++);
  // Cloud Tasks queue automatically spaces them to 5/second
}

// Function returns immediately - no waiting!
```

### Retry Configuration

Configure automatic retries with exponential backoff:

```bash
gcloud tasks queues update calendar-sync-queue \
  --max-attempts=3 \
  --min-backoff=10s \
  --max-backoff=300s \
  --max-doublings=5 \
  --location=us-central1
```

**Retry Schedule** (automatic):
- Attempt 1: Immediate
- Attempt 2: +10 seconds (if failed)
- Attempt 3: +20 seconds (if failed again)
- Give up after 3 attempts

**Your code**: Just throw an error if batch fails - Cloud Tasks handles retries!

### Queue Configuration Options

| Setting | Description | Recommended Value |
|---------|-------------|-------------------|
| `max-dispatches-per-second` | Max task execution rate | `5` (matches Google API limit) |
| `max-concurrent-dispatches` | Max parallel tasks | `10` (reasonable for API) |
| `max-attempts` | Retry count for failed tasks | `3` |
| `min-backoff` | Initial retry delay | `10s` |
| `max-backoff` | Maximum retry delay | `300s` (5 minutes) |
| `max-doublings` | Backoff exponential steps | `5` |

### Benefits

✅ **No more BATCH_DELAY_MS config** - queue handles it
✅ **No sleep() calls** - queue handles it
✅ **No manual retry logic** - queue handles it
✅ **No rate limit tracking** - queue handles it
✅ **Simpler code** - just create tasks and return
✅ **Better scalability** - queue buffers tasks automatically

---

## File Structure

```
calendar-merge-service/
├── gcp/
│   ├── src/
│   │   ├── services/
│   │   │   ├── cloud-tasks.service.ts          # NEW - Cloud Tasks wrapper
│   │   │   ├── google-calendar-batch.service.ts # MODIFIED - Use Cloud Tasks
│   │   │   └── batch-sync.service.ts           # MODIFIED - Track batch state
│   │   ├── config/
│   │   │   └── app.config.ts                   # MODIFIED - Add Cloud Tasks config
│   │   ├── controllers/
│   │   │   └── batch.controller.ts             # NEW - /batch/continue endpoint
│   │   └── types/
│   │       └── sync.types.ts                   # MODIFIED - Batch progress types
│   └── .env                                    # MODIFIED - Cloud Tasks config
└── wip/gcp/cloud_task/
    ├── PLAN.md                                 # Original plan
    ├── REAL_CLOUD_TASKS.md                    # This file
    └── IMPLEMENTATION.md                       # Implementation steps (TODO)
```

---

## Implementation Overview

### Step 1: Create Cloud Tasks Service Wrapper

```typescript
// gcp/src/services/cloud-tasks.service.ts
import { CloudTasksClient } from '@google-cloud/tasks';
import { APP_CONFIG } from '../config';

const client = new CloudTasksClient();

export async function createBatchTask(
  userId: string,
  batchNumber: number,
  delaySeconds: number = 10
): Promise<string> {
  const queuePath = client.queuePath(
    APP_CONFIG.CLOUD_TASKS_PROJECT_ID,
    APP_CONFIG.CLOUD_TASKS_LOCATION,
    APP_CONFIG.CLOUD_TASKS_QUEUE
  );

  const url = `${APP_CONFIG.CLOUD_FUNCTION_URL}/batch/continue`;
  const payload = { userId, batchNumber };

  const task = {
    httpRequest: {
      httpMethod: 'POST',
      url,
      headers: { 'Content-Type': 'application/json' },
      body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      oidcToken: {
        serviceAccountEmail: `${APP_CONFIG.CLOUD_TASKS_PROJECT_ID}@appspot.gserviceaccount.com`,
      },
    },
    scheduleTime: {
      seconds: Math.floor(Date.now() / 1000) + delaySeconds,
    },
  };

  const [response] = await client.createTask({ parent: queuePath, task });
  return response.name!;
}
```

### Step 2: Replace sleep() in Batch Service

```typescript
// Before:
if (i + batchSize < events.length) {
  await sleep(APP_CONFIG.BATCH_DELAY_MS);
}

// After:
if (i + batchSize < events.length) {
  const nextBatchNumber = Math.floor(i / batchSize) + 2;
  await createBatchTask(userId, nextBatchNumber, 10);
  // Return immediately - no waiting!
  return { status: 'scheduled', nextBatch: nextBatchNumber };
}
```

### Step 3: Add /batch/continue Endpoint

```typescript
// gcp/src/controllers/batch.controller.ts
export async function continueBatch(req: Request, res: Response) {
  const { userId, batchNumber } = req.body;

  // Resume batch processing from saved state
  const result = await batchSyncContinue(userId, batchNumber);

  res.status(200).json(result);
}
```

---

## Testing Locally

### 1. Ensure Tunnel is Running

```bash
# Terminal 3
cloudflared tunnel --url http://localhost:8080

# Note the URL (e.g., https://sector-ace-shell-warranties.trycloudflare.com)
```

### 2. Update .env with Tunnel URL

```bash
CLOUD_FUNCTION_URL=https://sector-ace-shell-warranties.trycloudflare.com
```

### 3. Create Cloud Tasks Queue (One-Time Setup)

```bash
# Create queue with rate limiting and retry configuration
gcloud tasks queues create calendar-sync-queue \
  --location=us-central1 \
  --project=calendar-merge-1759477062 \
  --max-dispatches-per-second=5 \
  --max-concurrent-dispatches=10 \
  --max-attempts=3 \
  --min-backoff=10s \
  --max-backoff=300s \
  --max-doublings=5
```

**What this does**:
- `--max-dispatches-per-second=5`: Enforces 5 req/sec = 500 req/100s (Google's limit!)
- `--max-concurrent-dispatches=10`: Limits parallel execution
- `--max-attempts=3`: Retry failed tasks up to 3 times
- `--min-backoff=10s`: Start with 10s delay between retries
- `--max-backoff=300s`: Cap retry delays at 5 minutes
- `--max-doublings=5`: Exponential backoff (10s, 20s, 40s, 80s, 160s, 300s)

**This eliminates ALL manual rate limiting and retry logic from your code!** 🎉

### 4. Trigger Sync

```bash
curl -X POST https://sector-ace-shell-warranties.trycloudflare.com/sync/trigger \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user-123"}'
```

### 5. Watch Logs

```bash
# In gcp terminal
# You should see:
[INFO] Processing batch 1/5
[INFO] Creating Cloud Task for batch 2
[INFO] Task created: projects/.../tasks/abc123
[INFO] Function returning immediately
--- Wait 10 seconds ---
[INFO] Received Cloud Task: batch 2/5
[INFO] Processing batch 2/5
...
```

### 6. Monitor in GCP Console

Visit: https://console.cloud.google.com/cloudtasks/queue/us-central1/calendar-sync-queue

You'll see:
- Tasks being created
- Scheduled execution times
- Task status (pending, executed, failed)
- Retry attempts

---

## Debugging

### Check if Queue Exists

```bash
gcloud tasks queues describe calendar-sync-queue \
  --location=us-central1 \
  --project=calendar-merge-1759477062
```

### List Recent Tasks

```bash
gcloud tasks list \
  --queue=calendar-sync-queue \
  --location=us-central1 \
  --project=calendar-merge-1759477062
```

### View Task Details

```bash
gcloud tasks describe TASK_NAME \
  --queue=calendar-sync-queue \
  --location=us-central1 \
  --project=calendar-merge-1759477062
```

### Check Logs

```bash
# Cloud Tasks logs
gcloud logging read "resource.type=cloud_tasks_queue" \
  --limit=50 \
  --format=json

# Your function logs (same as always)
# Just look in your terminal running `pnpm dev`
```

---

## Handling OIDC Tokens (Security)

### Development: Relaxed Security

For local development, you can skip OIDC verification:

```typescript
// gcp/src/middleware/auth.middleware.ts
export function verifyCloudTasksAuth(req: Request, res: Response, next: NextFunction) {
  if (APP_CONFIG.NODE_ENV === 'development') {
    // Allow all requests in dev (cloudflared tunnel is already semi-secure)
    return next();
  }

  // Production: verify OIDC token
  const authHeader = req.headers.authorization;
  // ... verify JWT token from Cloud Tasks
}
```

### Production: Full Security

In production (actual Cloud Function), verify the OIDC token:

```typescript
import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client();

export async function verifyCloudTasksAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: APP_CONFIG.CLOUD_FUNCTION_URL,
    });

    const payload = ticket.getPayload();
    // Verify email matches your service account
    if (payload?.email !== `${APP_CONFIG.GCP_PROJECT_ID}@appspot.gserviceaccount.com`) {
      return res.status(403).json({ error: 'Invalid service account' });
    }

    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid OIDC token' });
  }
}
```

---

## Advantages Summary

| Feature | Emulator | Real Cloud Tasks |
|---------|----------|------------------|
| **Setup Complexity** | Medium (Docker) | Low (already have tunnel) |
| **Processes Needed** | 4 (add Docker) | 3 (same as now) |
| **Tests Real GCP** | ❌ No | ✅ Yes |
| **Debugging Tools** | Limited | Full GCP Console |
| **Production Parity** | ~80% | 100% |
| **Observability** | Logs only | Metrics + Logs + Traces |

---

## Recommendation

**Use Real Cloud Tasks** ⭐

Reasons:
1. You already have the infrastructure (cloudflared tunnel)
2. Tests the actual production service
3. Better debugging with GCP Console
4. No extra processes to manage
5. Perfect production parity

---

## Handling Batch Failures and Retries

### Understanding Partial Batch Failures

When you send a batch of 50 calendar events to Google Calendar API, **individual requests can fail independently**:

```
Batch Request (50 events):
├─ Event 1:  200 OK ✓
├─ Event 2:  200 OK ✓
├─ Event 3:  200 OK ✓
├─ ...
├─ Event 43: 429 Rate Limit Exceeded ✗
├─ Event 44: 429 Rate Limit Exceeded ✗
├─ ...
└─ Event 50: 429 Rate Limit Exceeded ✗

Result: 42 success, 8 failed (need retry)
```

**Key Point**: The whole batch doesn't fail! Each request gets its own status code in the multipart response.

### Parsing Batch Responses

```typescript
// gcp/src/services/google-calendar-batch.service.ts
interface BatchResult {
  successful: string[];  // Event IDs that synced
  failed: string[];      // Event IDs that need retry
  rateLimited: string[]; // Event IDs that hit 429
}

async function processBatchRequest(events: CalendarEvent[]): Promise<BatchResult> {
  const result: BatchResult = {
    successful: [],
    failed: [],
    rateLimited: []
  };

  // Send batch request to Google Calendar API
  const batchResponse = await calendar.events.batch({
    // ... batch request payload
  });

  // Parse multipart response
  batchResponse.responses.forEach((response, index) => {
    const eventId = events[index].id;

    if (response.status === 200 || response.status === 201) {
      result.successful.push(eventId);
    } else if (response.status === 429) {
      result.rateLimited.push(eventId);
      logger.warn(`Event ${eventId} rate limited`);
    } else {
      result.failed.push(eventId);
      logger.error(`Event ${eventId} failed: ${response.status}`);
    }
  });

  return result;
}
```

### Retry Strategy for Failed Events

When rate limited, create a **separate retry task** for only the failed events:

```typescript
// gcp/src/services/cloud-tasks.service.ts
export async function createRetryTask(
  userId: string,
  failedEventIds: string[],
  attempt: number = 1
): Promise<string> {
  const queuePath = client.queuePath(
    APP_CONFIG.CLOUD_TASKS_PROJECT_ID,
    APP_CONFIG.CLOUD_TASKS_LOCATION,
    APP_CONFIG.CLOUD_TASKS_QUEUE
  );

  const url = `${APP_CONFIG.CLOUD_FUNCTION_URL}/batch/retry`;
  const payload = {
    userId,
    eventIds: failedEventIds,
    attempt
  };

  // Use exponential backoff for retry delay
  const delaySeconds = Math.min(60 * Math.pow(2, attempt - 1), 300); // 60s, 120s, 240s, max 300s

  const task = {
    httpRequest: {
      httpMethod: 'POST',
      url,
      headers: { 'Content-Type': 'application/json' },
      body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      oidcToken: {
        serviceAccountEmail: `${APP_CONFIG.CLOUD_TASKS_PROJECT_ID}@appspot.gserviceaccount.com`,
      },
    },
    scheduleTime: {
      seconds: Math.floor(Date.now() / 1000) + delaySeconds,
    },
  };

  const [response] = await client.createTask({ parent: queuePath, task });
  logger.info(`Retry task created for ${failedEventIds.length} events, attempt ${attempt}, delay ${delaySeconds}s`);
  return response.name!;
}
```

### Complete Batch Processing Flow

```typescript
// gcp/src/services/batch-sync.service.ts
export async function processBatch(
  userId: string,
  batchNumber: number
): Promise<void> {
  // 1. Load batch state from Firestore
  const batchState = await getBatchState(userId, batchNumber);
  const offset = batchState.offset;
  const batchSize = batchState.batchSize;

  // 2. Fetch events to sync
  const events = await fetchEventsToSync(userId, offset, batchSize);

  if (events.length === 0) {
    logger.info(`Batch ${batchNumber} complete - no more events`);
    return;
  }

  // 3. Send batch request and parse responses
  const result = await processBatchRequest(events);

  // 4. Update Firestore for successful syncs
  await markEventsAsSynced(result.successful);

  // 5. Handle failures
  const allFailed = [...result.failed, ...result.rateLimited];

  if (allFailed.length > 0) {
    logger.warn(`${allFailed.length} events failed in batch ${batchNumber}`);

    // Create retry task for failed events only
    await createRetryTask(userId, allFailed, batchState.attempt || 1);
  }

  // 6. Update batch state
  await updateBatchState(userId, batchNumber, {
    processed: result.successful.length,
    failed: allFailed.length,
    completedAt: new Date()
  });

  // 7. If more events remain, create next batch task
  const totalEvents = await getEventCount(userId);
  const nextOffset = offset + batchSize;

  if (nextOffset < totalEvents) {
    await createBatchTask(userId, batchNumber + 1);
  } else {
    logger.info(`All batches queued for user ${userId}`);
  }
}
```

### Retry Handler Endpoint

```typescript
// gcp/src/controllers/batch.controller.ts
export async function retryFailedEvents(req: Request, res: Response) {
  const { userId, eventIds, attempt } = req.body;

  logger.info(`Retrying ${eventIds.length} events, attempt ${attempt}`);

  // 1. Fetch specific events by ID
  const events = await fetchEventsByIds(userId, eventIds);

  // 2. Use smaller batch size for retries
  const retryBatchSize = Math.min(10, eventIds.length);

  for (let i = 0; i < events.length; i += retryBatchSize) {
    const chunk = events.slice(i, i + retryBatchSize);
    const result = await processBatchRequest(chunk);

    // 3. Track successes
    await markEventsAsSynced(result.successful);

    // 4. If still failing after max attempts, mark as permanently failed
    const stillFailed = [...result.failed, ...result.rateLimited];
    if (stillFailed.length > 0) {
      if (attempt >= 3) {
        logger.error(`${stillFailed.length} events permanently failed after ${attempt} attempts`);
        await markEventsAsFailed(stillFailed);
      } else {
        // Retry again with increased backoff
        await createRetryTask(userId, stillFailed, attempt + 1);
      }
    }
  }

  res.status(200).json({
    retried: events.length,
    attempt
  });
}
```

---

## Single User vs Multi-User Configuration

### Single User (Current Setup)

**Important**: If you only have one user inserting events, rate limiting must be sequential:

```bash
# Recommended: 50 events per batch (fewer HTTP requests = more efficient)
# Single user quota: 500 queries/100 seconds
# Batch size: 50 events = 50 queries
# Max safe rate: 1 batch per 10 seconds

gcloud tasks queues update calendar-sync-queue \
  --max-dispatches-per-second=0.1 \  # 1 dispatch per 10 seconds
  --max-concurrent-dispatches=1 \     # ONLY 1 at a time (sequential)
  --location=us-central1
```

**Configuration in code**:
```bash
# gcp/.env
BATCH_API_SIZE=50        # 50 events per batch (maximum allowed by Google)
BATCH_DELAY_MS=10000     # Not used with Cloud Tasks, but kept for fallback
```

**Math**:
- 50 events/batch × 0.1 batches/sec = 5 events/sec
- 5 events/sec × 100 seconds = 500 events/100s ✅ (exactly at quota limit)
- 10,000 events = 200 batches = ~33 minutes total sync time

**Why this matters**:
- ⚠️ **Same user quota**: All batches consume the same user's 500/100s quota
- ⚠️ **Sequential only**: `max-concurrent-dispatches=1` prevents parallel execution
- ✅ **Predictable timing**: Batches execute exactly 10 seconds apart
- ✅ **Fewer HTTP requests**: 200 batch requests vs 400 if using 25-event batches

### Multi-User (Future Scaling)

**When you have multiple users**, each user has their own quota bucket:

```bash
gcloud tasks queues update calendar-sync-queue \
  --max-dispatches-per-second=5 \    # 5 dispatches per second
  --max-concurrent-dispatches=10 \   # Parallel is safe across users
  --location=us-central1
```

**Why parallel is safe**:
- ✅ **Separate quotas**: User A's batch doesn't affect User B's quota
- ✅ **Better throughput**: 10 users × 50 events = 500 events/sec (but each user only 5/sec)
- ✅ **No queue backup**: Tasks execute as fast as queue allows

**Example with 10 users**:
- 10 users syncing simultaneously
- Each user: 50 events/batch, their own 500/100s quota
- Queue dispatches 5 batches/sec across all users
- Each individual user still stays under their quota limit

---

## Compute Efficiency

**The Key Benefit: No Wasted Compute During Waits**

### Traditional Approach (sleep in function)
```javascript
// Function runs continuously for 33 minutes
for (let i = 0; i < 200; i++) {
  await processBatch(i);
  await sleep(10000);  // Function is RUNNING but doing nothing
}
// Total function execution time: ~2000 seconds
```

### Cloud Tasks Approach
```javascript
// Function runs for 2 seconds, then EXITS
await processBatch(batchNumber);
await createBatchTask(userId, batchNumber + 1, {scheduleDelaySeconds: 10});
return; // Function terminates immediately

// 10 seconds later, Cloud Tasks invokes function again
// Total function execution time per batch: 2 seconds
// Total across 200 batches: 400 seconds
```

**Timeline Visualization:**
```
Time    | Function Status           | Compute Running
──────────────────────────────────────────────────────
0s      | processBatchSync runs     | ✓ Yes
2s      | Function EXITS            | ✗ No
3s-10s  | (nothing running)         | ✗ No (Cloud Tasks holds the task)
10s     | processBatchSync runs     | ✓ Yes
12s     | Function EXITS            | ✗ No
13s-20s | (nothing running)         | ✗ No
20s     | processBatchSync runs     | ✓ Yes
...

Total compute time: 200 batches × 2 seconds = 400 seconds
Gap time (no compute): 200 gaps × 8 seconds = 1600 seconds saved
```

**Cloud Tasks acts as a scheduler**, not a worker:
1. Holds the task definition in its queue
2. Waits the specified delay
3. Invokes your function at the scheduled time
4. Your function runs briefly and exits

This is the entire point of using Cloud Tasks - avoiding holding up compute during sleep/wait times.

---

## Next Steps

1. ✅ Decision: Use real Cloud Tasks (not emulator)
2. ⬜ Create Cloud Tasks queue in GCP
3. ⬜ Implement `cloud-tasks.service.ts`
4. ⬜ Update batch sync to use Cloud Tasks
5. ⬜ Add `/batch/continue` endpoint
6. ⬜ Add `/batch/retry` endpoint for failed events
7. ⬜ Implement batch response parsing with partial failure handling
8. ⬜ Test with real GCP project
9. ⬜ Update documentation

---

## Questions?

- **Q**: What if cloudflared tunnel URL changes?
  - **A**: Update `CLOUD_FUNCTION_URL` in `.env` (same as you do now for webhooks)

- **Q**: Can I use this in CI/CD?
  - **A**: Yes! Use a test GCP project with real Cloud Tasks

- **Q**: What about emulator for CI where I can't use cloudflared?
  - **A**: For CI, use emulator. For local dev, use real Cloud Tasks.
