import { Timestamp } from '@google-cloud/firestore';

export interface WatchData {
    userId: string;
    calendarId: string;
    channelId: string;
    resourceId: string;
    expiration: number;
    targetCalendarId?: string;
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
