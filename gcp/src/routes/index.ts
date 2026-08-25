/**
 * Routes index
 * Combines all route modules
 */

import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import webhookRoutes from './webhook.routes';
import syncRoutes from './sync.routes';
import calendarRoutes from './calendar.routes';
import authRoutes from './auth.routes';
import healthRoutes from './health.routes';
import schedulerRoutes from './scheduler.routes';
import { createBatchRoutes, createTestRoutes } from './batch.routes';

const router: ExpressRouter = Router();

// Mount route modules
router.use('/', healthRoutes);
router.use('/', webhookRoutes);
router.use('/', syncRoutes);
router.use('/', calendarRoutes);
router.use('/', authRoutes);
router.use('/scheduler', schedulerRoutes);
router.use('/batch', createBatchRoutes());
router.use('/test', createTestRoutes());

export default router;
