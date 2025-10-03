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
    calendarId: string,
    webhookUrl: string,
    targetCalendarId?: string
): Promise<void> {
    const auth = await getAuthClient();
    const channelId = `${calendarId}-${Date.now()}`;
    const expiration = Date.now() + (CONFIG.WATCH_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);

    try {
        const response = await calendar.events.watch({
            auth,
            calendarId,
            requestBody: {
                id: channelId,
                type: 'web_hook',
                address: webhookUrl,
                expiration: expiration.toString(),
            },
        });

        const watchData: WatchData = {
            calendarId,
            channelId,
            resourceId: response.data.resourceId || '',
            expiration,
            targetCalendarId,
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
        await stopCalendarWatch(watchData.channelId, watchData.resourceId);

        // Create a new watch with the same configuration
        const webhookUrl = process.env.WEBHOOK_URL || '';
        await createCalendarWatch(calendarId, webhookUrl, watchData.targetCalendarId);

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
export async function stopCalendarWatch(channelId: string, resourceId: string): Promise<void> {
    const auth = await getAuthClient();

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
