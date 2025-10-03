import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
    console.log(`\n🚀 Dev server running on http://localhost:${PORT}`);
    console.log(`\nEndpoints:`);
    console.log(`  POST /              - handleWebhook`);
    console.log(`  POST /renewWatches  - renewWatches`);
    console.log(`  GET  /oauth/start   - OAuth start`);
    console.log(`  POST /oauth/callback - OAuth callback`);
    console.log(`  POST /setup         - Setup sync`);
    console.log(`\n`);
});
