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
