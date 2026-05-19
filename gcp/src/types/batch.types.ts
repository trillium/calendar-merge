/**
 * Batch Sync Types
 * Type definitions for Cloud Tasks batch processing
 */

/**
 * Batch state stored in Firestore
 * Tracks progress of ongoing batch sync using pageToken pagination
 */
export interface BatchState {
  userId: string;
  batchNumber: number;
  operation: 'create' | 'update' | 'mixed';

  // Calendar info
  calendarId: string;
  targetCalendarId: string;

  // PageToken tracking for consistent pagination
  currentPageToken?: string; // Token for NEXT batch
  initialSyncToken?: string; // Save final syncToken when done

  // Progress tracking
  processedEvents: number;
  failedEvents: number;
  totalEventsEstimate?: number; // Estimate, may change during sync

  // Status
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  error?: string;
}

/**
 * Batch task payload
 * Data sent to Cloud Tasks for batch continuation
 */
export interface BatchTaskPayload {
  userId: string;
  batchStateId: string; // Reference to Firestore batchState doc
  batchNumber: number;
}

/**
 * Retry task payload
 * Data sent to Cloud Tasks for retrying failed events
 */
export interface RetryTaskPayload {
  userId: string;
  eventIds: string[];
  attempt: number;
  calendarId?: string;
  targetCalendarId?: string;
}

/**
 * Batch operation result
 * Result of processing a single batch
 */
export interface BatchOperationResult {
  sourceEventId: string;
  sourceCalendarId: string;
  success: boolean;
  targetEventId?: string;
  statusCode?: number;
  error?: string;
}

/**
 * Batch sync result
 * Overall result after processing a batch
 */
export interface BatchSyncResult {
  successful: number;
  failed: number;
  rateLimited?: number;
  results: BatchOperationResult[];
}

/**
 * Batch progress info
 * Real-time progress information for UI
 */
export interface BatchProgress {
  userId: string;
  currentBatch: number;
  totalBatches: number;
  eventsProcessed: number;
  totalEvents: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  startedAt?: Date;
  completedAt?: Date;
  estimatedTimeRemaining?: number; // in seconds
}

/**
 * Cloud Tasks configuration
 */
export interface CloudTasksConfig {
  projectId: string;
  location: string;
  queueName: string;
  targetUrl: string;
  serviceAccountEmail: string;
}
