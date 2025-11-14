/**
 * Calendar management routes
 */

import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import { asyncHandler } from '../middleware';
import * as calendarController from '../controllers/calendar.controller';

const router: ExpressRouter = Router();

/**
 * GET /calendars/list?userId=XXX
 * Get all calendars for a user
 */
router.get('/calendars/list', asyncHandler(calendarController.getCalendars));

/**
 * POST /calendars/watch
 * Create a watch channel for calendar sync
 * Body: { userId, calendarId, targetCalendarId }
 */
router.post('/calendars/watch', asyncHandler(calendarController.createWatch));

export default router;
