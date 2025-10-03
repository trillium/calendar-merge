import { Request, Response } from 'express';
import { google } from 'googleapis';
import { Firestore } from '@google-cloud/firestore';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { CONFIG } from './config';

const firestore = new Firestore();
const secretManager = new SecretManagerServiceClient();

/**
 * Cloud Function - Start OAuth Flow
 */
export const oauthStart = async (req: Request, res: Response): Promise<void> => {
    const redirectUri = req.query.redirect_uri as string;

    if (!redirectUri) {
        res.status(400).send('Missing redirect_uri parameter');
        return;
    }

    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
    );

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/calendar.events'
        ],
        prompt: 'consent'
    });

    res.redirect(authUrl);
};

/**
 * Cloud Function - OAuth Callback
 */
export const oauthCallback = async (req: Request, res: Response): Promise<void> => {
    try {
        const { code, redirect_uri } = req.body;

        if (!code || !redirect_uri) {
            res.status(400).json({ error: 'Missing code or redirect_uri' });
            return;
        }

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            redirect_uri
        );

        // Exchange code for tokens
        const { tokens } = await oauth2Client.getToken(code);

        // Generate user ID (you might want to use actual Google user ID)
        const userId = generateUserId(tokens);

        // Store tokens in Firestore
        await firestore
            .collection('users')
            .doc(userId)
            .set({
                tokens,
                createdAt: new Date(),
                updatedAt: new Date()
            });

        res.json({
            access_token: tokens.access_token,
            user_id: userId
        });
    } catch (error) {
        console.error('OAuth callback error:', error);
        res.status(500).json({ error: 'OAuth failed' });
    }
};

/**
 * Cloud Function - Setup Calendar Sync
 */
export const setup = async (req: Request, res: Response): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            res.status(401).json({ error: 'Missing authorization header' });
            return;
        }

        const accessToken = authHeader.replace('Bearer ', '');
        const { sourceCalendars, targetCalendar } = req.body;

        if (!sourceCalendars || !targetCalendar) {
            res.status(400).json({ error: 'Missing sourceCalendars or targetCalendar' });
            return;
        }

        // Find user by access token
        const userId = await findUserByToken(accessToken);
        if (!userId) {
            res.status(401).json({ error: 'Invalid access token' });
            return;
        }

        // Get user tokens
        const userDoc = await firestore.collection('users').doc(userId).get();
        const userData = userDoc.data();

        if (!userData) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        // Store configuration
        await firestore
            .collection('users')
            .doc(userId)
            .update({
                config: {
                    sourceCalendars,
                    targetCalendar,
                    updatedAt: new Date()
                }
            });

        // Create watch subscriptions
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials(userData.tokens);

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        const webhookUrl = process.env.WEBHOOK_URL || '';

        let watchesCreated = 0;

        for (const calendarId of sourceCalendars) {
            try {
                const channelId = `${userId}-${calendarId}-${Date.now()}`;
                const expiration = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days

                const response = await calendar.events.watch({
                    calendarId,
                    requestBody: {
                        id: channelId,
                        type: 'web_hook',
                        address: webhookUrl,
                        expiration: expiration.toString()
                    }
                });

                // Store watch data
                await firestore
                    .collection(CONFIG.FIRESTORE_COLLECTIONS.WATCHES)
                    .doc(channelId)
                    .set({
                        userId,
                        calendarId,
                        channelId,
                        resourceId: response.data.resourceId || '',
                        expiration,
                        targetCalendarId: targetCalendar,
                        createdAt: new Date()
                    });

                watchesCreated++;
            } catch (error) {
                console.error(`Failed to create watch for ${calendarId}:`, error);
            }
        }

        res.json({
            success: true,
            watchesCreated,
            message: `Sync configured for ${watchesCreated} calendars`
        });
    } catch (error) {
        console.error('Setup error:', error);
        res.status(500).json({ error: 'Setup failed' });
    }
};

function generateUserId(tokens: any): string {
    // Simple hash - in production use actual Google user ID
    return Buffer.from(tokens.access_token || '').toString('base64').substring(0, 16);
}

async function findUserByToken(accessToken: string): Promise<string | null> {
    const usersSnapshot = await firestore.collection('users').get();

    for (const doc of usersSnapshot.docs) {
        const data = doc.data();
        if (data.tokens?.access_token === accessToken) {
            return doc.id;
        }
    }

    return null;
}
