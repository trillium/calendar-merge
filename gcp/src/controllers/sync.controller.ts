/**
 * Sync controller
 * Handles sync operations (batch sync, pause, resume, etc.)
 */

import { Request, Response } from 'express';
import {
  batchSyncEvents,
  batchSyncRoundRobin,
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

      // If more calendars exist, trigger next batch via self-triggering HTTP call
      if (result.hasMore) {
        const { APP_CONFIG } = await import('../config');
        const triggerUrl = `${APP_CONFIG.CLOUD_FUNCTION_URL}/sync/trigger`;

        log.info('Triggering next batch', { userId, nextIndex: result.currentIndex });

        // Fire and forget - don't await to avoid blocking this response
        fetch(triggerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        }).catch(err => {
          log.error('Failed to trigger next batch', err, { userId });
        });
      }

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
