# Task 12: Create Controllers

**Status:** Not Started
**Priority:** High
**Estimated Time:** 3-4 hours
**Dependencies:** All services (Tasks 06-10), Middleware (Task 11)

---

## Objective

Create controller layer that handles HTTP requests and calls appropriate service methods.

## Why This Task?

- Controllers handle request/response logic
- Call service layer for business logic
- Keep routes thin and testable
- Separation of concerns (routes → controllers → services)

## Files to Create

```
gcp/src/controllers/
├── webhook.controller.ts    (Webhook handling)
├── sync.controller.ts       (Sync operations)
├── calendar.controller.ts   (Calendar management)
├── auth.controller.ts       (OAuth flow)
└── index.ts                 (Exports)
```

## Steps

### 1. Create webhook.controller.ts

**File:** `gcp/src/controllers/webhook.controller.ts`

```typescript
/**
 * Webhook controller
 * Handles Google Calendar push notifications
 */

import { Request, Response } from 'express';
import { syncCalendarEvents } from '../services';
import { logger } from '../utils';

const log = logger;

/**
 * Handle incoming webhook from Google Calendar
 */
export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const { channelId, resourceState } = (req as any).webhook || {};

  log.info('Webhook received', { channelId, resourceState });

  try {
    // Sync state is handled by middleware
    if (resourceState === 'sync') {
      res.status(200).send('Sync acknowledged');
      return;
    }

    // Process the webhook
    if (resourceState === 'exists') {
      await syncCalendarEvents(channelId);
    }

    res.status(200).send('OK');
  } catch (error) {
    log.error('Error handling webhook', error, { channelId });
    res.status(500).send('Error processing webhook');
  }
}
```

### 2. Create sync.controller.ts

**File:** `gcp/src/controllers/sync.controller.ts`

```typescript
/**
 * Sync controller
 * Handles sync operations (batch sync, pause, resume, etc.)
 */

import { Request, Response } from 'express';
import {
  batchSyncEvents,
  batchSyncRoundRobin,
  getBatchSyncProgress,
  getUserWatchChannels,
  pauseWatchChannel,
  resumeWatchChannel,
  deleteWatchChannel,
  resetBatchSyncState,
} from '../services';
import { logger } from '../utils';
import { db } from '../db';

const log = logger;

/**
 * Trigger batch sync
 */
export async function triggerBatchSync(req: Request, res: Response): Promise<void> {
  const { userId, channelId } = req.body;

  try {
    // Support both new (userId) and old (channelId) API for backward compatibility
    if (userId) {
      log.info('Round-robin batch sync triggered', { userId });
      const result = await batchSyncRoundRobin(userId);
      res.status(200).json({ success: true, ...result });
    } else if (channelId) {
      log.info('Legacy batch sync triggered', { channelId });
      await batchSyncEvents(channelId);
      res.status(200).json({ success: true, channelId });
    } else {
      res.status(400).json({ error: 'userId or channelId is required' });
    }
  } catch (error) {
    log.error('Error in batch sync', error, { userId, channelId });
    res.status(500).json({ error: 'Error processing batch sync' });
  }
}

/**
 * Get sync status
 */
export async function getSyncStatus(req: Request, res: Response): Promise<void> {
  const { userId } = req.query;

  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  try {
    const watches = await getUserWatchChannels(userId as string);

    const status = watches.map(watch => ({
      calendarId: watch.calendarId,
      channelId: watch.channelId,
      paused: watch.paused,
      syncState: watch.syncState,
      stats: watch.stats,
    }));

    res.status(200).json({ watches: status });
  } catch (error) {
    log.error('Error getting sync status', error, { userId });
    res.status(500).json({ error: 'Error retrieving sync status' });
  }
}

/**
 * Pause sync for a calendar
 */
export async function pauseSync(req: Request, res: Response): Promise<void> {
  const { channelId } = req.body;

  if (!channelId) {
    res.status(400).json({ error: 'channelId is required' });
    return;
  }

  try {
    await pauseWatchChannel(channelId);
    res.status(200).json({ success: true, message: 'Sync paused' });
  } catch (error) {
    log.error('Error pausing sync', error, { channelId });
    res.status(500).json({ error: 'Error pausing sync' });
  }
}

/**
 * Resume sync for a calendar
 */
export async function resumeSync(req: Request, res: Response): Promise<void> {
  const { channelId } = req.body;

  if (!channelId) {
    res.status(400).json({ error: 'channelId is required' });
    return;
  }

  try {
    await resumeWatchChannel(channelId);
    res.status(200).json({ success: true, message: 'Sync resumed' });
  } catch (error) {
    log.error('Error resuming sync', error, { channelId });
    res.status(500).json({ error: 'Error resuming sync' });
  }
}

/**
 * Stop sync (delete watch channel)
 */
export async function stopSync(req: Request, res: Response): Promise<void> {
  const { channelId } = req.body;

  if (!channelId) {
    res.status(400).json({ error: 'channelId is required' });
    return;
  }

  try {
    await deleteWatchChannel(channelId);
    res.status(200).json({ success: true, message: 'Sync stopped' });
  } catch (error) {
    log.error('Error stopping sync', error, { channelId });
    res.status(500).json({ error: 'Error stopping sync' });
  }
}

/**
 * Restart sync (reset state and trigger new batch sync)
 */
export async function restartSync(req: Request, res: Response): Promise<void> {
  const { channelId } = req.body;

  if (!channelId) {
    res.status(400).json({ error: 'channelId is required' });
    return;
  }

  try {
    await resetBatchSyncState(channelId);
    await batchSyncEvents(channelId);
    res.status(200).json({ success: true, message: 'Sync restarted' });
  } catch (error) {
    log.error('Error restarting sync', error, { channelId });
    res.status(500).json({ error: 'Error restarting sync' });
  }
}

/**
 * Clear all user data
 */
export async function clearUserData(req: Request, res: Response): Promise<void> {
  const { userId } = req.body;

  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  try {
    // Get all watches for user
    const watches = await getUserWatchChannels(userId);

    // Delete all watches
    for (const watch of watches) {
      await deleteWatchChannel(watch.channelId);
    }

    // Delete user data
    await db.deleteDoc('users', userId);

    log.info('User data cleared', { userId, watchesDeleted: watches.length });
    res.status(200).json({
      success: true,
      message: 'User data cleared',
      watchesDeleted: watches.length,
    });
  } catch (error) {
    log.error('Error clearing user data', error, { userId });
    res.status(500).json({ error: 'Error clearing user data' });
  }
}
```

