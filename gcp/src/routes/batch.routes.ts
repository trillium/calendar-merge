/**
 * Batch Routes
 * Routes for Cloud Tasks batch processing callbacks
 */

import { Router } from 'express';
import {
  continueBatch,
  retryFailedEvents,
  getBatchStatus,
  cancelBatchSync,
  testBatch,
} from '../controllers/batch.controller';

/**
 * Create batch routes
 * Defines all batch-related endpoints
 * @returns Express Router
 */
export function createBatchRoutes(): Router {
  const router = Router();

  // Cloud Tasks callbacks (production endpoints)
  router.post('/continue', continueBatch);
  router.post('/retry', retryFailedEvents);

  // User-facing endpoints
  router.get('/status', getBatchStatus);
  router.post('/cancel', cancelBatchSync);

  return router;
}

/**
 * Create test routes
 * Testing/debugging endpoints
 * @returns Express Router
 */
export function createTestRoutes(): Router {
  const router = Router();

  // Simple test endpoint to verify Cloud Tasks connectivity
  router.post('/batch', testBatch);

  return router;
}
