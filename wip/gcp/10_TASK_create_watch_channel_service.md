# Task 10: Create Watch Channel Service

**Status:** Not Started
**Priority:** High
**Estimated Time:** 3-4 hours
**Dependencies:** Task 07 (Calendar Service), Task 08 (Event Sync Service)

---

## Objective

Port watch channel management logic from `functions/calendar-sync/watch.ts` for setting up Google Calendar push notifications.

## Why This Task?

- Manages webhook subscriptions to Google Calendar
- Handles watch creation, renewal, and deletion
- Critical for real-time event syncing

## Source File

Reference: `functions/calendar-sync/watch.ts` (169 lines)

## Target File

```
gcp/src/services/
└── watch-channel.service.ts  (Watch channel management)
```

## Steps

### 1. Create watch-channel.service.ts

**File:** `gcp/src/services/watch-channel.service.ts`

```typescript
/**
 * Watch channel service
 * Manages Google Calendar push notification channels
 */

import { Timestamp } from '@google-cloud/firestore';
import { db } from '../db';
import { watchCalendar, stopWatch } from './google-calendar.service';
import { WatchData } from '../types';
import { logger, generateChannelId, daysFromNow, isExpiringSoon } from '../utils';
import { APP_CONFIG, GOOGLE_CONFIG } from '../config';

const log = logger;

/**
 * Create a new watch channel for a calendar
 */
export async function createWatchChannel(
  userId: string,
  calendarId: string,
  targetCalendarId: string
): Promise<WatchData> {
  log.info('Creating watch channel', { userId, calendarId });

  const channelId = generateChannelId();
  const webhookUrl = `${APP_CONFIG.CLOUD_FUNCTION_URL}${GOOGLE_CONFIG.WATCH.WEBHOOK_PATH}`;
  const expiration = daysFromNow(7); // 7 days

  try {
    // Create watch with Google Calendar API
    const { resourceId } = await watchCalendar(
      userId,
      calendarId,
      channelId,
      webhookUrl,
      expiration
    );

    // Store watch data in Firestore
    const watchData: WatchData = {
      channelId,
      resourceId,
      userId,
      calendarId,
      targetCalendarId,
      expiration,
      createdAt: Timestamp.now(),
      paused: false,
      syncState: {
        status: 'pending',
      },
      stats: {
        totalEventsSynced: 0,
      },
    };

    await db.setDoc('watches', channelId, watchData);

    log.info('Watch channel created', {
      channelId,
      resourceId,
      calendarId,
      expiration: new Date(expiration).toISOString(),
    });

    return watchData;
  } catch (error) {
    log.error('Failed to create watch channel', error, { userId, calendarId });
    throw error;
  }
}

/**
 * Renew an existing watch channel
 */
export async function renewWatchChannel(channelId: string): Promise<void> {
  log.info('Renewing watch channel', { channelId });

  try {
    const watchData = await db.getDoc<WatchData>('watches', channelId);

    if (!watchData) {
      log.warn('Watch not found for renewal', { channelId });
      return;
    }

    const { userId, calendarId, targetCalendarId, resourceId } = watchData;

    // Stop old watch
    try {
      await stopWatch(userId, channelId, resourceId);
    } catch (error) {
      log.warn('Failed to stop old watch (may already be expired)', error, { channelId });
    }

    // Create new watch
    const newChannelId = generateChannelId();
    const webhookUrl = `${APP_CONFIG.CLOUD_FUNCTION_URL}${GOOGLE_CONFIG.WATCH.WEBHOOK_PATH}`;
    const expiration = daysFromNow(7);

    const { resourceId: newResourceId } = await watchCalendar(
      userId,
      calendarId,
      newChannelId,
      webhookUrl,
      expiration
    );

    // Delete old watch document
    await db.deleteDoc('watches', channelId);

    // Create new watch document with same data but new IDs
    const newWatchData: WatchData = {
      ...watchData,
      channelId: newChannelId,
      resourceId: newResourceId,
      expiration,
      createdAt: Timestamp.now(),
    };

    await db.setDoc('watches', newChannelId, newWatchData);

    log.info('Watch channel renewed', {
      oldChannelId: channelId,
      newChannelId,
      expiration: new Date(expiration).toISOString(),
    });
  } catch (error) {
    log.error('Failed to renew watch channel', error, { channelId });
    throw error;
  }
}

/**
 * Delete a watch channel
 */
export async function deleteWatchChannel(channelId: string): Promise<void> {
  log.info('Deleting watch channel', { channelId });

  try {
    const watchData = await db.getDoc<WatchData>('watches', channelId);

    if (!watchData) {
      log.warn('Watch not found for deletion', { channelId });
      return;
    }

    const { userId, resourceId } = watchData;

    // Stop watch with Google
    try {
      await stopWatch(userId, channelId, resourceId);
    } catch (error) {
      log.warn('Failed to stop watch (may already be expired)', error, { channelId });
    }

    // Delete from Firestore
    await db.deleteDoc('watches', channelId);

    log.info('Watch channel deleted', { channelId });
  } catch (error) {
    log.error('Failed to delete watch channel', error, { channelId });
    throw error;
  }
}

/**
 * Get all watch channels for a user
 */
export async function getUserWatchChannels(userId: string): Promise<WatchData[]> {
  return await db.query<WatchData>('watches', 'userId', '==', userId);
}

/**
 * Get watch channel by ID
 */
export async function getWatchChannel(channelId: string): Promise<WatchData | null> {
  return await db.getDoc<WatchData>('watches', channelId);
}

/**
 * Pause a watch channel (stop syncing but keep watch active)
 */
export async function pauseWatchChannel(channelId: string): Promise<void> {
  await db.updateDoc('watches', channelId, {
    paused: true,
  });
  log.info('Watch channel paused', { channelId });
}

/**
 * Resume a paused watch channel
 */
export async function resumeWatchChannel(channelId: string): Promise<void> {
  await db.updateDoc('watches', channelId, {
    paused: false,
  });
  log.info('Watch channel resumed', { channelId });
}

/**
 * Renew all expiring watch channels
 * Should be called periodically (e.g., daily via Cloud Scheduler)
 */
export async function renewExpiringWatchChannels(): Promise<{ renewed: number; failed: number }> {
  log.info('Checking for expiring watch channels');

  const allWatches = await db.getAll<WatchData>('watches');
  const bufferHours = APP_CONFIG.WATCH_RENEWAL_BUFFER_HOURS;

  let renewed = 0;
  let failed = 0;

  for (const watch of allWatches) {
    if (isExpiringSoon(watch.expiration, bufferHours)) {
      try {
        await renewWatchChannel(watch.channelId);
        renewed++;
      } catch (error) {
        log.error('Failed to renew expiring watch', error, { channelId: watch.channelId });
        failed++;
      }
    }
  }

  log.info(`Watch renewal complete: ${renewed} renewed, ${failed} failed`);

  return { renewed, failed };
}

/**
 * Clean up orphaned watches (watches for deleted users)
 */
export async function cleanupOrphanedWatches(): Promise<{ deleted: number }> {
  log.info('Cleaning up orphaned watches');

  const allWatches = await db.getAll<WatchData>('watches');
  let deleted = 0;

  for (const watch of allWatches) {
    const userExists = await db.docExists('users', watch.userId);

    if (!userExists) {
      log.info('Found orphaned watch', { channelId: watch.channelId, userId: watch.userId });

      try {
        await deleteWatchChannel(watch.channelId);
        deleted++;
      } catch (error) {
        log.error('Failed to delete orphaned watch', error, { channelId: watch.channelId });
      }
    }
  }

  log.info(`Orphaned watch cleanup complete: ${deleted} deleted`);

  return { deleted };
}
```

