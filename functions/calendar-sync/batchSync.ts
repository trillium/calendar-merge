import { google } from 'googleapis';
import { Firestore, FieldValue } from '@google-cloud/firestore';
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
 * Round-robin batch sync - processes all user's calendars one batch at a time
 */
export async function batchSyncRoundRobin(userId: string): Promise<void> {
    console.log(`Starting round-robin batch sync for user ${userId}`);

    const MAX_SYNC_DURATION_MS = 60 * 60 * 1000; // 1 hour
    const MAX_ITERATIONS = 2000;

    try {
        const userRef = firestore.collection('users').doc(userId);

        // Get next channelId to process (atomic transaction)
        const channelId = await firestore.runTransaction(async (tx) => {
            const userDoc = await tx.get(userRef);
            const syncCoord = userDoc.data()?.syncCoordination;

            if (!syncCoord) {
                throw new Error('Sync coordination not found');
            }

            const { currentIndex, channelIds, iterationCount, createdAt } = syncCoord;

            // Safety: max iterations check
            if (iterationCount > MAX_ITERATIONS) {
                throw new Error(`Max iterations (${MAX_ITERATIONS}) exceeded - possible infinite loop`);
            }

            // Safety: timeout check (1 hour max)
            if (createdAt) {
                const syncStartTime = createdAt.toMillis();
                if (Date.now() - syncStartTime > MAX_SYNC_DURATION_MS) {
                    throw new Error('Sync timeout - has been running for over 1 hour');
                }
            }

            // Get current watch to process
            const currentChannelId = channelIds[currentIndex];

            // Increment index for next iteration (round-robin)
            const nextIndex = (currentIndex + 1) % channelIds.length;

            // Update coordination state atomically
            tx.update(userRef, {
                'syncCoordination.currentIndex': nextIndex,
                'syncCoordination.lastIterationAt': FieldValue.serverTimestamp(),
                'syncCoordination.iterationCount': iterationCount + 1,
            });

            return currentChannelId;
        });

        // Process 1 batch for this calendar
        await processSingleBatch(channelId);

        // Check if all calendars complete
        const userDoc = await userRef.get();
        const channelIds = userDoc.data()?.syncCoordination?.channelIds || [];

        const allComplete = await checkAllComplete(channelIds);

        if (!allComplete) {
            // Enqueue next iteration with delay between batches
            await enqueueBatchSync(userId, 2);
        } else {
            // All calendars complete - mark coordination as complete
            await userRef.update({
                'syncCoordination.status': 'complete'
            });
            console.log(`All calendars synced for user ${userId}!`);
        }
    } catch (error) {
        console.error(`Error in round-robin batch sync for user ${userId}:`, error);
        throw error;
    }
}

/**
 * Process a single batch (50 events) for one calendar
 */
