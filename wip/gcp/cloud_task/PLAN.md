# Cloud Tasks Implementation Plan

**Date**: 2025-11-14
**Status**: 📋 Planning
**Goal**: Replace `sleep()` delays with Cloud Tasks scheduling to eliminate compute waste

---

## Problem Statement

### Current Issue: Compute Waste with `sleep()`

**Scenario**: Syncing 2000 events with batch API
- 40 batches × 50 events each
- 39 × 10-second delays = **390 seconds of waiting**
- Cloud Function **running and billing** during all 390 seconds 💸

**Current Implementation** (`google-calendar-batch.service.ts`):
```typescript
for (let i = 0; i < events.length; i += batchSize) {
  const batch = events.slice(i, i + batchSize);

  // Process batch (actual work)
  await Promise.all(batch.map(event => calendar.events.insert(...)));

  // PROBLEM: Sleep holds compute
  if (i + batchSize < events.length) {
    await sleep(10000); // 10 seconds of billable idle time
  }
}
```

**Cost Impact**:
- ~6.5 minutes of wasted compute time per 2000-event sync
- With multiple users: significant cost increase
- Inefficient resource usage

---

## Solution: Cloud Tasks for Scheduling

### How Cloud Tasks Works

**Core Concept**: Asynchronous task queue with scheduled execution

1. **Create Task** with future `scheduleTime`
2. **Return immediately** (function ends, no billing)
3. **Cloud Tasks waits** (no compute cost)
4. **Task executes** at scheduled time via HTTP POST

### Architecture Change

**Before** (with sleep):
```
┌─────────────────────────────────────────────────┐
│ Cloud Function (billable for entire duration)   │
├─────────────────────────────────────────────────┤
│ Process Batch 1 (50 events)    [2 seconds]     │
│ sleep(10000)                    [10 seconds] ❌  │
│ Process Batch 2 (50 events)    [2 seconds]     │
│ sleep(10000)                    [10 seconds] ❌  │
│ Process Batch 3 (50 events)    [2 seconds]     │
│ ...                                              │
│ Total: ~400 seconds billable                    │
└─────────────────────────────────────────────────┘
```

**After** (with Cloud Tasks):
```
┌──────────────────────────────┐
│ Cloud Function - Batch 1     │
│ [2 seconds] ✅                │
│ → Creates Cloud Task         │
│ → Returns immediately        │
└──────────────────────────────┘
         ↓
    [10 seconds delay - NO BILLING] ⏰
         ↓
┌──────────────────────────────┐
│ Cloud Function - Batch 2     │
│ [2 seconds] ✅                │
│ → Creates Cloud Task         │
│ → Returns immediately        │
└──────────────────────────────┘
         ↓
    [10 seconds delay - NO BILLING] ⏰
         ↓
┌──────────────────────────────┐
│ Cloud Function - Batch 3     │
│ [2 seconds] ✅                │
└──────────────────────────────┘

Total: ~80 seconds billable (80% reduction!)
```

### Key Benefits

✅ **Cost Savings**: 80-85% reduction in compute time
✅ **Reliable**: Tasks persisted, guaranteed delivery
✅ **At-least-once** delivery (handlers must be idempotent)
✅ **Automatic retries** with exponential backoff
✅ **Rate limiting** built-in
✅ **Free tier**: 1 million operations/month

### Pricing 💰

- **First 1 million operations/month**: **FREE**
- After that: $0.40 per million operations
- **For this use case**: Essentially **FREE** (unlikely to exceed 1M tasks/month)

---

## Local Development Setup

### Current Setup (3 processes)

```
Terminal 1: cd gcp && pnpm dev          # Express server on :8080
Terminal 2: cd nextjs && pnpm dev       # Next.js on :3000
Terminal 3: cloudflared tunnel ...      # HTTPS tunnel for webhooks
```

### With Cloud Tasks Emulator (4 processes)

#### Option A: Manual Start

```bash
# Terminal 1: Start emulator
docker compose up

# Terminal 2: Start GCP backend
cd gcp && pnpm dev

# Terminal 3: Start Next.js
cd nextjs && pnpm dev

# Terminal 4: Start cloudflared
cloudflared tunnel --url http://localhost:8080
```

#### Option B: Background Emulator (Recommended)

```bash
# One-time setup
$ docker compose up -d                  # Start emulator in background

# Daily development (same as before)
Terminal 1: cd gcp && pnpm dev          # Express server on :8080
Terminal 2: cd nextjs && pnpm dev       # Next.js on :3000
Terminal 3: cloudflared tunnel ...      # HTTPS tunnel for webhooks
```

**Stop emulator**:
```bash
docker compose down
```

### Cloud Tasks Emulator

**What it does**:
- Mimics Google Cloud Tasks API locally
- Handles task scheduling and HTTP delivery
- No GCP connection required for local testing

