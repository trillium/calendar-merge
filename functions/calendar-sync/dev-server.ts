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

// All user-facing API endpoints go through the API gateway
app.use('/', (req: Request, res: Response) => handlers.api(req, res));

const PORT = process.env.PORT || 3000;
const BUILD_TIME = new Date().toISOString();

app.listen(PORT, () => {
    console.log(`\n🚀 Dev server running on http://localhost:${PORT}`);
    console.log(`📦 Build time: ${BUILD_TIME}`);
    console.log(`\nEndpoints:`);
    console.log(`  POST /              - handleWebhook`);
    console.log(`  POST /renewWatches  - renewWatches`);
    console.log(`\nAPI Gateway (all user endpoints):`);
    console.log(`  GET  /oauth/start   - OAuth start`);
    console.log(`  POST /oauth/callback - OAuth callback`);
    console.log(`  POST /setup         - Setup sync`);
    console.log(`  GET  /health        - Health check`);
    console.log(`\nControl endpoints:`);
    console.log(`  POST /sync/pause    - Pause syncing`);
    console.log(`  POST /sync/resume   - Resume syncing`);
    console.log(`  POST /sync/stop     - Stop syncing`);
    console.log(`  POST /sync/restart  - Restart syncing`);
    console.log(`  DELETE /user/clear  - Clear user data`);
    console.log(`\n`);
});
