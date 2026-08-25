/**
 * Scheduler routes
 * Routes called by Cloud Scheduler for automated tasks
 */

import { Router } from 'express';
import { runIncrementalSync, runWatchRenewal } from '../controllers/scheduler.controller';

const router = Router();

// POST /scheduler/incremental (every 15 min)
// Processes calendars with pending changes
router.post('/incremental', runIncrementalSync);

// POST /scheduler/renew-watches (daily 2am)
// Renews expiring watch channels
router.post('/renew-watches', runWatchRenewal);

export default router;
