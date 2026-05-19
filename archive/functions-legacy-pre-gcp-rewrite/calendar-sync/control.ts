import { Request, Response } from 'express';
import { Firestore } from '@google-cloud/firestore';
import { google } from 'googleapis';
import { getAuthClient } from './auth';
import { WatchData } from './types';
import { CONFIG } from './config';
import { createCalendarWatch } from './watch';

const firestore = new Firestore();

/**
 * Helper function to clean up existing watches for a user
 * Returns the number of watches stopped
 */
export async function cleanupUserWatches(userId: string): Promise<number> {
    const auth = await getAuthClient(userId);
    const calendar = google.calendar({ version: 'v3', auth });

    // Get all watches for this user
    const watchesSnapshot = await firestore
        .collection(CONFIG.FIRESTORE_COLLECTIONS.WATCHES)
        .where('userId', '==', userId)
        .get();

    let stoppedCount = 0;

    // Stop each watch with Google Calendar API
    for (const doc of watchesSnapshot.docs) {
        const watchData = doc.data() as WatchData;
        try {
            await calendar.channels.stop({
                requestBody: {
                    id: watchData.channelId,
                    resourceId: watchData.resourceId,
                },
            });
            await doc.ref.delete();
            stoppedCount++;
        } catch (error) {
            console.error(`Failed to stop watch ${watchData.channelId}:`, error);
            // Still delete the Firestore doc even if Google API call fails
            await doc.ref.delete();
        }
    }

    return stoppedCount;
}

/**
 * Pause syncing for a user - stops processing webhooks but keeps watches active
 */
export async function pauseSync(req: Request, res: Response): Promise<void> {
    try {
        const { userId } = req.body;

        if (!userId) {
            res.status(400).json({ error: 'userId is required' });
            return;
        }

        // Update all watches for this user to paused
        const watchesSnapshot = await firestore
            .collection(CONFIG.FIRESTORE_COLLECTIONS.WATCHES)
            .where('userId', '==', userId)
            .get();

        const batch = firestore.batch();
        watchesSnapshot.docs.forEach(doc => {
            batch.update(doc.ref, { paused: true });
        });
        await batch.commit();

        res.json({
            success: true,
            message: `Paused ${watchesSnapshot.size} watch(es) for user ${userId}`
        });
    } catch (error) {
        console.error('Error pausing sync:', error);
        res.status(500).json({ error: 'Failed to pause sync' });
    }
}

/**
 * Resume syncing for a user
 */
export async function resumeSync(req: Request, res: Response): Promise<void> {
    try {
        const { userId } = req.body;

        if (!userId) {
            res.status(400).json({ error: 'userId is required' });
            return;
        }

        // Update all watches for this user to unpaused
        const watchesSnapshot = await firestore
            .collection(CONFIG.FIRESTORE_COLLECTIONS.WATCHES)
            .where('userId', '==', userId)
            .get();

        const batch = firestore.batch();
        watchesSnapshot.docs.forEach(doc => {
            batch.update(doc.ref, { paused: false });
        });
        await batch.commit();

        res.json({
            success: true,
            message: `Resumed ${watchesSnapshot.size} watch(es) for user ${userId}`
        });
    } catch (error) {
        console.error('Error resuming sync:', error);
        res.status(500).json({ error: 'Failed to resume sync' });
    }
}

/**
 * Stop syncing completely - deletes watches and stops webhooks
 */
export async function stopSync(req: Request, res: Response): Promise<void> {
    try {
        const { userId } = req.body;

        if (!userId) {
            res.status(400).json({ error: 'userId is required' });
            return;
        }

        const auth = await getAuthClient(userId);
        const calendar = google.calendar({ version: 'v3', auth });

        // Get all watches for this user
        const watchesSnapshot = await firestore
            .collection(CONFIG.FIRESTORE_COLLECTIONS.WATCHES)
            .where('userId', '==', userId)
            .get();

        let stoppedCount = 0;

        // Stop each watch with Google Calendar API
        for (const doc of watchesSnapshot.docs) {
            const watchData = doc.data() as WatchData;
            try {
                await calendar.channels.stop({
                    requestBody: {
                        id: watchData.channelId,
                        resourceId: watchData.resourceId,
                    },
                });
                await doc.ref.delete();
                stoppedCount++;
            } catch (error) {
                console.error(`Failed to stop watch ${watchData.channelId}:`, error);
            }
        }

        res.json({
            success: true,
            message: `Stopped ${stoppedCount} watch(es) for user ${userId}`
        });
    } catch (error) {
        console.error('Error stopping sync:', error);
        res.status(500).json({ error: 'Failed to stop sync' });
    }
}

