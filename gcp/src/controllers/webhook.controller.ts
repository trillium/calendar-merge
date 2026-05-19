/**
 * Webhook controller
 * Handles Google Calendar push notifications
 * Sets flag for scheduler to process changes
 */

import { Request, Response } from 'express';
import { db } from '../db';
import { WatchData } from '../types';
import { logger } from '../utils';

const log = logger;

/**
 * Handle incoming webhook from Google Calendar
 * Simply marks the calendar as having pending changes
 * Scheduler will process changes every 15 minutes
 */
export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const { channelId, resourceState } = (req as any).webhook || {};

  log.info('Webhook received', { channelId, resourceState });

  try {
    // Acknowledge sync messages immediately
    if (resourceState === 'sync') {
      res.status(200).send('Sync acknowledged');
      return;
    }

    // For 'exists' events (actual changes), mark calendar for processing
    if (resourceState === 'exists') {
      const watchData = await db.getDoc<WatchData>('watches', channelId);

      if (!watchData) {
        log.warn('Webhook for unknown channel', { channelId });
        res.status(404).send('Channel not found');
        return;
      }

      // Simply set pending flag - scheduler will handle the sync
      await db.updateDoc('watches', channelId, {
        pendingChanges: true,
        lastChangeNotification: Date.now(),
      });

      log.info('Webhook: Marked calendar for sync', {
        channelId,
        calendarId: watchData.calendarId,
      });
    }

    res.status(200).send('OK');
  } catch (error) {
    log.error('Error handling webhook', error, { channelId });
    res.status(500).send('Error processing webhook');
  }
}
