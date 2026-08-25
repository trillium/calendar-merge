import dotenv from 'dotenv';
// @ts-ignore - compiled from index.ts
import { calendarSync } from './index.js';

// Load environment variables from .env.local
dotenv.config({ path: '../../.env.local' });

const PORT = process.env.PORT || 3000;
const BUILD_TIME = new Date().toISOString();

calendarSync.listen(PORT, () => {
    console.log(`\n🚀 Dev server running on http://localhost:${PORT}`);
    console.log(`📦 Build time: ${BUILD_TIME}`);
    console.log(`\nEndpoints:`);
    console.log(`  POST /webhook              - Google Calendar webhook notifications`);
    console.log(`  POST /batch-sync           - Batch sync handler (authenticated)`);
    console.log(`  POST /renew-watches        - Renew watch subscriptions`);
    console.log(`  POST /api/sync/pause       - Pause sync`);
    console.log(`  POST /api/sync/resume      - Resume sync`);
    console.log(`  POST /api/sync/stop        - Stop sync`);
    console.log(`  POST /api/sync/restart     - Restart sync`);
    console.log(`  DELETE /api/user/clear     - Clear user data`);
    console.log(`  GET /health                - Health check`);
    console.log(`\n`);
});
