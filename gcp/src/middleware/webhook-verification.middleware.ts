/**
 * Webhook verification middleware
 * Validates webhook requests from Google Calendar
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils';

const log = logger;

/**
 * Verify Google Calendar webhook headers
 */
export async function verifyWebhook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const channelId = req.headers['x-goog-channel-id'] as string;
  const resourceState = req.headers['x-goog-resource-state'] as string;
  const resourceId = req.headers['x-goog-resource-id'] as string;

  if (!channelId) {
    log.warn('Webhook missing x-goog-channel-id header');
    res.status(400).json({
      error: 'Bad Request',
      message: 'Missing required webhook headers',
    });
    return;
  }

  // Attach webhook data to request
  (req as any).webhook = {
    channelId,
    resourceState,
    resourceId,
  };

  log.debug('Webhook verified', { channelId, resourceState, resourceId });

  next();
}

/**
 * Handle sync state (Google's initial verification request)
 */
export async function handleSyncState(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const resourceState = req.headers['x-goog-resource-state'] as string;

  if (resourceState === 'sync') {
    log.info('Received sync verification from Google');
    res.status(200).send('Sync acknowledged');
    return;
  }

  next();
}
