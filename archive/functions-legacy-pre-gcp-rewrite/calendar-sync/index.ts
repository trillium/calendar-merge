/**
 * Consolidated Express App - Single Cloud Function with multiple routes
 *
 * Routes:
 * - POST /webhook - Google Calendar webhook notifications (public)
 * - POST /batch-sync - Batch sync handler (authenticated)
 * - POST /renew-watches - Renew watch subscriptions (public)
 * - POST /api/sync/pause - Pause sync (public)
 * - POST /api/sync/resume - Resume sync (public)
 * - POST /api/sync/stop - Stop sync (public)
 * - POST /api/sync/restart - Restart sync (public)
 * - DELETE /api/user/clear - Clear user data (public)
 * - GET /health - Health check (public)
 */
export { app as calendarSync } from './app';
