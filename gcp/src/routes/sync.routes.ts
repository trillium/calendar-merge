/**
 * Manual sync trigger routes
 */

import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import { asyncHandler } from '../middleware';
import * as syncController from '../controllers/sync.controller';

const router: ExpressRouter = Router();

/**
 * POST /sync/trigger
 * Trigger manual batch sync for a user
 * Body: { userId } or { channelId }
 */
router.post('/sync/trigger', asyncHandler(syncController.triggerBatchSync));

/**
 * GET /sync/status?userId=XXX
 * Get sync status for a user
 */
router.get('/sync/status', asyncHandler(syncController.getSyncStatus));

/**
 * POST /sync/pause
 * Pause syncing for a calendar
 * Body: { channelId }
 */
router.post('/sync/pause', asyncHandler(syncController.pauseSync));

/**
 * POST /sync/resume
 * Resume syncing for a calendar
 * Body: { channelId }
 */
router.post('/sync/resume', asyncHandler(syncController.resumeSync));

/**
 * POST /sync/stop
 * Stop syncing and cleanup watch
 * Body: { channelId }
 */
router.post('/sync/stop', asyncHandler(syncController.stopSync));

/**
 * POST /sync/restart
 * Restart syncing for a calendar
 * Body: { channelId }
 */
router.post('/sync/restart', asyncHandler(syncController.restartSync));

/**
 * DELETE /sync/data
 * Clear all sync data for a user
 * Body: { userId }
 */
router.delete('/sync/data', asyncHandler(syncController.clearUserData));

export default router;
