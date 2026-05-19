/**
 * Google Calendar Batch API Service
 * Uses @jrmdayn/googleapis-batcher for true batch request support
 */

import { calendar_v3, google } from 'googleapis';
import { Timestamp } from '../db';
import { batchFetchImplementation } from '@jrmdayn/googleapis-batcher';
import { db } from '../db';
import { getAuthClient } from './google-auth.service';
import { BatchOperationResult, BatchSyncResult, EventMapping } from '../types';
import { logger, generateCompositeKey, sleep } from '../utils';
import { APP_CONFIG } from '../config';

const log = logger;

/**
 * Get a batch-enabled calendar client
 */
function getBatchCalendarClient(oauth2Client: any): calendar_v3.Calendar {
  const fetchImpl = batchFetchImplementation({
    maxBatchSize: APP_CONFIG.BATCH_API_SIZE, // 50 for Calendar API
    batchWindowMs: 0, // Batch all requests made in same tick
  });

  return google.calendar({
    version: 'v3',
    auth: oauth2Client,
    fetchImplementation: fetchImpl,
  });
}

/**
 * Batch create events in target calendar
 * Uses googleapis-batcher to bundle up to 50 create operations per HTTP request
 */
export async function batchCreateEvents(
  userId: string,
  calendarId: string,
  events: Array<{ sourceEventId: string; sourceCalendarId: string; eventData: calendar_v3.Schema$Event }>
): Promise<BatchSyncResult> {
  log.info(`Batch creating ${events.length} events`, { userId, calendarId });

  const oauth2Client = await getAuthClient(userId);
  const calendar = getBatchCalendarClient(oauth2Client);

  const results: BatchOperationResult[] = [];
  let successful = 0;
  let failed = 0;

  // Process in batches of 50 (Google Calendar API limit)
  const batchSize = APP_CONFIG.BATCH_API_SIZE;

  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);

    log.info(`Processing create batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(events.length / batchSize)}`, {
      batchSize: batch.length,
    });

    try {
      // googleapis-batcher automatically batches these into a single HTTP request
      const batchResults = await Promise.all(
        batch.map(async event => {
          try {
            const response = await calendar.events.insert({
              calendarId,
              requestBody: event.eventData,
            });

            // Create event mapping
            const mappingId = generateCompositeKey(event.sourceCalendarId, event.sourceEventId);
            const mapping: EventMapping = {
              sourceCalendarId: event.sourceCalendarId,
              sourceEventId: event.sourceEventId,
              targetEventId: response.data.id!,
              lastSynced: Timestamp.now(),
            };

            await db.setDoc('eventMappings', mappingId, mapping);

            log.debug(`Event created ${response.data.id}`, {
              sourceEventId: event.sourceEventId,
              targetEventId: response.data.id,
            });

            return {
              sourceEventId: event.sourceEventId,
              sourceCalendarId: event.sourceCalendarId,
              success: true,
              targetEventId: response.data.id!,
              statusCode: response.status,
            };
          } catch (error: any) {
            log.warn(`Failed to create event ${event.sourceEventId}`, {
              error: error.message,
              statusCode: error.code,
            });

            return {
              sourceEventId: event.sourceEventId,
              sourceCalendarId: event.sourceCalendarId,
              success: false,
              statusCode: error.code,
              error: error.message || 'Unknown error',
            };
          }
        })
      );

      // Aggregate results
      for (const result of batchResults) {
        results.push(result);
        if (result.success) {
          successful++;
        } else {
          failed++;
        }
      }

      // Rate limiting: delay between batches to avoid hitting API limits
      if (i + batchSize < events.length) {
        log.debug(`Waiting ${APP_CONFIG.BATCH_DELAY_MS}ms before next batch to avoid rate limits`);
        await sleep(APP_CONFIG.BATCH_DELAY_MS);
      }
    } catch (error) {
      log.error(`Batch create failed for batch starting at index ${i}`, error);

      // Mark all events in this batch as failed
      for (const event of batch) {
        results.push({
          sourceEventId: event.sourceEventId,
          sourceCalendarId: event.sourceCalendarId,
          success: false,
          error: error instanceof Error ? error.message : 'Batch request failed',
        });
        failed++;
      }
    }
  }

  log.info(`Batch create complete: ${successful} successful, ${failed} failed`);

  return {
    successful,
    failed,
    results,
  };
}

/**
 * Batch update events in target calendar
 */
export async function batchUpdateEvents(
  userId: string,
  calendarId: string,
  updates: Array<{
    sourceEventId: string;
    sourceCalendarId: string;
    targetEventId: string;
    eventData: calendar_v3.Schema$Event;
  }>
): Promise<BatchSyncResult> {
  log.info(`Batch updating ${updates.length} events`, { userId, calendarId });

  const oauth2Client = await getAuthClient(userId);
  const calendar = getBatchCalendarClient(oauth2Client);

  const results: BatchOperationResult[] = [];
  let successful = 0;
  let failed = 0;

  // Process in batches of 50
  const batchSize = APP_CONFIG.BATCH_API_SIZE;

  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);

    log.info(`Processing update batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(updates.length / batchSize)}`, {
      batchSize: batch.length,
    });

    try {
      // googleapis-batcher automatically batches these into a single HTTP request
      const batchResults = await Promise.all(
        batch.map(async update => {
          try {
            const response = await calendar.events.patch({
              calendarId,
              eventId: update.targetEventId,
              requestBody: update.eventData,
            });

            // Update mapping timestamp
            const mappingId = generateCompositeKey(update.sourceCalendarId, update.sourceEventId);
            await db.updateDoc('eventMappings', mappingId, {
              lastSynced: Timestamp.now(),
            });

            log.debug(`Event updated ${response.data.id}`, {
              sourceEventId: update.sourceEventId,
              targetEventId: update.targetEventId,
            });

            return {
              sourceEventId: update.sourceEventId,
              sourceCalendarId: update.sourceCalendarId,
              success: true,
              targetEventId: update.targetEventId,
              statusCode: response.status,
            };
          } catch (error: any) {
            log.warn(`Failed to update event ${update.sourceEventId}`, {
              error: error.message,
              statusCode: error.code,
            });

            return {
              sourceEventId: update.sourceEventId,
              sourceCalendarId: update.sourceCalendarId,
              success: false,
              targetEventId: update.targetEventId,
              statusCode: error.code,
              error: error.message || 'Unknown error',
            };
          }
        })
      );

      // Aggregate results
      for (const result of batchResults) {
        results.push(result);
        if (result.success) {
          successful++;
        } else {
          failed++;
        }
      }

      // Rate limiting: delay between batches
      if (i + batchSize < updates.length) {
        log.debug(`Waiting ${APP_CONFIG.BATCH_DELAY_MS}ms before next batch to avoid rate limits`);
        await sleep(APP_CONFIG.BATCH_DELAY_MS);
      }
    } catch (error) {
      log.error(`Batch update failed for batch starting at index ${i}`, error);

      // Mark all events in this batch as failed
      for (const update of batch) {
        results.push({
          sourceEventId: update.sourceEventId,
          sourceCalendarId: update.sourceCalendarId,
          success: false,
          targetEventId: update.targetEventId,
          error: error instanceof Error ? error.message : 'Batch request failed',
        });
        failed++;
      }
    }
  }

  log.info(`Batch update complete: ${successful} successful, ${failed} failed`);

  return {
    successful,
    failed,
    results,
  };
}
