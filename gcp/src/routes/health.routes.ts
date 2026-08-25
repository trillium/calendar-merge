/**
 * Health check / status routes
 */

import { Router } from 'express';
import type { Router as ExpressRouter, Request, Response } from 'express';
import { getApiHealth } from '../services/api-health.service';

const router: ExpressRouter = Router();

/**
 * GET /health
 * Basic health check endpoint
 */
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'calendar-sync',
  });
});

/**
 * GET /
 * Root endpoint
 */
router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    service: 'Calendar Sync Service',
    version: '1.0.0',
    status: 'running',
  });
});

/**
 * GET /api/health
 * API rate limit health / temperature
 */
router.get('/api/health', async (_req: Request, res: Response) => {
  try {
    const health = await getApiHealth();
    res.status(200).json(health);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get API health' });
  }
});

export default router;
