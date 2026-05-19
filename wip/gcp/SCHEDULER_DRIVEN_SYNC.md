# Scheduler-Driven Incremental Sync

## Problem

Current webhook-triggered sync has critical flaw:
- If >= 50 events changed, we skip sync and expect manual batch trigger
- Manual trigger may never happen -> **events never sync**
- Manual trigger may hit quota limits -> **partial sync, events missed**

## Solution: Webhook = Flag, Scheduler = Processor

### Architecture Change

**Before:**
```
Webhook -> Process events immediately (if < 50)
Webhook -> Skip + manual trigger needed (if >= 50) ❌
```

**After:**
```
Webhook -> Set flag: "this calendar has changes"
Scheduler (every 15 min) -> Process ALL flagged calendars ✅
```

---

## Implementation

### 1. Update WatchData Type

```typescript
// gcp/src/types/watch.types.ts

export interface WatchData {
  channelId: string;
  resourceId: string;
  userId: string;
  calendarId: string;
  targetCalendarId: string;
  expiration: number;
  createdAt: Timestamp;
  paused: boolean;

  // NEW: Track pending changes
  pendingChanges: boolean;           // Flag for scheduler
  lastChangeNotification: number;    // When webhook last notified
  lastSyncedAt?: number;             // When scheduler last processed

  syncToken?: string;
  syncState?: SyncState;
  stats?: WatchStats;
}
```

### 2. Update Webhook Controller

```typescript
// gcp/src/controllers/webhook.controller.ts

export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const channelId = req.headers['x-goog-channel-id'] as string;
  const resourceState = req.headers['x-goog-resource-state'] as string;

  // Validate
  if (!channelId) {
    res.status(400).json({ error: 'Missing channel ID' });
    return;
  }

  // Ignore sync messages
  if (resourceState === 'sync') {
    res.status(200).json({ message: 'Sync acknowledged' });
    return;
  }

  try {
    const watchData = await db.getDoc<WatchData>('watches', channelId);

    if (!watchData) {
      log.warn('Webhook for unknown channel', { channelId });
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    // Simply mark as having pending changes
    await db.updateDoc('watches', channelId, {
      pendingChanges: true,
      lastChangeNotification: Date.now(),
    });

    log.info('Webhook: Marked calendar for sync', {
      channelId,
      calendarId: watchData.calendarId
    });

    // Return immediately - scheduler will process
    res.status(200).json({
      message: 'Change notification received, will process in next sync cycle'
    });

  } catch (error) {
    log.error('Webhook error', error, { channelId });
    res.status(500).json({ error: 'Failed to process webhook' });
  }
}
```

### 3. Create Incremental Sync Service

```typescript
// gcp/src/services/incremental-sync.service.ts

import { db } from '../db';
import { WatchData } from '../types';
import { logger } from '../utils';
import { syncEventsBatchPaginated } from './batch-sync.service';

const log = logger;

/**
 * Process all calendars with pending changes
 * Called by Cloud Scheduler every 15 minutes
 */
export async function processIncrementalChanges(): Promise<{
  processed: number;
  failed: number;
  errors: Array<{ calendarId: string; error: string }>;
}> {
  log.info('Starting incremental sync cycle');

  // Get all watches with pending changes
  const allWatches = await db.getAll<WatchData>('watches');
  const pendingWatches = allWatches.filter(w =>
    w.pendingChanges &&
    !w.paused &&
    w.syncState?.status !== 'syncing'
  );

  if (pendingWatches.length === 0) {
    log.info('No pending changes to process');
    return { processed: 0, failed: 0, errors: [] };
  }

  log.info(`Processing ${pendingWatches.length} calendars with pending changes`);

  let processed = 0;
  let failed = 0;
  const errors: Array<{ calendarId: string; error: string }> = [];

  for (const watch of pendingWatches) {
    try {
      log.info('Processing incremental sync', {
        calendarId: watch.calendarId,
        channelId: watch.channelId
      });

      // Mark as syncing
      await db.updateDoc('watches', watch.channelId, {
        'syncState.status': 'syncing',
        'syncState.startedAt': Date.now(),
      });

      // Process all changes using syncToken
      // This automatically handles pagination
      const result = await syncEventsBatchPaginated(
        watch.userId,
        watch.calendarId,
        watch.targetCalendarId,
        undefined, // No pageToken (start fresh)
        watch.syncToken // Use syncToken to get only changes
      );

      // Update watch: clear pending flag, save new syncToken
      await db.updateDoc('watches', watch.channelId, {
        pendingChanges: false,
        lastSyncedAt: Date.now(),
        syncToken: result.finalSyncToken || watch.syncToken,
        'syncState.status': 'completed',
        'syncState.completedAt': Date.now(),
        'syncState.processedEvents': result.processedCount,
      });

      log.info('Incremental sync completed', {
        calendarId: watch.calendarId,
        eventsProcessed: result.processedCount,
      });

      processed++;

    } catch (error: any) {
      log.error('Incremental sync failed', error, {
        calendarId: watch.calendarId
      });

      // Mark as failed but keep pendingChanges=true to retry next cycle
      await db.updateDoc('watches', watch.channelId, {
        'syncState.status': 'pending',
        'syncState.error': error.message,
      });

      failed++;
      errors.push({
        calendarId: watch.calendarId,
        error: error.message,
      });
    }
  }

  log.info('Incremental sync cycle complete', { processed, failed });

  return { processed, failed, errors };
}
```

