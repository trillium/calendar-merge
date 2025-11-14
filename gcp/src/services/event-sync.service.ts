/**
 * Event synchronization service
 * Handles syncing events from source calendars to target calendar
 */

import { calendar_v3 } from 'googleapis';
import { Timestamp } from '@google-cloud/firestore';
import { db } from '../db';
import { listEvents, getEvent, createEvent, updateEvent, deleteEvent } from './google-calendar.service';
import { EventMapping, WatchData, SyncEventResult } from '../types';
import { logger, sleep, generateCompositeKey } from '../utils';
import { APP_CONFIG } from '../config';

const log = logger;

/**
 * Sync calendar events when a webhook notification is received
 */
export async function syncCalendarEvents(channelId: string): Promise<void> {
  log.info(`Syncing events for channel ${channelId}`);

  try {
    // Get watch data from Firestore
    const watchData = await db.getDoc<WatchData>('watches', channelId);

    if (!watchData) {
      log.warn(`Watch ${channelId} not found`);
      return;
    }

    const { userId, calendarId, targetCalendarId, paused, syncToken, syncState } = watchData;

    if (paused) {
      log.info(`Sync paused for channel ${channelId}`);
      return;
    }

    // Skip webhook if initial batch sync is in progress
    if (syncState?.status === 'pending' || syncState?.status === 'syncing') {
      log.info(
        `Batch sync in progress for channel ${channelId} (status: ${syncState.status}), skipping webhook notification`
      );
      return;
    }

    if (!targetCalendarId || !userId) {
      log.warn(`Missing configuration for ${calendarId}`);
      return;
    }

    let events: calendar_v3.Schema$Event[] = [];
    let newSyncToken: string | undefined = undefined;

    try {
      if (syncToken) {
        // Incremental sync using syncToken
        log.info(`Using syncToken for incremental sync`);
        const response = await listEvents(userId, calendarId, {
          syncToken,
        });

        events = response.events;
        newSyncToken = response.nextSyncToken;
        log.info(`Incremental sync: Found ${events.length} changed events`);
      } else {
        // Initial full sync - compatible with syncToken
        log.info(`No syncToken found, performing initial sync`);
        const response = await listEvents(userId, calendarId, {
          maxResults: 2500,
          singleEvents: true,
        });

        events = response.events;
        newSyncToken = response.nextSyncToken;
        log.info(`Full sync: Found ${events.length} events`);
      }
    } catch (error: any) {
      // Handle expired syncToken
      if (error.message === 'SYNC_TOKEN_EXPIRED') {
        log.info(`SyncToken expired, performing full resync`);
        const response = await listEvents(userId, calendarId, {
          maxResults: 2500,
          singleEvents: true,
        });

        events = response.events;
        newSyncToken = response.nextSyncToken;
        log.info(`Full resync: Found ${events.length} events`);
      } else {
        throw error;
      }
    }

    // If there are too many events for webhook (>50), just save the syncToken
    if (events.length > APP_CONFIG.WEBHOOK_EVENT_LIMIT) {
      log.info(
        `Found ${events.length} events - too many for webhook. Saving syncToken for incremental syncs.`
      );
      if (newSyncToken) {
        await db.updateDoc('watches', channelId, {
          syncToken: newSyncToken,
          syncTokenUpdatedAt: Date.now(),
        });
        log.info(`SyncToken saved. Future changes will be synced incrementally.`);
      }
      return;
    }

    // Process each event with rate limiting
    let syncedCount = 0;
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (!event.id) continue;

      const result = await syncEvent(userId, calendarId, event.id, targetCalendarId);
      if (result.success) syncedCount++;

      // Rate limiting: delay between events
      if (i < events.length - 1) {
        await sleep(APP_CONFIG.RATE_LIMIT_DELAY_MS);
      }
    }

    log.info(`Processed ${events.length} events with rate limiting`);

    // Update watch statistics
    const updates: any = {};
    if (newSyncToken) {
      updates.syncToken = newSyncToken;
      updates.syncTokenUpdatedAt = Date.now();
    }

    // Update stats
    const currentStats = watchData.stats || { totalEventsSynced: 0 };
    updates.stats = {
      totalEventsSynced: currentStats.totalEventsSynced + syncedCount,
      lastSyncTime: Date.now(),
      lastSyncEventCount: syncedCount,
    };

    await db.updateDoc('watches', channelId, updates);
    log.info(`Sync complete for channel ${channelId}: ${syncedCount} events processed`);
  } catch (error) {
    log.error(`Error syncing events for channel ${channelId}`, error);
    throw error;
  }
}