**Image**: `ghcr.io/aertje/cloud-tasks-emulator:latest`
**Port**: `8123`
**Project**: [aertje/cloud-tasks-emulator](https://github.com/aertje/cloud-tasks-emulator)

**Note**: This is a community-maintained emulator (Google doesn't provide an official one)

---

## Implementation Plan

### File Structure

```
calendar-merge-service/
├── docker-compose.yml                          # Cloud Tasks emulator
├── gcp/
│   ├── src/
│   │   ├── services/
│   │   │   ├── cloud-tasks.service.ts          # NEW - Cloud Tasks wrapper
│   │   │   ├── google-calendar-batch.service.ts # MODIFIED - Use Cloud Tasks
│   │   │   └── batch-sync.service.ts           # MODIFIED - Track batch state
│   │   ├── config/
│   │   │   └── app.config.ts                   # MODIFIED - Add emulator config
│   │   └── types/
│   │       └── sync.types.ts                   # MODIFIED - Add batch progress
│   ├── .env                                    # MODIFIED - Emulator settings
│   └── package.json                            # Already has @google-cloud/tasks
├── nextjs/
├── scripts/
│   └── dev.sh                                  # NEW - Optional helper script
└── wip/gcp/cloud_task/
    ├── PLAN.md                                 # This file
    └── IMPLEMENTATION.md                       # Implementation steps (TODO)
```

### Configuration Changes

#### 1. `docker-compose.yml` (NEW)

```yaml
version: '3.8'

services:
  cloud-tasks-emulator:
    image: ghcr.io/aertje/cloud-tasks-emulator:latest
    container_name: cloud-tasks-emulator
    ports:
      - "8123:8123"
    command: [
      "-host", "0.0.0.0",
      "-port", "8123",
      "-queue", "projects/local-project/locations/us-central1/queues/calendar-sync-queue"
    ]
    networks:
      - calendar-merge-local
    healthcheck:
      test: ["CMD", "nc", "-z", "localhost", "8123"]
      interval: 5s
      timeout: 3s
      retries: 5

networks:
  calendar-merge-local:
    driver: bridge
```

#### 2. `gcp/.env` (ADDITIONS)

```bash
# Cloud Tasks Configuration
CLOUD_TASKS_EMULATOR_HOST=localhost:8123  # Use emulator in dev
CLOUD_TASKS_PROJECT_ID=local-project      # Dummy project for emulator
CLOUD_TASKS_LOCATION=us-central1
CLOUD_TASKS_QUEUE=calendar-sync-queue
```

#### 3. `gcp/src/config/app.config.ts` (ADDITIONS)

```typescript
export const APP_CONFIG = {
  // ... existing config

  // Cloud Tasks
  CLOUD_TASKS_EMULATOR_HOST: process.env.CLOUD_TASKS_EMULATOR_HOST || '',
  CLOUD_TASKS_PROJECT_ID: process.env.CLOUD_TASKS_PROJECT_ID || process.env.GCP_PROJECT || '',
  CLOUD_TASKS_LOCATION: process.env.CLOUD_TASKS_LOCATION || 'us-central1',
  CLOUD_TASKS_QUEUE: process.env.CLOUD_TASKS_QUEUE || 'calendar-sync-queue',
} as const;
```

---

## Data Flow (Local Development)

```
┌─────────────────────────────────────────────────────────────┐
│ LOCAL DEVELOPMENT ENVIRONMENT                                │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. User triggers sync (Next.js :3000)                       │
│     └─> POST http://localhost:8080/sync/trigger              │
│         { userId: "user123" }                                │
│                                                               │
│  2. GCP backend processes first batch                        │
│     ├─> Fetches 50 events from Google Calendar              │
│     ├─> Syncs via Batch API                                  │
│     └─> Saves progress: { batchNumber: 1, hasMore: true }   │
│                                                               │
│  3. Create Cloud Task (instead of sleep)                     │
│     └─> POST http://localhost:8123/v2/projects/.../tasks     │
│         {                                                     │
│           scheduleTime: "10 seconds from now",               │
│           httpRequest: {                                      │
│             url: "http://localhost:8080/batch/continue",     │
│             body: { userId: "user123", batchNumber: 2 }      │
│           }                                                   │
│         }                                                     │
│     └─> Function returns immediately ✅                       │
│                                                               │
│  4. Emulator waits 10 seconds                                │
│     └─> No compute cost, just scheduling ⏰                   │
│                                                               │
│  5. After 10 seconds, emulator executes task                 │
│     └─> POST http://localhost:8080/batch/continue            │
│         { userId: "user123", batchNumber: 2 }                │
│                                                               │
│  6. GCP backend processes batch 2                            │
│     ├─> Fetches next 50 events                               │
│     ├─> Syncs via Batch API                                  │
│     └─> Creates next task or completes                       │
│                                                               │
│  7. Repeat until all batches complete                        │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Production vs Development

### Environment Detection

```typescript
// gcp/src/services/cloud-tasks.service.ts
function getCloudTasksClient(): CloudTasksClient {
  const isLocal = APP_CONFIG.NODE_ENV === 'development';

  if (isLocal && APP_CONFIG.CLOUD_TASKS_EMULATOR_HOST) {
    // Use emulator
    return new CloudTasksClient({
      port: 8123,
      servicePath: 'localhost',
      sslCreds: grpc.credentials.createInsecure(),
    });
  } else {
    // Use production Cloud Tasks
    return new CloudTasksClient();
  }
}
```

### Configuration Matrix

| Environment | Endpoint | Auth | Queue |
|-------------|----------|------|-------|
| **Local Dev** | `localhost:8123` | None (insecure) | `projects/local-project/...` |
| **Production** | `cloudtasks.googleapis.com` | Service Account | `projects/calendar-merge-1759477062/...` |

---

## Implementation Tasks

### Phase 1: Infrastructure Setup
- [x] Create `docker-compose.yml` with Cloud Tasks emulator
- [ ] Update `gcp/.env` with emulator configuration
- [ ] Update `gcp/src/config/app.config.ts` with Cloud Tasks config
- [ ] Test emulator startup and health check

### Phase 2: Service Layer
- [ ] Create `cloud-tasks.service.ts` wrapper
  - [ ] Client initialization (with emulator support)
  - [ ] Create task method
  - [ ] Queue path helper
  - [ ] Error handling
- [ ] Add unit tests for Cloud Tasks service

### Phase 3: Batch Sync Refactor
- [ ] Modify `google-calendar-batch.service.ts`
  - [ ] Remove `sleep()` calls
  - [ ] Add batch state tracking
  - [ ] Create tasks for next batch
- [ ] Add new endpoint: `POST /batch/continue`
  - [ ] Resume batch processing from saved state
  - [ ] Idempotent handler (for retries)
- [ ] Update `sync.types.ts` with batch progress types

### Phase 4: Testing
- [ ] Test with emulator locally
  - [ ] Single batch (< 50 events)
  - [ ] Multiple batches (> 50 events)
  - [ ] Error handling and retries
- [ ] Test in production (staging environment)
- [ ] Performance comparison (with vs without sleep)

### Phase 5: Documentation
- [ ] Update local development guide
- [ ] Add Cloud Tasks emulator to README
- [ ] Document new `/batch/continue` endpoint
- [ ] Add troubleshooting section

---

## Testing Strategy

### Local Testing

```bash
# 1. Start emulator
docker compose up -d

# 2. Verify emulator is running
curl http://localhost:8123/health || echo "Health check not available"

# 3. Start backend
cd gcp && pnpm dev

# 4. Trigger sync with 100+ events
curl -X POST http://localhost:8080/sync/trigger \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user-123"}'

# 5. Watch logs for:
# - Batch 1 processed
# - Cloud Task created
# - Function returns
# - (10 seconds later) Batch 2 starts
# - Cloud Task created
# - Repeat...
```

### Expected Logs

```
[INFO] Processing batch 1/5 (50 events)
[INFO] Batch 1 complete: 50 synced
[INFO] Creating Cloud Task for batch 2 (scheduleTime: +10s)
[INFO] Task created: projects/.../tasks/task-abc123
[INFO] Returning immediately (no sleep)
--- 10 seconds pass ---
[INFO] Received task: batch 2/5
[INFO] Processing batch 2/5 (50 events)
[INFO] Batch 2 complete: 50 synced
[INFO] Creating Cloud Task for batch 3 (scheduleTime: +10s)
...
```

---

## Rollback Plan

If Cloud Tasks implementation causes issues:

1. **Disable Cloud Tasks**: Set `BATCH_API_ENABLED=false` in `.env`
2. **Revert to sleep**: Original code path still exists
3. **No data loss**: Batch state tracked in Firestore
4. **Gradual rollout**: Enable for subset of users first

---

## Open Questions

Before implementation, need to decide:

1. **Script automation**: Create `pnpm dev:all` to start everything?
2. **Health checks**: Add `/health` endpoint to check emulator connectivity?
3. **Error handling**: How many retries before marking sync as failed?
4. **State persistence**: Where to store batch progress (Firestore vs in-memory)?
5. **Monitoring**: How to track Cloud Tasks performance in production?

---

## References

- [Cloud Tasks Documentation](https://cloud.google.com/tasks/docs)
- [Cloud Tasks Emulator](https://github.com/aertje/cloud-tasks-emulator)
- [Creating HTTP Target Tasks](https://cloud.google.com/tasks/docs/creating-http-target-tasks)
- [Node.js Cloud Tasks Client](https://googleapis.dev/nodejs/tasks/latest/)

---

## Next Steps

1. Review this plan
2. Answer open questions
3. Create `IMPLEMENTATION.md` with step-by-step instructions
4. Begin Phase 1: Infrastructure Setup
