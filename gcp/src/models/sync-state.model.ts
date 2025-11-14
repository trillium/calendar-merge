/**
 * Sync state model
 */

import { SyncState } from '../types';

export class SyncStateModel {
  constructor(public data: SyncState) {}

  get status(): SyncState['status'] {
    return this.data.status;
  }

  isActive(): boolean {
    return this.data.status === 'pending' || this.data.status === 'syncing';
  }

  isComplete(): boolean {
    return this.data.status === 'completed';
  }

  hasFailed(): boolean {
    return this.data.status === 'failed';
  }

  getProgress(): number {
    if (!this.data.totalEvents || this.data.totalEvents === 0) {
      return 0;
    }
    return ((this.data.processedEvents || 0) / this.data.totalEvents) * 100;
  }
}
