import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Firestore } from '@google-cloud/firestore';
import { syncCalendarEvents } from './sync';
import { renewCalendarWatch } from './watch';
import { batchSyncEvents, batchSyncRoundRobin } from './batchSync';
import { pauseSync, resumeSync, stopSync, restartSync, clearUserData } from './control';
import { CONFIG } from './config';

const firestore = new Firestore();
const app = express();

// Middleware
app.use(express.json());
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

/**
 * Authentication middleware for protected routes
 * Verifies that the request has a valid Authorization header
 */
async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header' });
        return;
    }

    // For Cloud Functions, the Bearer token should be a valid Google ID token
    // The Cloud Run service automatically validates it when invoked
    // If we reach this point with an auth header, the request came from an authenticated source
    next();
}

/**
 * Webhook handler - receives Google Calendar notifications
 */
app.post('/webhook', async (req: Request, res: Response): Promise<void> => {
    try {
        const channelId = req.headers['x-goog-channel-id'] as string;
        const resourceState = req.headers['x-goog-resource-state'] as string;

        console.log(`Webhook received: ${resourceState} for channel ${channelId}`);

        if (resourceState === 'sync') {
            res.status(200).send('Sync acknowledged');
            return;
        }

        if (resourceState === 'exists') {
            await syncCalendarEvents(channelId);
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('Error handling webhook:', error);
        res.status(500).send('Error processing webhook');
    }
});

/**
 * Batch sync handler - processes calendars in round-robin order
 * PROTECTED ROUTE - requires authentication
 */
app.post('/batch-sync', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId, channelId } = req.body;

        // Support both new (userId) and old (channelId) API for backward compatibility
        if (userId) {
            console.log(`Round-robin batch sync triggered for user ${userId}`);
            await batchSyncRoundRobin(userId);
            res.status(200).json({ success: true, userId });
        } else if (channelId) {
            console.log(`Legacy batch sync triggered for channel ${channelId}`);
            await batchSyncEvents(channelId);
            res.status(200).json({ success: true, channelId });
        } else {
            res.status(400).json({ error: 'userId or channelId is required' });
            return;
        }
    } catch (error) {
        console.error('Error in batch sync handler:', error);
        res.status(500).json({ error: 'Error processing batch sync' });
    }
});

/**
 * Renew watch subscriptions
 */
app.post('/renew-watches', async (req: Request, res: Response): Promise<void> => {
    try {
        const watchesSnapshot = await firestore
            .collection(CONFIG.FIRESTORE_COLLECTIONS.WATCHES)
            .get();

        for (const doc of watchesSnapshot.docs) {
            const watch = doc.data();
            await renewCalendarWatch(watch.calendarId, doc.id);
        }

        res.status(200).json({ renewed: watchesSnapshot.size });
    } catch (error) {
        console.error('Error renewing watches:', error);
        res.status(500).send('Error renewing watches');
    }
});

/**
 * Control API routes
 */
app.post('/api/sync/pause', async (req: Request, res: Response) => {
    await pauseSync(req, res);
});

app.post('/api/sync/resume', async (req: Request, res: Response) => {
    await resumeSync(req, res);
});

app.post('/api/sync/stop', async (req: Request, res: Response) => {
    await stopSync(req, res);
});

app.post('/api/sync/restart', async (req: Request, res: Response) => {
    await restartSync(req, res);
});

app.delete('/api/user/clear', async (req: Request, res: Response) => {
    await clearUserData(req, res);
});

/**
 * Health check
 */
app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
    res.status(404).json({
        error: 'Not Found',
        path: req.path,
        method: req.method,
        message: 'API endpoint not found'
    });
});

export { app };
