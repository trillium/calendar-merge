/**
 * Google Calendar API service
 * Handles all interactions with Google Calendar API
 */

import { google, calendar_v3 } from 'googleapis';
import { getAuthClient } from './google-auth.service';
import { CalendarEvent } from '../types';
import { logger, sleep } from '../utils';
import { APP_CONFIG } from '../config';

const log = logger;

/**
 * Get Google Calendar API client for a user
 */
export async function getCalendarClient(
  userId: string
): Promise<calendar_v3.Calendar> {
  const auth = await getAuthClient(userId);
  return google.calendar({ version: 'v3', auth });
}

/**
 * List all calendars for a user
 */
export async function listCalendars(userId: string): Promise<calendar_v3.Schema$CalendarListEntry[]> {
  const calendar = await getCalendarClient(userId);

  try {
    const response = await calendar.calendarList.list();
    return response.data.items || [];
  } catch (error) {
    log.error('Failed to list calendars', error, { userId });
    throw error;
  }
}

/**
 * Get a specific calendar
 */
export async function getCalendar(
  userId: string,
  calendarId: string
): Promise<calendar_v3.Schema$Calendar | null> {
  const calendar = await getCalendarClient(userId);

  try {
    const response = await calendar.calendars.get({ calendarId });
    return response.data;
  } catch (error: any) {
    if (error.code === 404) {
      return null;
    }
    log.error('Failed to get calendar', error, { userId, calendarId });
    throw error;
  }
}

/**
 * List events from a calendar
 */
export async function listEvents(
  userId: string,
  calendarId: string,
  options?: {
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
    singleEvents?: boolean;
    orderBy?: string;
    syncToken?: string;
  }
): Promise<{ events: CalendarEvent[]; nextSyncToken?: string }> {
  const calendar = await getCalendarClient(userId);

  try {
    const response = await calendar.events.list({
      calendarId,
      ...options,
    });

    return {
      events: response.data.items || [],
      nextSyncToken: response.data.nextSyncToken || undefined,
    };
  } catch (error: any) {
    // Handle expired syncToken (410 Gone)
    if (error.code === 410) {
      log.warn('SyncToken expired', { userId, calendarId });
      throw new Error('SYNC_TOKEN_EXPIRED');
    }
    log.error('Failed to list events', error, { userId, calendarId });
    throw error;
  }
}

/**
 * Get a specific event
 */
export async function getEvent(
  userId: string,
  calendarId: string,
  eventId: string
): Promise<CalendarEvent | null> {
  const calendar = await getCalendarClient(userId);

  try {
    const response = await calendar.events.get({ calendarId, eventId });
    return response.data;
  } catch (error: any) {
    if (error.code === 404) {
      return null;
    }
    log.error('Failed to get event', error, { userId, calendarId, eventId });
    throw error;
  }
}

/**
 * Create an event in a calendar
 */
export async function createEvent(
  userId: string,
  calendarId: string,
  event: calendar_v3.Schema$Event
): Promise<CalendarEvent> {
  const calendar = await getCalendarClient(userId);

  try {
    const response = await calendar.events.insert({
      calendarId,
      requestBody: event,
    });
    log.info('Event created', { userId, calendarId, eventId: response.data.id });
    return response.data;
  } catch (error) {
    log.error('Failed to create event', error, { userId, calendarId });
    throw error;
  }
}

/**
 * Update an event in a calendar
 */
export async function updateEvent(
  userId: string,
  calendarId: string,
  eventId: string,
  event: calendar_v3.Schema$Event
): Promise<CalendarEvent> {
  const calendar = await getCalendarClient(userId);

  try {
    const response = await calendar.events.update({
      calendarId,
      eventId,
      requestBody: event,
    });
    log.info('Event updated', { userId, calendarId, eventId });
    return response.data;
  } catch (error) {
    log.error('Failed to update event', error, { userId, calendarId, eventId });
    throw error;
  }
}

/**
 * Delete an event from a calendar
 */
export async function deleteEvent(
  userId: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const calendar = await getCalendarClient(userId);

  try {
    await calendar.events.delete({ calendarId, eventId });
    log.info('Event deleted', { userId, calendarId, eventId });
  } catch (error: any) {
    if (error.code === 404) {
      log.warn('Event not found for deletion', { userId, calendarId, eventId });
      return;
    }
    log.error('Failed to delete event', error, { userId, calendarId, eventId });
    throw error;
  }
}

/**
 * Watch a calendar for changes (set up push notifications)
 */
export async function watchCalendar(
  userId: string,
  calendarId: string,
  channelId: string,
  webhookUrl: string,
  expiration: number
): Promise<{ resourceId: string; expiration: string }> {
  const calendar = await getCalendarClient(userId);

  try {
    const response = await calendar.events.watch({
      calendarId,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: webhookUrl,
        expiration: expiration.toString(),
      },
    });

    log.info('Calendar watch created', {
      userId,
      calendarId,
      channelId,
      resourceId: response.data.resourceId,
    });

    return {
      resourceId: response.data.resourceId!,
      expiration: response.data.expiration!,
    };
  } catch (error) {
    log.error('Failed to create watch', error, { userId, calendarId, channelId });
    throw error;
  }
}

/**
 * Stop watching a calendar
 */
export async function stopWatch(
  userId: string,
  channelId: string,
  resourceId: string
): Promise<void> {
  const calendar = await getCalendarClient(userId);

  try {
    await calendar.channels.stop({
      requestBody: {
        id: channelId,
        resourceId,
      },
    });
    log.info('Calendar watch stopped', { userId, channelId, resourceId });
  } catch (error: any) {
    // 404 means watch already expired or doesn't exist
    if (error.code === 404) {
      log.warn('Watch not found for stopping', { userId, channelId, resourceId });
      return;
    }
    log.error('Failed to stop watch', error, { userId, channelId, resourceId });
    throw error;
  }
}

/**
 * Rate-limited operation wrapper
 */
export async function withRateLimit<T>(
  operation: () => Promise<T>
): Promise<T> {
  const result = await operation();
  await sleep(APP_CONFIG.RATE_LIMIT_DELAY_MS);
  return result;
}
