/**
 * Sync-related type definitions
 */

/**
 * Result of syncing a single event
 */
export interface SyncEventResult {
  success: boolean;
  eventId?: string;
  error?: string;
}

/**
 * Options for batch sync
 */
export interface BatchSyncOptions {
  userId: string;
  maxEvents?: number;
  continueOnError?: boolean;
}

/**
 * Batch sync progress
 */
export interface BatchSyncProgress {
  totalCalendars: number;
  processedCalendars: number;
  currentCalendar?: string;
  totalEvents: number;
  syncedEvents: number;
  failedEvents: number;
  errors: Array<{
    calendarId: string;
    eventId?: string;
    error: string;
    timestamp: number;
  }>;
}

/**
 * Round-robin sync status
 */
export interface RoundRobinStatus {
  userId: string;
  currentIndex: number;
  calendarsProcessed: number;
  eventsProcessed: number;
  hasMore: boolean;
}

/**
 * Event transformation options
 */
export interface EventTransformOptions {
  sourceCalendarId: string;
  includeDescription?: boolean;
  markPrivate?: boolean;
  customPrefix?: string;
}

/**
 * Special event handling configuration
 */
export interface EventHandlingConfig {
  domain?: string;
  marker?: string;
  condition?: (event: any) => boolean;
}

/**
 * Batch API operation types
 */
export interface BatchOperation {
  method: 'POST' | 'PATCH' | 'DELETE';
  eventId?: string; // For updates/deletes
  eventData?: any; // For creates/updates
  sourceEventId: string; // To track back to source
  sourceCalendarId: string;
}

/**
 * Result of a single batch operation
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
 * Result of batch sync
 */
export interface BatchSyncResult {
  successful: number;
  failed: number;
  results: BatchOperationResult[];
}
