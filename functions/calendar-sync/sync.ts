import { google } from 'googleapis';
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
        const { userId, calendarId, targetCalendarId } = watchData;

        if (!targetCalendarId || !userId) {
            console.warn(`Missing configuration for ${calendarId}`);
            return;
        }

        const auth = await getAuthClient(userId);
        const calendar = google.calendar({ version: 'v3', auth });

        // Fetch recent events from source calendar
        const response = await calendar.events.list({
            auth,
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

            await syncEvent(calendarId, event.id, targetCalendarId, auth);
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
    auth: any
): Promise<void> {
    try {
        // Check if event already has a mapping
        const mappingQuery = await firestore
            .collection(CONFIG.FIRESTORE_COLLECTIONS.EVENT_MAPPINGS)
            .where('sourceCalendarId', '==', sourceCalendarId)
            .where('sourceEventId', '==', sourceEventId)
            .limit(1)
            .get();

        // Fetch the source event
        const sourceEvent = await calendar.events.get({
            auth,
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
            if (!mappingQuery.empty) {
                const mapping = mappingQuery.docs[0].data() as EventMapping;
                await deleteTargetEvent(targetCalendarId, mapping.targetEventId, auth);
                await mappingQuery.docs[0].ref.delete();
            }
            return;
        }

        // Prepare event data for target calendar
        const eventData = {
            summary: sourceEvent.data.summary,
            description: sourceEvent.data.description,
            start: sourceEvent.data.start,
            end: sourceEvent.data.end,
            location: sourceEvent.data.location,
            status: sourceEvent.data.status,
        };

        let targetEventId: string;

        if (mappingQuery.empty) {
            // Create new event in target calendar
            const targetEvent = await calendar.events.insert({
                auth,
                calendarId: targetCalendarId,
                requestBody: eventData,
            });

            targetEventId = targetEvent.data.id!;

            // Create mapping
            const mapping: EventMapping = {
                sourceCalendarId,
                sourceEventId,
                targetEventId,
                lastSynced: Timestamp.now(),
            };

            await firestore
                .collection(CONFIG.FIRESTORE_COLLECTIONS.EVENT_MAPPINGS)
                .add(mapping);

            console.log(`Created new event ${targetEventId} in target calendar`);
        } else {
            // Update existing event
            const mapping = mappingQuery.docs[0].data() as EventMapping;
            targetEventId = mapping.targetEventId;

            await calendar.events.update({
                auth,
                calendarId: targetCalendarId,
                eventId: targetEventId,
                requestBody: eventData,
            });

            // Update mapping timestamp
            await mappingQuery.docs[0].ref.update({
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
    auth: any
): Promise<void> {
    try {
        await calendar.events.delete({
            auth,
            calendarId: targetCalendarId,
            eventId: targetEventId,
        });

        console.log(`Deleted event ${targetEventId} from target calendar`);
    } catch (error) {
        console.error(`Error deleting event ${targetEventId}:`, error);
    }
}
