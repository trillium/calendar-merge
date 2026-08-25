/**
 * Calendar controller
 * Handles calendar management operations
 */

import { Request, Response } from 'express';
import { listCalendars, listEvents, createWatchChannel, getCalendarClient } from '../services';
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
 * Delete a Google Calendar (cannot delete primary)
 */
export async function deleteCalendar(req: Request, res: Response): Promise<void> {
  const { userId, calendarId } = req.body;

  if (!userId || !calendarId) {
    res.status(400).json({ error: 'userId and calendarId are required' });
    return;
  }

  try {
    const calendarClient = await getCalendarClient(userId);
    await calendarClient.calendars.delete({ calendarId });

    log.info('Calendar deleted', { userId, calendarId });
    res.status(200).json({ success: true, deletedCalendarId: calendarId });
  } catch (error: any) {
    if (error?.code === 403 || error?.message?.includes('primary')) {
      res.status(403).json({ error: 'Cannot delete primary calendar' });
      return;
    }
    log.error('Error deleting calendar', error, { userId, calendarId });
    res.status(500).json({ error: 'Error deleting calendar' });
  }
}

/**
 * List events in a calendar
 */
export async function getEvents(req: Request, res: Response): Promise<void> {
  const { userId, calendarId } = req.query;

  if (!userId || !calendarId) {
    res.status(400).json({ error: 'userId and calendarId are required' });
    return;
  }

  try {
    const result = await listEvents(userId as string, calendarId as string, {
      maxResults: 50,
    });

    res.status(200).json({
      events: result.events.map(e => ({
        id: e.id,
        summary: e.summary,
        start: e.start,
        end: e.end,
        status: e.status,
        source: e.extendedProperties?.private?.sourceCalendarId,
      })),
      totalReturned: result.events.length,
    });
  } catch (error) {
    log.error('Error listing events', error, { userId, calendarId });
    res.status(500).json({ error: 'Error retrieving events' });
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
