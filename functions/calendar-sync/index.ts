import { Request, Response } from 'express';
import { Firestore } from '@google-cloud/firestore';
import { syncCalendarEvents } from './sync';
import { renewCalendarWatch } from './watch';
import { oauthStart, oauthCallback, setup } from './oauth';
import { CONFIG } from './config';

const firestore = new Firestore();

/**
 * HTTP Cloud Function - Calendar Webhook Handler
 */
export const handleWebhook = async (req: Request, res: Response): Promise<void> => {
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
};

/**
 * HTTP Cloud Function - Renew Watch Subscriptions
 */
export const renewWatches = async (req: Request, res: Response): Promise<void> => {
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
};

/**
 * HTTP Cloud Function - Main API Gateway (OAuth + Control endpoints)
 */
export { api } from './api';
