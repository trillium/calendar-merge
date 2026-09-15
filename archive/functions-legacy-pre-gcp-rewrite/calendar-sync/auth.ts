import { Firestore } from '@google-cloud/firestore';
import { google } from 'googleapis';

const firestore = new Firestore();

/**
 * Retrieves OAuth tokens for a specific user from Firestore
 */
export async function getAuthClient(userId: string) {
    try {
        const userDoc = await firestore.collection('users').doc(userId).get();

        if (!userDoc.exists) {
            throw new Error(`User ${userId} not found`);
        }

        const userData = userDoc.data();
        if (!userData?.tokens) {
            throw new Error(`No tokens found for user ${userId}`);
        }

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
        );

        oauth2Client.setCredentials(userData.tokens);

        return oauth2Client;
    } catch (error) {
        console.error('Error retrieving OAuth tokens:', error);
        throw error;
    }
}

/**
 * Gets user ID from channel ID
 */
export async function getUserIdFromChannelId(channelId: string): Promise<string | null> {
    try {
        const watchDoc = await firestore.collection('watches').doc(channelId).get();

        if (!watchDoc.exists) {
            return null;
        }

        const watchData = watchDoc.data();
        return watchData?.userId || null;
    } catch (error) {
        console.error('Error getting user ID from channel:', error);
        return null;
    }
}
