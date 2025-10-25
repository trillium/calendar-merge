import { google, calendar_v3 } from 'googleapis';
import { Firestore, Timestamp } from '@google-cloud/firestore';
import { getAuthClient } from './auth';
import { EventMapping, WatchData } from './types';
import { CONFIG } from './config';

const firestore = new Firestore();

// Rate limiting: delay between API calls to respect Google's quotas
const RATE_LIMIT_DELAY_MS = 150; // 150ms delay = ~6-7 requests/second, well under 10/second limit

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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
        const { userId, calendarId, targetCalendarId, paused, syncToken } = watchData;

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

        let events: calendar_v3.Schema$Event[] = [];
        let newSyncToken: string | null | undefined = null;

        // Only sync future events (from now onwards)
        const now = new Date();
        const timeMin = now.toISOString();

        try {
            if (syncToken) {
                // Incremental sync using syncToken
                console.log(`Using syncToken for incremental sync`);
                const response = await calendar.events.list({
                    calendarId,
                    syncToken,
                });

                events = response.data.items || [];
                newSyncToken = response.data.nextSyncToken;
                console.log(`Incremental sync: Found ${events.length} changed events`);
            } else {
                // Initial full sync - only future events to avoid rate limits
                console.log(`No syncToken found, performing initial sync (future events only)`);
                const response = await calendar.events.list({
                    calendarId,
                    maxResults: 2500,
                    singleEvents: true,
                    timeMin, // Only events starting from now
                    orderBy: 'startTime',
                });

                events = response.data.items || [];
                newSyncToken = response.data.nextSyncToken;
                console.log(`Full sync: Found ${events.length} future events`);
            }
        } catch (error: any) {
            // Handle expired syncToken (410 Gone)
            if (error.code === 410) {
                console.log(`SyncToken expired, performing full resync (future events only)`);
                const response = await calendar.events.list({
                    calendarId,
                    maxResults: 2500,
                    singleEvents: true,
                    timeMin, // Only events starting from now
                    orderBy: 'startTime',
                });

                events = response.data.items || [];
                newSyncToken = response.data.nextSyncToken;
                console.log(`Full resync: Found ${events.length} future events`);
            } else {
                throw error;
            }
        }

        // Process each event with rate limiting
        let syncedCount = 0;
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            if (!event.id) continue;

            const synced = await syncEvent(calendarId, event.id, targetCalendarId, calendar);
            if (synced) syncedCount++;

            // Rate limiting: delay between events to avoid quota exhaustion
            // Skip delay on last event
            if (i < events.length - 1) {
                await sleep(RATE_LIMIT_DELAY_MS);
            }
        }

        console.log(`Processed ${events.length} events with rate limiting (${RATE_LIMIT_DELAY_MS}ms delay)`);

        // Update watch statistics
        const updates: any = {};
        if (newSyncToken) {
            updates.syncToken = newSyncToken;
        }

        // Update stats
        const currentStats = watchData.stats || { totalEventsSynced: 0 };
        updates.stats = {
            totalEventsSynced: currentStats.totalEventsSynced + syncedCount,
            lastSyncTime: Date.now(),
            lastSyncEventCount: syncedCount,
        };

        await watchDoc.ref.update(updates);
        console.log(`Sync complete for channel ${channelId}: ${syncedCount} events processed`);
        console.log(`Total events synced: ${updates.stats.totalEventsSynced}`);
    } catch (error) {
        console.error(`Error syncing events for channel ${channelId}:`, error);
        throw error;
    }
}

/**
 * Syncs a single event from source to target calendar
 */
export async function syncEvent(
    sourceCalendarId: string,
    sourceEventId: string,
    targetCalendarId: string,
    calendarClient: calendar_v3.Calendar
): Promise<boolean> {
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
            return false;
        }

        // Check if event is cancelled
        if (sourceEvent.data.status === 'cancelled') {
            // Delete from target if it exists
            if (mappingDoc.exists) {
                const mapping = mappingDoc.data() as EventMapping;
                await deleteTargetEvent(targetCalendarId, mapping.targetEventId, calendarClient);
                await mappingDoc.ref.delete();
            }
            return false;
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

        return true;
    } catch (error) {
        console.error(`Error syncing event ${sourceEventId}:`, error);
        // Continue processing other events
        return false;
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
