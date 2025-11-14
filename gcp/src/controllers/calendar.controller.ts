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