/**
 * Transform event data for target calendar
 * Includes special handling for specific event types (e.g., Airbnb)
 */
function transformEventData(
  sourceEvent: calendar_v3.Schema$Event,
  sourceCalendarId: string
): calendar_v3.Schema$Event {
  const calendarName = sourceCalendarId.split('@')[0];
  const transparency = sourceEvent.transparency || 'opaque';
  const busyStatus = transparency === 'transparent' ? 'free' : 'busy';

  // Check if this is an Airbnb event and modify description
  let description = sourceEvent.description || '';
  const isAirbnbEvent =
    sourceEvent.summary?.toLowerCase().includes('airbnb') ||
    sourceEvent.organizer?.email?.toLowerCase().includes('airbnb') ||
    sourceEvent.creator?.email?.toLowerCase().includes('airbnb') ||
    sourceEvent.attendees?.some(attendee =>
      attendee.email?.toLowerCase().includes('airbnb')
    );

  if (isAirbnbEvent) {
    description = description ? `__EVENT__\n\n${description}` : '__EVENT__';
  }

  return {
    summary: `[${calendarName}] ${sourceEvent.summary || '(No title)'} - ${busyStatus}`,
    description,
    start: sourceEvent.start,
    end: sourceEvent.end,
    location: sourceEvent.location,
    status: sourceEvent.status,
    transparency,
    visibility: 'private',
  };
}

/**
 * Sync a single event from source to target calendar
 */
export async function syncEvent(
  userId: string,
  sourceCalendarId: string,
  sourceEventId: string,
  targetCalendarId: string
): Promise<SyncEventResult> {
  try {
    // Use composite key as document ID to avoid Firestore index
    const mappingId = generateCompositeKey(sourceCalendarId, sourceEventId);

    const mappingDoc = await db.getDoc<EventMapping>('eventMappings', mappingId);

    // Fetch the source event
    const sourceEvent = await getEvent(userId, sourceCalendarId, sourceEventId);

    if (!sourceEvent) {
      log.warn(`Source event ${sourceEventId} not found`);
      return { success: false };
    }

    // Check if event is cancelled
    if (sourceEvent.status === 'cancelled') {
      // Delete from target if it exists
      if (mappingDoc) {
        await deleteEvent(userId, targetCalendarId, mappingDoc.targetEventId);
        await db.deleteDoc('eventMappings', mappingId);
      }
      return { success: false };
    }

    // Transform event data
    const eventData = transformEventData(sourceEvent, sourceCalendarId);

    let targetEventId: string;

    if (!mappingDoc) {
      // Create new event in target calendar
      const targetEvent = await createEvent(userId, targetCalendarId, eventData);
      targetEventId = targetEvent.id!;

      // Create mapping
      const mapping: EventMapping = {
        sourceCalendarId,
        sourceEventId,
        targetEventId,
        lastSynced: Timestamp.now(),
      };

      await db.setDoc('eventMappings', mappingId, mapping);
      log.info(`Created new event ${targetEventId} in target calendar`);
    } else {
      // Update existing event
      targetEventId = mappingDoc.targetEventId;

      await updateEvent(userId, targetCalendarId, targetEventId, eventData);

      // Update mapping timestamp
      await db.updateDoc('eventMappings', mappingId, {
        lastSynced: Timestamp.now(),
      });

      log.info(`Updated event ${targetEventId} in target calendar`);
    }

    return { success: true };
  } catch (error: any) {
    // Check for quota error
    if (error.code === 403 && error.message?.includes('Quota exceeded')) {
      log.info(`Quota error for event ${sourceEventId}, will retry`);
      return { success: false, eventId: sourceEventId };
    }

    // Check for rate limit error
    if (error.code === 429 || error.message?.includes('Rate Limit Exceeded')) {
      log.info(`Rate limit error for event ${sourceEventId}, will retry`);
      return { success: false, eventId: sourceEventId };
    }

    // Other errors - log and continue
    log.error(`Error syncing event ${sourceEventId}`, error);
    return { success: false };
  }
}
