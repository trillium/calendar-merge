import { google } from 'googleapis';
import { Firestore, FieldValue } from '@google-cloud/firestore';
import { getAuthClient } from './auth';
import { WatchData } from './types';
import { CONFIG } from './config';

const firestore = new Firestore();
const calendar = google.calendar('v3');

// Rate limiting: delay between API calls to respect Google's quotas
const RATE_LIMIT_DELAY_MS = 150; // 150ms delay = ~6-7 requests/second, well under 10/second limit

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Creates a new watch subscription for a calendar
 * Returns the channelId for triggering initial sync
 */
export async function createCalendarWatch(
    userId: string,
    calendarId: string,
    webhookUrl: string,
    targetCalendarId?: string
): Promise<string> {
    const auth = await getAuthClient(userId);
    const calendar = google.calendar({ version: 'v3', auth });
    // Encode channel ID to only use allowed characters: [A-Za-z0-9\-_\+/=]+
    const channelId = Buffer.from(`${userId}-${calendarId}-${Date.now()}`).toString('base64');
    const expiration = Date.now() + (CONFIG.WATCH_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);

    try {
        // Calculate time window for batch sync (no API call yet)
        const now = new Date();
        const timeMax = new Date();
        timeMax.setFullYear(timeMax.getFullYear() + 2);

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

        // Store watch with pending sync state (no syncToken yet)
        const watchData: WatchData = {
            userId,
            calendarId,
            channelId,
            resourceId: response.data.resourceId || '',
            expiration,
            targetCalendarId,
            stats: {
                totalEventsSynced: 0,
            },
            syncState: {
                status: 'pending',
                eventsSynced: 0,
                timeMax: timeMax.toISOString(),
            },
        };

        await firestore
            .collection(CONFIG.FIRESTORE_COLLECTIONS.WATCHES)
            .doc(channelId)
            .set(watchData);

        console.log(`Watch created for calendar ${calendarId}`);
        return channelId;
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

/**
 * Creates sync coordination state for round-robin batch processing
 * Stores coordination as nested field in existing users/{userId} document
 */
export async function createSyncCoordination(userId: string, channelIds: string[]): Promise<void> {
    const userRef = firestore.collection('users').doc(userId);

    // Check for existing running sync
    const existing = await userRef.get();
    if (existing.exists) {
        const syncCoord = existing.data()?.syncCoordination;
        if (syncCoord?.status === 'running') {
            throw new Error('Sync already in progress for this user');
        }
    }

    // Store coordination as nested object in user document (merge preserves other fields)
    await userRef.set({
        syncCoordination: {
            currentIndex: 0,
            channelIds,  // Array of watch channelIds to process in round-robin
            status: 'running',
            createdAt: FieldValue.serverTimestamp(),
            lastIterationAt: FieldValue.serverTimestamp(),
            iterationCount: 0,
        }
    }, { merge: true });

    console.log(`Sync coordination created for user ${userId} with ${channelIds.length} calendars`);
}
