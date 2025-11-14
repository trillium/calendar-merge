/**
 * Watch channel model
 */

import { WatchData } from '../types';

export class WatchChannel {
  constructor(public data: WatchData) {}

  get channelId(): string {
    return this.data.channelId;
  }

  get calendarId(): string {
    return this.data.calendarId;
  }

  get userId(): string {
    return this.data.userId;
  }

  isPaused(): boolean {
    return this.data.paused === true;
  }

  isExpired(): boolean {
    return Date.now() >= this.data.expiration;
  }

  isExpiringSoon(bufferHours: number = 24): boolean {
    const bufferMs = bufferHours * 60 * 60 * 1000;
    return Date.now() >= this.data.expiration - bufferMs;
  }

  isSyncing(): boolean {
    const status = this.data.syncState?.status;
    return status === 'pending' || status === 'syncing';
  }
}
