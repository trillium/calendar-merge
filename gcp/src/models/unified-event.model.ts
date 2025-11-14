/**
 * Unified event model
 * Represents a merged view of calendar events
 */

import { CalendarEvent } from '../types';

export interface UnifiedEvent {
  id: string;
  sourceCalendarId: string;
  sourceEvent: CalendarEvent;
  summary: string;
  description?: string;
  start: string | Date;
  end: string | Date;
  location?: string;
  transparency?: string;
  status?: string;
}

export class UnifiedEventModel {
  constructor(public data: UnifiedEvent) {}

  get id(): string {
    return this.data.id;
  }

  get summary(): string {
    return this.data.summary;
  }

  isBusy(): boolean {
    return this.data.transparency !== 'transparent';
  }

  isCancelled(): boolean {
    return this.data.status === 'cancelled';
  }
}
