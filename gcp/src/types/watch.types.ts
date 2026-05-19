/**
 * Watch channel type definitions
 */

import { Timestamp } from '../db';

/**
 * Watch channel data stored in Firestore
 */
export interface WatchData {
  channelId: string;
  resourceId: string;
  userId: string;
  calendarId: string;
  calendarName?: string; // Cached calendar name to avoid API calls
  targetCalendarId: string;
  targetCalendarName?: string; // Cached target calendar name
  expiration: number; // Unix timestamp in milliseconds
  createdAt: Timestamp;
  paused?: boolean;
  syncToken?: string | null;
  syncTokenUpdatedAt?: number;
  syncState?: SyncState;
  stats?: WatchStats;

  // Scheduler-driven incremental sync
  pendingChanges?: boolean; // Flag: calendar has changes to sync
  lastChangeNotification?: number; // When webhook last notified us
  lastSyncedAt?: number; // When scheduler last processed changes
}

/**
 * Statistics for a watch channel
 */
export interface WatchStats {
  totalEventsSynced: number;
  lastSyncTime?: number;
  lastSyncEventCount?: number;
  lastError?: string;
  lastErrorTime?: number;
}

/**
 * Sync state for tracking batch sync progress
 */
export interface SyncState {
  status: 'pending' | 'syncing' | 'completed' | 'failed';
  startedAt?: number;
  completedAt?: number;
  totalEvents?: number;
  processedEvents?: number;
  failedEvents?: number;
  error?: string;
}

/**
 * Watch channel creation response
 */
export interface WatchChannelResponse {
  channelId: string;
  resourceId: string;
  expiration: string;
}