/**
 * Clear user data - deletes watches and event mappings, then pauses
 * Does NOT delete OAuth tokens
 */
export async function clearUserData(req: Request, res: Response): Promise<void> {
    try {
        const { userId } = req.body;

        if (!userId) {
            res.status(400).json({ error: 'userId is required' });
            return;
        }

        const auth = await getAuthClient(userId);
        const calendar = google.calendar({ version: 'v3', auth });

        // Stop and delete all watches
        const watchesSnapshot = await firestore
            .collection(CONFIG.FIRESTORE_COLLECTIONS.WATCHES)
            .where('userId', '==', userId)
            .get();

        let stoppedCount = 0;
        for (const doc of watchesSnapshot.docs) {
            const watchData = doc.data() as WatchData;
            try {
                await calendar.channels.stop({
                    requestBody: {
                        id: watchData.channelId,
                        resourceId: watchData.resourceId,
                    },
                });
                await doc.ref.delete();
                stoppedCount++;
            } catch (error) {
                console.error(`Failed to stop watch ${watchData.channelId}:`, error);
            }
        }

        // Delete all event mappings for this user's calendars
        const mappingsSnapshot = await firestore
            .collection(CONFIG.FIRESTORE_COLLECTIONS.EVENT_MAPPINGS)
            .get();

        const batch = firestore.batch();
        let deletedMappings = 0;

        for (const doc of mappingsSnapshot.docs) {
            const mapping = doc.data();
            // Check if mapping belongs to this user by checking if sourceCalendarId contains userId
            if (mapping.sourceCalendarId?.includes(userId.split('@')[0])) {
                batch.delete(doc.ref);
                deletedMappings++;
            }
        }
        await batch.commit();

        res.json({
            success: true,
            message: `Cleared data for user ${userId}: deleted ${stoppedCount} watch(es) and ${deletedMappings} event mapping(s). OAuth tokens preserved.`
        });
    } catch (error) {
        console.error('Error clearing user data:', error);
        res.status(500).json({ error: 'Failed to clear user data' });
    }
}

/**
 * Restart syncing - stops all watches and creates new ones
 */
export async function restartSync(req: Request, res: Response): Promise<void> {
    try {
        const { userId, sourceCalendarIds, targetCalendarId, webhookUrl } = req.body;

        if (!userId || !sourceCalendarIds || !targetCalendarId || !webhookUrl) {
            res.status(400).json({
                error: 'userId, sourceCalendarIds, targetCalendarId, and webhookUrl are required'
            });
            return;
        }

        const auth = await getAuthClient(userId);
        const calendar = google.calendar({ version: 'v3', auth });

        // Stop existing watches
        const watchesSnapshot = await firestore
            .collection(CONFIG.FIRESTORE_COLLECTIONS.WATCHES)
            .where('userId', '==', userId)
            .get();

        for (const doc of watchesSnapshot.docs) {
            const watchData = doc.data() as WatchData;
            try {
                await calendar.channels.stop({
                    requestBody: {
                        id: watchData.channelId,
                        resourceId: watchData.resourceId,
                    },
                });
                await doc.ref.delete();
            } catch (error) {
                console.error(`Failed to stop watch ${watchData.channelId}:`, error);
            }
        }

        // Create new watches
        let createdCount = 0;
        for (const calendarId of sourceCalendarIds) {
            try {
                await createCalendarWatch(userId, calendarId, webhookUrl, targetCalendarId);
                createdCount++;
            } catch (error) {
                console.error(`Failed to create watch for ${calendarId}:`, error);
            }
        }

        res.json({
            success: true,
            message: `Restarted sync: stopped ${watchesSnapshot.size} watch(es), created ${createdCount} new watch(es)`
        });
    } catch (error) {
        console.error('Error restarting sync:', error);
        res.status(500).json({ error: 'Failed to restart sync' });
    }
}
