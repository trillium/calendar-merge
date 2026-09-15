/**
 * Batch Controller
 * Handles Cloud Tasks callbacks for batch sync operations
 * These endpoints are called by Cloud Tasks, not directly by users
 */

import { Request, Response } from 'express';
import { logger } from '../utils';

/**
 * Continue batch processing (Cloud Tasks callback)
 * Called by Cloud Tasks to process the next batch of events
 * @route POST /batch/continue
 * @param req.body.userId - User ID
 * @param req.body.batchStateId - Reference to Firestore batchState doc
 * @param req.body.batchNumber - Which batch to process
 */
export async function continueBatch(req: Request, res: Response): Promise<void> {
  try {
    const { batchStateId, batchNumber } = req.body;

    if (!batchStateId || !batchNumber) {
      res.status(400).json({ error: 'Missing batchStateId or batchNumber' });
      return;
    }

    // Load batch state from Firestore
    const { db } = await import('../db');
    const state = await db.getDoc<any>('batchStates', batchStateId);

    if (!state) {
      logger.error(`Batch state not found: ${batchStateId}`);
      res.status(404).json({ error: 'Batch state not found' });
      return;
    }

    if (state.status === 'completed') {
      logger.info(`Batch already completed: ${batchStateId}`);
      res.status(200).json({ message: 'Batch already completed' });
      return;
    }

    // Mark as processing
    await db.updateDoc('batchStates', batchStateId, {
      status: 'processing',
      batchNumber,
      updatedAt: Date.now(),
    });

    logger.info(`Processing batch ${batchNumber} for state ${batchStateId}`);

    // Process next page using saved pageToken
    const { syncEventsBatchPaginated } = await import('../services/batch-sync.service');
    const result = await syncEventsBatchPaginated(
      state.userId,
      state.calendarId,
      state.targetCalendarId,
      state.currentPageToken // Continue from where we left off
    );

    // Update state with new progress
    await db.updateDoc('batchStates', batchStateId, {
      processedEvents: state.processedEvents + result.processedCount,
      currentPageToken: result.nextPageToken, // Save for next batch
      initialSyncToken: result.finalSyncToken || state.initialSyncToken,
      updatedAt: Date.now(),
    });

    // If there's more pages, schedule next batch
    if (result.nextPageToken) {
      const { createBatchTask } = await import('../services/cloud-tasks.service');
      await createBatchTask({
        userId: state.userId,
        batchStateId,
        batchNumber: batchNumber + 1,
        scheduleTime: Date.now() + parseInt(process.env.BATCH_DELAY_MS || '10000'),
      });

      logger.info(`Scheduled batch ${batchNumber + 1} for state ${batchStateId}`);

      res.status(200).json({
        message: 'Batch processed, next batch scheduled',
        batchNumber,
        nextBatch: batchNumber + 1,
        processedThisBatch: result.processedCount,
        totalProcessed: state.processedEvents + result.processedCount,
      });
    } else {
      // No more pages - sync complete!
      await db.updateDoc('batchStates', batchStateId, {
        status: 'completed',
        updatedAt: Date.now(),
      });

      // Update watch channel with completion status and stats
      const watches = await db.query<any>(
        'watches',
        'userId',
        '==',
        state.userId
      );

      const watch = watches.find((w: any) => w.calendarId === state.calendarId);

      if (watch) {
        const totalProcessed = state.processedEvents + result.processedCount;
        const currentTotal = watch.stats?.totalEventsSynced || 0;
        const updateFields: Record<string, unknown> = {
          'syncState.status': 'completed',
          'syncState.completedAt': Date.now(),
          'syncState.processedEvents': totalProcessed,
          'stats.totalEventsSynced': currentTotal + totalProcessed,
          'stats.lastSyncTime': Date.now(),
          'stats.lastSyncEventCount': totalProcessed,
        };

        if (result.finalSyncToken) {
          updateFields.syncToken = result.finalSyncToken;
          updateFields.syncTokenUpdatedAt = Date.now();
        }

        await db.updateDoc('watches', watch.channelId, updateFields);
      }

      logger.info(
        `Batch sync completed: ${batchStateId}, total events: ${
          state.processedEvents + result.processedCount
        }`
      );

      res.status(200).json({
        message: 'Batch sync completed',
        batchNumber,
        totalProcessed: state.processedEvents + result.processedCount,
        finalSyncToken: result.finalSyncToken,
      });
    }
  } catch (error) {
    logger.error('Error in continueBatch:', error);

    // Mark batch as failed
    if (req.body.batchStateId) {
      const { db } = await import('../db');
      await db.updateDoc('batchStates', req.body.batchStateId, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        updatedAt: Date.now(),
      });
    }

    res.status(500).json({
      error: 'Batch processing failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Retry failed events (Cloud Tasks callback)
 * Called by Cloud Tasks to retry events that failed in previous batches
 * @route POST /batch/retry
 * @param req.body.userId - User ID
 * @param req.body.eventIds - Array of event IDs to retry
 * @param req.body.attempt - Retry attempt number
 */
export async function retryFailedEvents(_req: Request, res: Response): Promise<void> {
  // TODO: Implementation
  res.status(501).json({ error: 'Not implemented: batch retry' });
}

/**
 * Get batch sync status
 * Query current progress of batch sync for a user
 * @route GET /batch/status
 * @param req.query.userId - User ID
 */
export async function getBatchStatus(_req: Request, res: Response): Promise<void> {
  // TODO: Implementation
  res.status(501).json({ error: 'Not implemented: batch status' });
}

/**
 * Cancel batch sync
 * Stop ongoing batch sync and clean up pending tasks
 * @route POST /batch/cancel
 * @param req.body.userId - User ID
 */
export async function cancelBatchSync(_req: Request, res: Response): Promise<void> {
  // TODO: Implementation
  res.status(501).json({ error: 'Not implemented: batch cancel' });
}

/**
 * Test endpoint for Cloud Tasks
 * Simple endpoint to verify Cloud Tasks can reach the service
 * Logs the message and returns success
 * @route POST /test/batch
 * @param req.body.message - Message to log (sent from Cloud Tasks)
 */
export async function testBatch(req: Request, res: Response): Promise<void> {
  const { message } = req.body;

  // Log success with just the message
  logger.info(`Cloud Tasks test successful: ${message}`);

  // Return success response
  res.status(200).json({
    success: true,
    received: message,
    timestamp: new Date().toISOString(),
    source: 'Cloud Tasks',
  });
}
