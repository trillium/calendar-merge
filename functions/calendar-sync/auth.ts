import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { google } from 'googleapis';
import { CONFIG } from './config';

const secretManager = new SecretManagerServiceClient();

/**
 * Retrieves OAuth tokens from Secret Manager and creates an authenticated OAuth2 client
 */
export async function getAuthClient() {
    const secretName = `projects/${CONFIG.PROJECT_ID}/secrets/${CONFIG.OAUTH_SECRET_NAME}/versions/latest`;

    try {
        const [version] = await secretManager.accessSecretVersion({ name: secretName });
        const tokenData = version.payload?.data?.toString();

        if (!tokenData) {
            throw new Error('No token data found in secret');
        }

        const tokens = JSON.parse(tokenData);

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
        );

        oauth2Client.setCredentials(tokens);

        return oauth2Client;
    } catch (error) {
        console.error('Error retrieving OAuth tokens:', error);
        throw error;
    }
}