### 3. Create calendar.controller.ts

**File:** `gcp/src/controllers/calendar.controller.ts`

```typescript
/**
 * Calendar controller
 * Handles calendar management operations
 */

import { Request, Response } from 'express';
import { listCalendars, createWatchChannel } from '../services';
import { logger } from '../utils';

const log = logger;

/**
 * List all calendars for a user
 */
export async function getCalendars(req: Request, res: Response): Promise<void> {
  const { userId } = req.query;

  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  try {
    const calendars = await listCalendars(userId as string);

    res.status(200).json({
      calendars: calendars.map(cal => ({
        id: cal.id,
        summary: cal.summary,
        description: cal.description,
        primary: cal.primary,
      })),
    });
  } catch (error) {
    log.error('Error listing calendars', error, { userId });
    res.status(500).json({ error: 'Error retrieving calendars' });
  }
}

/**
 * Create a watch for a calendar
 */
export async function createWatch(req: Request, res: Response): Promise<void> {
  const { userId, calendarId, targetCalendarId } = req.body;

  if (!userId || !calendarId || !targetCalendarId) {
    res.status(400).json({
      error: 'userId, calendarId, and targetCalendarId are required',
    });
    return;
  }

  try {
    const watchData = await createWatchChannel(userId, calendarId, targetCalendarId);

    res.status(201).json({
      success: true,
      channelId: watchData.channelId,
      expiration: new Date(watchData.expiration).toISOString(),
    });
  } catch (error) {
    log.error('Error creating watch', error, { userId, calendarId });
    res.status(500).json({ error: 'Error creating watch' });
  }
}
```

### 4. Create auth.controller.ts

**File:** `gcp/src/controllers/auth.controller.ts`

```typescript
/**
 * Auth controller
 * Handles OAuth authentication flow
 */

import { Request, Response } from 'express';
import { generateAuthUrl, handleOAuthCallback, revokeAccess } from '../services';
import { logger } from '../utils';
import { APP_CONFIG } from '../config';

const log = logger;

/**
 * Initiate OAuth flow
 */
export async function initiateAuth(req: Request, res: Response): Promise<void> {
  const { userId } = req.query;

  try {
    const { url, state } = await generateAuthUrl(userId as string | undefined);

    res.status(200).json({
      authUrl: url,
      state,
    });
  } catch (error) {
    log.error('Error generating auth URL', error);
    res.status(500).json({ error: 'Error initiating authentication' });
  }
}

/**
 * Handle OAuth callback
 */
export async function handleCallback(req: Request, res: Response): Promise<void> {
  const { code, state } = req.query;

  if (!code || !state) {
    res.status(400).json({ error: 'code and state are required' });
    return;
  }

  try {
    const { userId, userData } = await handleOAuthCallback(
      code as string,
      state as string
    );

    // Redirect to frontend with success
    const redirectUrl = `${APP_CONFIG.FRONTEND_URL}/auth/success?userId=${userId}`;
    res.redirect(redirectUrl);
  } catch (error) {
    log.error('Error handling OAuth callback', error);

    // Redirect to frontend with error
    const redirectUrl = `${APP_CONFIG.FRONTEND_URL}/auth/error?message=${encodeURIComponent(
      error instanceof Error ? error.message : 'Authentication failed'
    )}`;
    res.redirect(redirectUrl);
  }
}

/**
 * Revoke OAuth access
 */
export async function revokeAuth(req: Request, res: Response): Promise<void> {
  const { userId } = req.body;

  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  try {
    await revokeAccess(userId);
    res.status(200).json({ success: true, message: 'Access revoked' });
  } catch (error) {
    log.error('Error revoking access', error, { userId });
    res.status(500).json({ error: 'Error revoking access' });
  }
}
```

### 5. Create controllers/index.ts

**File:** `gcp/src/controllers/index.ts`

```typescript
/**
 * Controllers exports
 */

export { handleWebhook } from './webhook.controller';

export {
  triggerBatchSync,
  getSyncStatus,
  pauseSync,
  resumeSync,
  stopSync,
  restartSync,
  clearUserData,
} from './sync.controller';

export {
  getCalendars,
  createWatch,
} from './calendar.controller';

export {
  initiateAuth,
  handleCallback,
  revokeAuth,
} from './auth.controller';
```

## Validation Checklist

- [ ] All 4 controller files created
- [ ] Controllers use service layer (no direct API calls)
- [ ] Proper error handling in all controllers
- [ ] Request validation included
- [ ] TypeScript compiles: `pnpm build`
- [ ] Exports in controllers/index.ts

## Next Task

→ **13_TASK_create_routes.md** - Wire up controllers to Express routes

## Notes

- Controllers are the bridge between HTTP and business logic
- All business logic is in services (controllers just orchestrate)
- Error handling delegates to error middleware
- Controllers validate inputs before calling services