### 4. Create Scheduler Controller

```typescript
// gcp/src/controllers/scheduler.controller.ts

import { Request, Response } from 'express';
import { processIncrementalChanges } from '../services/incremental-sync.service';
import { renewExpiringWatchChannels } from '../services/watch-channel.service';
import { logger } from '../utils';

const log = logger;

/**
 * Cloud Scheduler endpoint for incremental sync
 * Called every 15 minutes
 */
export async function runIncrementalSync(req: Request, res: Response): Promise<void> {
  log.info('Scheduler: Starting incremental sync');

  try {
    const result = await processIncrementalChanges();

    res.status(200).json({
      success: true,
      message: 'Incremental sync completed',
      ...result,
    });
  } catch (error) {
    log.error('Scheduler: Incremental sync failed', error);
    res.status(500).json({ error: 'Incremental sync failed' });
  }
}

/**
 * Cloud Scheduler endpoint for watch renewal
 * Called daily at 2am
 */
export async function runWatchRenewal(req: Request, res: Response): Promise<void> {
  log.info('Scheduler: Starting watch renewal');

  try {
    const result = await renewExpiringWatchChannels();

    res.status(200).json({
      success: true,
      message: 'Watch renewal completed',
      ...result,
    });
  } catch (error) {
    log.error('Scheduler: Watch renewal failed', error);
    res.status(500).json({ error: 'Watch renewal failed' });
  }
}
```

### 5. Add Scheduler Routes

```typescript
// gcp/src/routes/scheduler.routes.ts

import { Router } from 'express';
import { runIncrementalSync, runWatchRenewal } from '../controllers/scheduler.controller';

const router = Router();

// POST /scheduler/incremental (every 15 min)
router.post('/incremental', runIncrementalSync);

// POST /scheduler/renew-watches (daily 2am)
router.post('/renew-watches', runWatchRenewal);

export default router;
```

### 6. Mount Scheduler Routes

```typescript
// gcp/src/routes/index.ts

import schedulerRoutes from './scheduler.routes';

router.use('/scheduler', schedulerRoutes);
```

---

## Cloud Scheduler Configuration

```bash
# Create incremental sync job (every 15 minutes)
gcloud scheduler jobs create http incremental-sync \
  --schedule="*/15 * * * *" \
  --uri="${GCP_FUNCTION_URL}/scheduler/incremental" \
  --http-method=POST \
  --oidc-service-account-email="${SERVICE_ACCOUNT_EMAIL}" \
  --location="${REGION}"

# Create watch renewal job (daily 2am)
gcloud scheduler jobs create http renew-watches \
  --schedule="0 2 * * *" \
  --uri="${GCP_FUNCTION_URL}/scheduler/renew-watches" \
  --http-method=POST \
  --oidc-service-account-email="${SERVICE_ACCOUNT_EMAIL}" \
  --location="${REGION}"
```

---

## Benefits

1. **No missed events** - Scheduler always processes pending changes
2. **No manual intervention** - Fully automated
3. **Controlled quota usage** - 15-min intervals prevent bursts
4. **Fast webhooks** - Just DB write, returns in <100ms
5. **Automatic pagination** - syncEventsBatchPaginated handles any volume
6. **Retry on failure** - Failed syncs retry in next cycle
7. **Predictable cost** - Scheduler runs at known frequency

---

## Webhook Becomes Simple

**Old (complex, risky):**
- Fetch events immediately
- Process if < 50
- Skip if >= 50, require manual trigger

**New (simple, reliable):**
- Set flag: pendingChanges = true
- Return 200
- Done!

---

## Trade-offs

**Latency:**
- Old: Events sync immediately (if < 50)
- New: Events sync within 15 minutes

**For most calendar use cases, 15-minute latency is acceptable.**

If real-time is needed, reduce scheduler frequency to 5 minutes.

---

## Migration

1. Add `pendingChanges` field to existing watches:
   ```typescript
   const watches = await db.getAll<WatchData>('watches');
   for (const watch of watches) {
     await db.updateDoc('watches', watch.channelId, {
       pendingChanges: false,
       lastChangeNotification: 0,
     });
   }
   ```

2. Deploy new webhook controller (backward compatible)
3. Create Cloud Scheduler jobs
4. Monitor for one week
5. Remove old webhook sync logic if all working
