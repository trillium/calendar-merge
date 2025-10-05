import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
// @ts-ignore - compiled from index.ts
import * as handlers from './index.js';

// Load environment variables from .env.local
dotenv.config({ path: '../../.env.local' });

const app = express();

app.use(cors());
app.use(express.json());

// Mount all endpoints
app.post('/', (req: Request, res: Response) => handlers.handleWebhook(req, res));
app.post('/renewWatches', (req: Request, res: Response) => handlers.renewWatches(req, res));
app.get('/oauth/start', (req: Request, res: Response) => handlers.oauthStart(req, res));
app.post('/oauth/callback', (req: Request, res: Response) => handlers.oauthCallback(req, res));
app.post('/setup', (req: Request, res: Response) => handlers.setup(req, res));
app.post('/pause', (req: Request, res: Response) => handlers.pauseSync(req, res));
app.post('/resume', (req: Request, res: Response) => handlers.resumeSync(req, res));
app.post('/stop', (req: Request, res: Response) => handlers.stopSync(req, res));
app.post('/clear', (req: Request, res: Response) => handlers.clearUserData(req, res));
app.post('/restart', (req: Request, res: Response) => handlers.restartSync(req, res));

const PORT = process.env.PORT || 3000;
const BUILD_TIME = new Date().toISOString();

app.listen(PORT, () => {
    console.log(`\n🚀 Dev server running on http://localhost:${PORT}`);
    console.log(`📦 Build time: ${BUILD_TIME}`);
    console.log(`\nEndpoints:`);
    console.log(`  POST /              - handleWebhook`);
    console.log(`  POST /renewWatches  - renewWatches`);
    console.log(`  GET  /oauth/start   - OAuth start`);
    console.log(`  POST /oauth/callback - OAuth callback`);
    console.log(`  POST /setup         - Setup sync`);
    console.log(`\nControl:`);
    console.log(`  POST /pause         - Pause syncing (keep watches)`);
    console.log(`  POST /resume        - Resume syncing`);
    console.log(`  POST /stop          - Stop syncing (delete watches)`);
    console.log(`  POST /clear         - Clear user data (watches + mappings, keep auth)`);
    console.log(`  POST /restart       - Restart syncing (recreate watches)`);
    console.log(`\n`);
});
