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
