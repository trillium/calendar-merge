/**
 * Calendar connection model
 * Represents a connection between a source calendar and target calendar
 */

export interface CalendarConnection {
  userId: string;
  sourceCalendarId: string;
  targetCalendarId: string;
  watchChannelId?: string;
  isActive: boolean;
  createdAt: number;
  lastSyncedAt?: number;
}

export class CalendarConnectionModel {
  constructor(public data: CalendarConnection) {}

  get sourceCalendarId(): string {
    return this.data.sourceCalendarId;
  }

  get targetCalendarId(): string {
    return this.data.targetCalendarId;
  }

  isActive(): boolean {
    return this.data.isActive;
  }

  hasWatchChannel(): boolean {
    return !!this.data.watchChannelId;
  }
}
