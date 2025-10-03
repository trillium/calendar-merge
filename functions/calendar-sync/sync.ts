import { google, calendar_v3 } from 'googleapis';
import { Firestore, Timestamp } from '@google-cloud/firestore';
import { getAuthClient } from './auth';
import { EventMapping, WatchData } from './types';
import { CONFIG } from './config';

const firestore = new Firestore();

/**
 * Syncs calendar events when a webhook notification is received
 */
export async function syncCalendarEvents(channelId: string): Promise<void> {
    console.log(`Syncing events for channel ${channelId}`);

    try {
        // Get watch data from Firestore
        const watchDoc = await firestore
            .collection(CONFIG.FIRESTORE_COLLECTIONS.WATCHES)
            .doc(channelId)
            .get();

        if (!watchDoc.exists) {
            console.warn(`Watch ${channelId} not found`);
            return;
        }

        const watchData = watchDoc.data() as WatchData;
        const { userId, calendarId, targetCalendarId, paused } = watchData;

        if (paused) {
            console.log(`Sync paused for channel ${channelId}`);
            return;
        }

        if (!targetCalendarId || !userId) {
            console.warn(`Missing configuration for ${calendarId}`);
            return;
        }

        const auth = await getAuthClient(userId);
        const calendar = google.calendar({ version: 'v3', auth });

        // Fetch recent events from source calendar
        const response = await calendar.events.list({
            calendarId,
            timeMin: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Last 24 hours
            singleEvents: true,
            orderBy: 'startTime',
        });

        const events = response.data.items || [];
        console.log(`Found ${events.length} events to sync`);

        // Process each event
        for (const event of events) {
            if (!event.id) continue;

            await syncEvent(calendarId, event.id, targetCalendarId, calendar);
        }

        console.log(`Sync complete for channel ${channelId}`);
    } catch (error) {
        console.error(`Error syncing events for channel ${channelId}:`, error);
        throw error;
    }
}

/**
 * Syncs a single event from source to target calendar
 */
async function syncEvent(
    sourceCalendarId: string,
    sourceEventId: string,
    targetCalendarId: string,
    calendarClient: calendar_v3.Calendar
): Promise<void> {
    try {
        // Use composite key as document ID to avoid need for Firestore index
        const mappingId = `${sourceCalendarId}_${sourceEventId}`;
        const mappingDoc = await firestore
            .collection(CONFIG.FIRESTORE_COLLECTIONS.EVENT_MAPPINGS)
            .doc(mappingId)
            .get();

        // Fetch the source event
        const sourceEvent = await calendarClient.events.get({
            calendarId: sourceCalendarId,
            eventId: sourceEventId,
        });

        if (!sourceEvent.data) {
            console.warn(`Source event ${sourceEventId} not found`);
            return;
        }

        // Check if event is cancelled
        if (sourceEvent.data.status === 'cancelled') {
            // Delete from target if it exists
            if (mappingDoc.exists) {
                const mapping = mappingDoc.data() as EventMapping;
                await deleteTargetEvent(targetCalendarId, mapping.targetEventId, calendarClient);
                await mappingDoc.ref.delete();
            }
            return;
        }

        // Get calendar name for labeling
        const calendarName = sourceCalendarId.split('@')[0];

        // Prepare event data for target calendar
        const transparency = sourceEvent.data.transparency || 'opaque';
        const busyStatus = transparency === 'transparent' ? 'free' : 'busy';

        const eventData = {
            summary: `[${calendarName}] ${sourceEvent.data.summary || '(No title)'} - ${busyStatus}`,
            description: sourceEvent.data.description,
            start: sourceEvent.data.start,
            end: sourceEvent.data.end,
            location: sourceEvent.data.location,
            status: sourceEvent.data.status,
            transparency, // Preserve busy/free status
            visibility: 'private', // Mark as private
        };

        let targetEventId: string;

        if (!mappingDoc.exists) {
            // Create new event in target calendar
            const targetEvent = await calendarClient.events.insert({
                calendarId: targetCalendarId,
                requestBody: eventData,
            });

            targetEventId = targetEvent.data.id!;

            // Create mapping using composite key as document ID
            const mapping: EventMapping = {
                sourceCalendarId,
                sourceEventId,
                targetEventId,
                lastSynced: Timestamp.now(),
            };

            await firestore
                .collection(CONFIG.FIRESTORE_COLLECTIONS.EVENT_MAPPINGS)
                .doc(mappingId)
                .set(mapping);

            console.log(`Created new event ${targetEventId} in target calendar`);
        } else {
            // Update existing event
            const mapping = mappingDoc.data() as EventMapping;
            targetEventId = mapping.targetEventId;

            await calendarClient.events.update({
                calendarId: targetCalendarId,
                eventId: targetEventId,
                requestBody: eventData,
            });

            // Update mapping timestamp
            await mappingDoc.ref.update({
                lastSynced: Timestamp.now(),
            });

            console.log(`Updated event ${targetEventId} in target calendar`);
        }
    } catch (error) {
        console.error(`Error syncing event ${sourceEventId}:`, error);
        // Continue processing other events
    }
}

/**
 * Deletes an event from the target calendar
 */
async function deleteTargetEvent(
    targetCalendarId: string,
    targetEventId: string,
    calendarClient: calendar_v3.Calendar
): Promise<void> {
    try {
        await calendarClient.events.delete({
            calendarId: targetCalendarId,
            eventId: targetEventId,
        });

        console.log(`Deleted event ${targetEventId} from target calendar`);
    } catch (error) {
        console.error(`Error deleting event ${targetEventId}:`, error);
    }
}
