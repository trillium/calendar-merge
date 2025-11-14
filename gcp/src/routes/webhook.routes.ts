/**
 * Webhook routes
 */

import { Router } from 'express';
import type { Router as ExpressRouter, Request, Response } from 'express';
import { syncCalendarEvents } from '../services';
import { verifyWebhook, handleSyncState, asyncHandler } from '../middleware';

const router: ExpressRouter = Router();

/**
 * POST /webhook
 * Receive Google Calendar push notifications
 */
router.post(
  '/webhook',
  verifyWebhook,
  handleSyncState,
  asyncHandler(async (req: Request, res: Response) => {
    const { channelId } = (req as any).webhook;
    await syncCalendarEvents(channelId);
    res.status(200).send('OK');
  })
);

export default router;