### 2. Update services/index.ts

Add exports:

```typescript
// Watch channel service
export {
  createWatchChannel,
  renewWatchChannel,
  deleteWatchChannel,
  getUserWatchChannels,
  getWatchChannel,
  pauseWatchChannel,
  resumeWatchChannel,
  renewExpiringWatchChannels,
  cleanupOrphanedWatches,
} from './watch-channel.service';
```

## Key Features

### Watch Lifecycle Management
- `createWatchChannel()` - Set up new push notifications
- `renewWatchChannel()` - Replace expiring watches
- `deleteWatchChannel()` - Clean up watches

### Automatic Renewal
- `renewExpiringWatchChannels()` - Renews watches before they expire
- Called by Cloud Scheduler job (daily)
- Configurable buffer period (default 24h before expiry)

### State Management
- `pauseWatchChannel()` / `resumeWatchChannel()` - Control syncing
- Watches stay active but don't process events when paused

### Cleanup
- `cleanupOrphanedWatches()` - Remove watches for deleted users
- Prevents resource leaks

## Validation Checklist

- [ ] watch-channel.service.ts created
- [ ] All watch management functions ported
- [ ] Renewal logic implemented
- [ ] Cleanup functions included
- [ ] TypeScript compiles: `pnpm build`
- [ ] Exports added to services/index.ts

## Next Task

→ **11_TASK_create_middleware.md** - Create Express middleware (auth, webhook verification, error handling)

## Notes

- Watch channels expire after 7 days (Google's limit)
- Renewal creates a new channel and deletes the old one
- Webhook URL comes from APP_CONFIG.CLOUD_FUNCTION_URL
- All watches are stored in Firestore with channelId as document ID
