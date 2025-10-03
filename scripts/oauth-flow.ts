import { google } from 'googleapis';
import * as http from 'http';
import { URL } from 'url';
import * as fs from 'fs';
import open from 'open';
import process from 'process';
import type { IncomingMessage, ServerResponse } from 'http';

const SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
];

async function getToken(): Promise<void> {
    const credentials = JSON.parse(fs.readFileSync('credentials.json', 'utf-8'));
    const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;

    const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });

    console.log('🌐 Opening authorization URL in browser...\n');

    await open(authUrl);

    const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
        if (req.url && req.url.indexOf('/oauth2callback') > -1) {
            const qs = new URL(req.url, 'http://localhost:8080').searchParams;
            const code = qs.get('code');

            res.end('Authentication successful! You can close this window.');
            server.close();

            if (code) {
                const { tokens } = await oauth2Client.getToken(code);
                fs.writeFileSync('token.json', JSON.stringify(tokens, null, 2));
                console.log('\n✅ Token saved to token.json');
            }
            process.exit(0);
        }
    }).listen(8080, () => {
        console.log('Waiting for authorization...');
    });
}

getToken().catch(console.error);
