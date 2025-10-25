import { google } from 'googleapis';
import { Firestore } from '@google-cloud/firestore';
import { getAuthClient } from './auth';
import { WatchData } from './types';
import { CONFIG } from './config';

const firestore = new Firestore();
const calendar = google.calendar('v3');

/**
 * Creates a new watch subscription for a calendar
 */
export async function createCalendarWatch(
    userId: string,
    calendarId: string,
    webhookUrl: string,
    targetCalendarId?: string
): Promise<void> {
    const auth = await getAuthClient(userId);
    const calendar = google.calendar({ version: 'v3', auth });
    // Encode channel ID to only use allowed characters: [A-Za-z0-9\-_\+/=]+
    const channelId = Buffer.from(`${userId}-${calendarId}-${Date.now()}`).toString('base64');
    const expiration = Date.now() + (CONFIG.WATCH_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);

    try {
        // Perform initial sync to get syncToken
        console.log(`Performing initial sync for calendar ${calendarId}`);
        const initialSync = await calendar.events.list({
            calendarId,
            maxResults: 2500,
            singleEvents: true,
        });

        const initialSyncToken = initialSync.data.nextSyncToken;
        console.log(`Initial sync complete: ${initialSync.data.items?.length || 0} events, syncToken obtained`);

        // Create watch subscription
        const response = await calendar.events.watch({
            calendarId,
            requestBody: {
                id: channelId,
                type: 'web_hook',
                address: webhookUrl,
                expiration: expiration.toString(),
            },
        });

        const watchData: WatchData = {
            userId,
            calendarId,
            channelId,
            resourceId: response.data.resourceId || '',
            expiration,
            targetCalendarId,
            syncToken: initialSyncToken || null,
            stats: {
                totalEventsSynced: 0,
                lastSyncTime: undefined,
                lastSyncEventCount: undefined,
            },
        };

        await firestore
            .collection(CONFIG.FIRESTORE_COLLECTIONS.WATCHES)
            .doc(channelId)
            .set(watchData);

        console.log(`Watch created for calendar ${calendarId}`);
    } catch (error) {
        console.error(`Error creating watch for calendar ${calendarId}:`, error);
        throw error;
    }
}

/**
 * Renews an existing watch subscription
 */
export async function renewCalendarWatch(calendarId: string, watchId: string): Promise<void> {
    console.log(`Renewing watch for calendar ${calendarId}`);

    try {
        const watchDoc = await firestore
            .collection(CONFIG.FIRESTORE_COLLECTIONS.WATCHES)
            .doc(watchId)
            .get();

        if (!watchDoc.exists) {
            console.warn(`Watch ${watchId} not found, skipping renewal`);
            return;
        }

        const watchData = watchDoc.data() as WatchData;

        // Stop the old watch
        await stopCalendarWatch(watchData.userId, watchData.channelId, watchData.resourceId);

        // Create a new watch with the same configuration
        const webhookUrl = process.env.WEBHOOK_URL || '';
        await createCalendarWatch(watchData.userId, calendarId, webhookUrl, watchData.targetCalendarId);

        // Delete the old watch document
        await watchDoc.ref.delete();

        console.log(`Watch renewed for calendar ${calendarId}`);
    } catch (error) {
        console.error(`Error renewing watch for calendar ${calendarId}:`, error);
        throw error;
    }
}

/**
 * Stops a watch subscription
 */
export async function stopCalendarWatch(userId: string, channelId: string, resourceId: string): Promise<void> {
    const auth = await getAuthClient(userId);
    const calendar = google.calendar({ version: 'v3', auth });

    try {
        await calendar.channels.stop({
            auth,
            requestBody: {
                id: channelId,
                resourceId,
            },
        });

        console.log(`Watch ${channelId} stopped`);
    } catch (error) {
        console.error(`Error stopping watch ${channelId}:`, error);
        // Don't throw - watch might already be expired
    }
}
