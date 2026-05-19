/**
 * Shared types for the backend service layer.
 */

export interface Calendar {
  id: string;
  summary: string;
  primary?: boolean;
  [key: string]: unknown;
}

export interface AuthStartResult {
  authUrl: string;
  state?: string;
}

export interface WatchCreateParams {
  userId: string;
  calendarId: string;
  targetCalendarId: string;
}

export interface SyncTriggerParams {
  userId?: string;
  channelId?: string;
}

export interface SyncRestartParams {
  userId: string;
  sourceCalendarIds: string[];
  targetCalendarId: string;
  webhookUrl: string;
}

export interface SetupSyncParams {
  selectedSources: string[];
  targetCalendarId: string;
}

export interface Watch {
  channelId: string;
  calendarId: string;
  calendarName: string;
  expiration: number;
  paused: boolean;
  targetCalendarId: string;
  targetCalendarName: string;
  syncToken?: string;
  syncTokenUpdatedAt?: number;
  stats: {
    totalEventsSynced: number;
    lastSyncTime: number | null;
    lastSyncEventCount: number | null;
  };
  syncState?: {
    status: 'pending' | 'syncing' | 'complete' | 'failed';
    eventsSynced: number;
    totalEvents?: number;
  };
}

export interface SyncProgress {
  overallStatus: 'pending' | 'syncing' | 'complete' | 'failed';
  totalEvents: number;
  syncedEvents: number;
}

export interface SyncStatusResult {
  watches: Watch[];
  syncProgress: SyncProgress | null;
}
