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
 * GET /calendars/events?userId=XXX&calendarId=YYY
 * List events in a calendar
 */
router.get('/calendars/events', asyncHandler(calendarController.getEvents));

/**
 * POST /calendars/watch
 * Create a watch channel for calendar sync
 * Body: { userId, calendarId, targetCalendarId }
 */
router.post('/calendars/watch', asyncHandler(calendarController.createWatch));

/**
 * DELETE /calendars
 * Delete a Google Calendar
 * Body: { userId, calendarId }
 */
router.delete('/calendars', asyncHandler(calendarController.deleteCalendar));

export default router;
