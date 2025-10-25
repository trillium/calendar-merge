import { google } from 'googleapis';
import { Firestore } from '@google-cloud/firestore';
import { getAuthClient } from './auth';
import { WatchData } from './types';
import { CONFIG } from './config';
import { syncEvent } from './sync';

const firestore = new Firestore();

// Lazy-load CloudTasksClient to avoid bundling issues in Next.js
let tasksClient: any = null;
async function getTasksClient() {
    if (!tasksClient) {
        const { CloudTasksClient } = await import('@google-cloud/tasks');
        tasksClient = new CloudTasksClient();
    }
    return tasksClient;
}

// Rate limiting: delay between API calls to respect Google's quotas
const RATE_LIMIT_DELAY_MS = 150; // 150ms delay = ~6-7 requests/second, well under 10/second limit

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Process a batch of events for a calendar watch
 * Handles pagination and rate limiting
 */
export async function batchSyncEvents(channelId: string): Promise<void> {
    console.log(`Starting batch sync for channel ${channelId}`);

    try {
        // Get watch data from Firestore
        const watchDoc = await firestore
            .collection(CONFIG.FIRESTORE_COLLECTIONS.WATCHES)
            .doc(channelId)
            .get();

        if (!watchDoc.exists) {
            console.error(`Watch ${channelId} not found`);
            throw new Error(`Watch ${channelId} not found`);
        }

        const watchData = watchDoc.data() as WatchData;
        const { userId, calendarId, targetCalendarId, syncState } = watchData;

        // Check if sync is already complete
        if (syncState?.status === 'complete') {
            console.log(`Sync already complete for channel ${channelId}`);
            return;
        }

        if (!targetCalendarId || !userId) {
            console.error(`Missing configuration for ${calendarId}`);
            throw new Error(`Missing configuration for ${calendarId}`);
        }

        // Mark as syncing
        if (syncState?.status !== 'syncing') {
            await watchDoc.ref.update({
                'syncState.status': 'syncing',
                'syncState.lastBatchTime': Date.now(),
            });
        }

        const auth = await getAuthClient(userId);
        const calendar = google.calendar({ version: 'v3', auth });

        // Fetch batch of events
        const now = new Date();
        const response = await calendar.events.list({
            calendarId,
            timeMin: now.toISOString(),
            timeMax: syncState?.timeMax,
            maxResults: 50,
            pageToken: syncState?.pageToken,
            singleEvents: true,
            orderBy: 'startTime',
        });

        const events = response.data.items || [];
        console.log(`Fetched ${events.length} events for batch sync`);

        // Process events with rate limiting
        let syncedCount = 0;
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            if (!event.id) continue;

            const synced = await syncEvent(calendarId, event.id, targetCalendarId, calendar);
            if (synced) syncedCount++;

            // Rate limiting: delay between events
            if (i < events.length - 1) {
                await sleep(RATE_LIMIT_DELAY_MS);
            }
        }

        console.log(`Processed ${events.length} events, synced ${syncedCount}`);

        // Update progress in Firestore
        const currentEventsSynced = (syncState?.eventsSynced || 0) + syncedCount;
        const updates: any = {
            'syncState.eventsSynced': currentEventsSynced,
            'syncState.lastBatchTime': Date.now(),
        };

        // Handle pagination correctly
        if (response.data.nextPageToken) {
            // More pages to come - store pageToken and continue
            console.log(`More pages available, enqueueing next batch`);
            updates['syncState.pageToken'] = response.data.nextPageToken;
            updates['syncState.status'] = 'syncing';
            await watchDoc.ref.update(updates);

            // Enqueue next batch
            await enqueueBatchSync(channelId, 2);
        } else if (response.data.nextSyncToken) {
            // Final page - store syncToken and mark complete
            console.log(`Final page reached, marking sync as complete`);
            updates['syncToken'] = response.data.nextSyncToken;
            updates['syncState.status'] = 'complete';
            updates['syncState.pageToken'] = null; // Clear pagination token
            await watchDoc.ref.update(updates);

            console.log(`Batch sync complete for channel ${channelId}: ${currentEventsSynced} total events synced`);
        } else {
            // No nextPageToken and no nextSyncToken - unusual but handle it
            console.warn(`No nextPageToken or nextSyncToken in response`);
            updates['syncState.status'] = 'complete';
            updates['syncState.pageToken'] = null;
            await watchDoc.ref.update(updates);
        }
    } catch (error) {
        console.error(`Error in batch sync for channel ${channelId}:`, error);

        // Mark sync as failed
        try {
            await firestore
                .collection(CONFIG.FIRESTORE_COLLECTIONS.WATCHES)
                .doc(channelId)
                .update({
                    'syncState.status': 'failed',
                    'syncState.lastBatchTime': Date.now(),
                });
        } catch (updateError) {
            console.error(`Failed to update sync status to failed:`, updateError);
        }

        throw error;
    }
}

/**
 * Enqueue a batch sync task in Cloud Tasks
 */
export async function enqueueBatchSync(channelId: string, delaySeconds: number): Promise<void> {
    try {
        const projectId = process.env.PROJECT_ID || CONFIG.PROJECT_ID;
        const region = process.env.REGION || 'us-central1';
        const functionUrl = process.env.BATCH_SYNC_URL;
        const serviceAccountEmail = process.env.SERVICE_ACCOUNT_EMAIL;

        if (!projectId) {
            throw new Error('Missing PROJECT_ID environment variable');
        }

        if (!functionUrl) {
            throw new Error('Missing BATCH_SYNC_URL environment variable');
        }

        if (!serviceAccountEmail) {
            throw new Error('Missing SERVICE_ACCOUNT_EMAIL environment variable');
        }

        // Get Cloud Tasks client (lazy-loaded)
        const client = await getTasksClient();

        // Construct queue path
        const queuePath = client.queuePath(projectId, region, 'calendar-sync-queue');

        // Create task
        const task = {
            httpRequest: {
                httpMethod: 'POST' as const,
                url: functionUrl,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: Buffer.from(JSON.stringify({ channelId })).toString('base64'),
                oidcToken: {
                    serviceAccountEmail: serviceAccountEmail,
                    audience: functionUrl,
                },
            },
            scheduleTime: {
                seconds: Math.floor(Date.now() / 1000) + delaySeconds,
            },
        };

        console.log(`Enqueueing batch sync task for channel ${channelId} with ${delaySeconds}s delay`);
        await client.createTask({
            parent: queuePath,
            task,
        });

        console.log(`Task enqueued successfully for channel ${channelId}`);
    } catch (error) {
        console.error(`Error enqueueing batch sync for channel ${channelId}:`, error);
        throw error;
    }
}
