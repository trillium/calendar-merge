import { Timestamp } from '@google-cloud/firestore';

export interface WatchData {
    userId: string;
    calendarId: string;
    channelId: string;
    resourceId: string;
    expiration: number;
    targetCalendarId?: string;
    paused?: boolean;
    syncToken?: string;
    stats?: {
        totalEventsSynced: number;
        lastSyncTime?: number;
        lastSyncEventCount?: number;
    };
    syncState?: {
        status: 'pending' | 'syncing' | 'complete' | 'failed';
        pageToken?: string;
        eventsSynced: number;
        totalEvents?: number;
        lastBatchTime?: number;
        timeMax?: string;
        // Retry tracking (Phase 3)
        failedEvents?: string[];
        retryCount?: number;
        lastError?: string;
        lastErrorAt?: Timestamp;
    };
}

export interface EventMapping {
    sourceCalendarId: string;
    sourceEventId: string;
    targetEventId: string;
    lastSynced: Timestamp;
}

export interface CalendarConfig {
    sourceCalendarIds: string[];
    targetCalendarId: string;
    webhookUrl: string;
}

export interface SyncCoordination {
    currentIndex: number;
    channelIds: string[];
    status: 'running' | 'complete' | 'failed';
    createdAt: Timestamp;
    lastIterationAt: Timestamp;
    iterationCount: number;
}