async function processSingleBatch(channelId: string): Promise<void> {
    console.log(`Processing single batch for channel ${channelId}`);

    try {
        // Get watch data from Firestore
        const watchDoc = await firestore
            .collection(CONFIG.FIRESTORE_COLLECTIONS.WATCHES)
            .doc(channelId)
            .get();

        if (!watchDoc.exists) {
            console.log(`Watch ${channelId} not found (may have been deleted by user)`);
            return;
        }

        const watchData = watchDoc.data() as WatchData;
        const { userId, calendarId, targetCalendarId, syncState } = watchData;

        // Skip if already complete or failed
        if (syncState?.status === 'complete') {
            console.log(`Sync already complete for channel ${channelId}`);
            return;
        }

        if (syncState?.status === 'failed') {
            console.log(`Sync marked as failed for channel ${channelId}, skipping`);
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

        let auth;
        let calendar;

        try {
            auth = await getAuthClient(userId);
            calendar = google.calendar({ version: 'v3', auth });
        } catch (error: any) {
            // OAuth tokens invalid or revoked
            if (error.message?.includes('tokens') || error.message?.includes('No tokens found')) {
                console.error(`OAuth tokens invalid for user ${userId}`);
                await watchDoc.ref.update({
                    'syncState.status': 'failed',
                    'syncState.lastError': 'OAuth tokens invalid or revoked',
                    'syncState.lastErrorAt': FieldValue.serverTimestamp(),
                });
                return;
            }
            throw error;
        }

        // Retry failed events first (with exponential backoff)
        const existingFailedEvents = syncState?.failedEvents || [];
        const retryCount = syncState?.retryCount || 0;
        const MAX_RETRY_COUNT = 5;

        if (existingFailedEvents.length > 0 && retryCount < MAX_RETRY_COUNT) {
            console.log(`Retrying ${existingFailedEvents.length} failed events (attempt ${retryCount + 1})`);

            const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 30000);
            await sleep(backoffDelay);

            const retriedSuccess: string[] = [];
            for (const eventId of existingFailedEvents) {
                const result = await syncEvent(calendarId, eventId, targetCalendarId, calendar);
                if (result.success) {
                    retriedSuccess.push(eventId);
                }
                await sleep(RATE_LIMIT_DELAY_MS);
            }

            // Remove successfully retried events
            const stillFailed = existingFailedEvents.filter(id => !retriedSuccess.includes(id));
            await watchDoc.ref.update({
                'syncState.failedEvents': stillFailed,
                'syncState.retryCount': retryCount + 1,
            });

            console.log(`Retry complete: ${retriedSuccess.length} succeeded, ${stillFailed.length} still failing`);
        }

        // Fetch batch of events
        const now = new Date();
        let response;

        try {
            response = await calendar.events.list({
                calendarId,
                timeMin: now.toISOString(),
                timeMax: syncState?.timeMax,
                maxResults: 50,
                pageToken: syncState?.pageToken,
                singleEvents: true,
                orderBy: 'startTime',
            });
        } catch (error: any) {
            // PageToken expired (HTTP 410 Gone) - restart from beginning
            if (error.code === 410 || error.message?.includes('pageToken')) {
                console.log(`PageToken expired for ${channelId}, restarting sync from beginning`);
                response = await calendar.events.list({
                    calendarId,
                    timeMin: now.toISOString(),
                    timeMax: syncState?.timeMax,
                    maxResults: 50,
                    pageToken: null, // No token - start fresh
                    singleEvents: true,
                    orderBy: 'startTime',
                });

                // Reset sync state
                await watchDoc.ref.update({
                    'syncState.pageToken': null,
                });
            }
            // Calendar not found (deleted)
            else if (error.code === 404) {
                console.error(`Source calendar ${calendarId} not found (deleted?)`);
                await watchDoc.ref.update({
                    'syncState.status': 'failed',
                    'syncState.lastError': 'Source calendar not found (may have been deleted)',
                    'syncState.lastErrorAt': FieldValue.serverTimestamp(),
                });
                return;
            } else {
                throw error;
            }
        }

        const events = response.data.items || [];
        console.log(`Fetched ${events.length} events for batch sync`);

        // Handle empty calendar
        if (events.length === 0 && response.data.nextSyncToken) {
            console.log(`Calendar ${channelId} has no events, marking complete`);
            await watchDoc.ref.update({
                'syncState.status': 'complete',
                'syncToken': response.data.nextSyncToken,
                'syncState.pageToken': null,
            });
            return;
        }

        // Process events with rate limiting and track failures
        let syncedCount = 0;
        const failedEvents: string[] = [];

        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            if (!event.id) continue;

            const result = await syncEvent(calendarId, event.id, targetCalendarId, calendar);
            if (result.success) {
                syncedCount++;
            } else if (result.eventId) {
                // Track for retry
                failedEvents.push(result.eventId);
            }

            // Rate limiting: delay between events
            if (i < events.length - 1) {
                await sleep(RATE_LIMIT_DELAY_MS);
            }
        }

        console.log(`Processed ${events.length} events, synced ${syncedCount}, failed ${failedEvents.length}`);

        // Update progress in Firestore
        const currentEventsSynced = (syncState?.eventsSynced || 0) + syncedCount;
        const updates: any = {
            'syncState.eventsSynced': currentEventsSynced,
            'syncState.lastBatchTime': Date.now(),
        };

        // Store failed events for retry
        if (failedEvents.length > 0) {
            updates['syncState.failedEvents'] = FieldValue.arrayUnion(...failedEvents);
        }

        // Handle pagination correctly
        if (response.data.nextPageToken) {
            // More pages to come - store pageToken and continue
            console.log(`More pages available for channel ${channelId}`);
            updates['syncState.pageToken'] = response.data.nextPageToken;
            updates['syncState.status'] = 'syncing';
        } else if (response.data.nextSyncToken) {
            // Final page - store syncToken and mark complete
            console.log(`Final page reached for channel ${channelId}, marking complete`);
            updates['syncToken'] = response.data.nextSyncToken;
            updates['syncState.status'] = 'complete';
            updates['syncState.pageToken'] = null;
        } else {
            // No nextPageToken and no nextSyncToken
            console.log(`No pagination tokens for channel ${channelId}, marking complete`);
            updates['syncState.status'] = 'complete';
            updates['syncState.pageToken'] = null;
        }

        await watchDoc.ref.update(updates);
        console.log(`Batch complete for channel ${channelId}: ${currentEventsSynced} total events synced`);
    } catch (error) {
        console.error(`Error processing batch for channel ${channelId}:`, error);

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
 * Check if all calendars are complete or failed
 */
async function checkAllComplete(channelIds: string[]): Promise<boolean> {
    const watches = await Promise.all(
        channelIds.map(id => firestore.collection(CONFIG.FIRESTORE_COLLECTIONS.WATCHES).doc(id).get())
    );

    const allDone = watches.every(w => {
        if (!w.exists) return true; // Deleted watches count as done
        const status = w.data()?.syncState?.status;
        return status === 'complete' || status === 'failed';
    });

    if (allDone) {
        // Check if ANY events were actually synced
        const hasAnySuccess = watches.some(w => {
            if (!w.exists) return false;
            const eventsSynced = w.data()?.syncState?.eventsSynced || 0;
            return eventsSynced > 0;
        });

        const allFailed = watches.every(w => {
            if (!w.exists) return false;
            const status = w.data()?.syncState?.status;
            return status === 'failed';
        });

        if (allFailed) {
            console.error('All calendars failed - no events synced');
            throw new Error('All calendars failed - check OAuth tokens and calendar access');
        }

        if (!hasAnySuccess) {
            console.warn('Sync complete but no events were synced');
        }
    }

    return allDone;
}

/**
 * Enqueue a batch sync task in Cloud Tasks
 */
export async function enqueueBatchSync(userId: string, delaySeconds: number): Promise<void> {
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

        // Get current iteration count for deterministic task naming (prevents duplicates)
        const userRef = firestore.collection('users').doc(userId);
        const userDoc = await userRef.get();
        const iterationCount = userDoc.data()?.syncCoordination?.iterationCount || 0;

        // Deterministic task name prevents duplicate tasks even if function is retried
        const taskName = `projects/${projectId}/locations/${region}/queues/calendar-sync-queue/tasks/sync-${userId}-${iterationCount}`;

        // Create task
        const task = {
            name: taskName, // Explicit name prevents duplicates
            httpRequest: {
                httpMethod: 'POST' as const,
                url: functionUrl,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: Buffer.from(JSON.stringify({ userId })).toString('base64'),
                oidcToken: {
                    serviceAccountEmail: serviceAccountEmail,
                    audience: functionUrl,
                },
            },
            scheduleTime: {
                seconds: Math.floor(Date.now() / 1000) + delaySeconds,
            },
        };

        console.log(`Enqueueing batch sync task for user ${userId} (iteration ${iterationCount}) with ${delaySeconds}s delay`);

        try {
            await client.createTask({
                parent: queuePath,
                task,
            });
            console.log(`Task enqueued successfully: ${taskName}`);
        } catch (error: any) {
            // Task already exists - safe to ignore (prevents duplicates)
            if (error.code === 6) { // ALREADY_EXISTS
                console.log(`Task ${taskName} already exists, skipping duplicate`);
                return;
            }
            throw error;
        }
    } catch (error) {
        console.error(`Error enqueueing batch sync for user ${userId}:`, error);
        throw error;
    }
}
