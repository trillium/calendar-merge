# Task 03: Create Type Definitions

**Status:** Not Started
**Priority:** Critical
**Estimated Time:** 1-2 hours
**Dependencies:** Task 01 (TypeScript setup)

---

## Objective

Port and organize type definitions from `functions/calendar-sync/types.ts` into the `/gcp` structure, creating model files and shared types.

## Why This Task?

- Types are used by all services and models
- Need to define before writing service logic
- Ensures type safety across the codebase

## Source File

Reference: `functions/calendar-sync/types.ts` (53 lines)

## Target Structure

```
gcp/src/
├── types/
│   ├── index.ts              (re-exports all types)
│   ├── calendar.types.ts     (calendar-related types)
│   ├── sync.types.ts         (sync-related types)
│   └── watch.types.ts        (watch channel types)
└── models/
    ├── user.model.ts         (User data model)
    ├── watch-channel.model.ts (Watch channel model)
    ├── sync-state.model.ts   (Sync state model)
    └── calendar-connection.model.ts (Calendar connection)
```

## Steps

### 1. Create types directory

```bash
mkdir -p /Users/trilliumsmith/code/calendar-merge-service/gcp/src/types
```

### 2. Create calendar.types.ts

**File:** `gcp/src/types/calendar.types.ts`

```typescript
/**
 * Calendar-related type definitions
 */

import { Timestamp } from '@google-cloud/firestore';
import { calendar_v3 } from 'googleapis';

/**
 * Event mapping between source and target calendars
 */
export interface EventMapping {
  sourceCalendarId: string;
  sourceEventId: string;
  targetEventId: string;
  lastSynced: Timestamp;
}

/**
 * User data stored in Firestore
 */
export interface UserData {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
  targetCalendarId?: string;
  createdAt: Timestamp;
  lastLogin?: Timestamp;
}

/**
 * OAuth state for CSRF protection
 */
export interface OAuthState {
  state: string;
  userId?: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
}

/**
 * Google Calendar Event (re-export from googleapis)
 */
export type CalendarEvent = calendar_v3.Schema$Event;

/**
 * Google Calendar (re-export from googleapis)
 */
export type Calendar = calendar_v3.Schema$Calendar;

/**
 * Google Calendar List Entry
 */
export type CalendarListEntry = calendar_v3.Schema$CalendarListEntry;
```

### 3. Create watch.types.ts

**File:** `gcp/src/types/watch.types.ts`

```typescript
/**
 * Watch channel type definitions
 */

import { Timestamp } from '@google-cloud/firestore';

/**
 * Watch channel data stored in Firestore
 */
export interface WatchData {
  channelId: string;
  resourceId: string;
  userId: string;
  calendarId: string;
  targetCalendarId: string;
  expiration: number; // Unix timestamp in milliseconds
  createdAt: Timestamp;
  paused?: boolean;
  syncToken?: string | null;
  syncTokenUpdatedAt?: number;
  syncState?: SyncState;
  stats?: WatchStats;
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
```

### 4. Create sync.types.ts

**File:** `gcp/src/types/sync.types.ts`

```typescript
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
```

### 5. Create types/index.ts

**File:** `gcp/src/types/index.ts`

```typescript
/**
 * Type definitions exports
 * Central export point for all type definitions
 */

// Calendar types
export type {
  EventMapping,
  UserData,
  OAuthState,
  CalendarEvent,
  Calendar,
  CalendarListEntry,
} from './calendar.types';

// Watch types
export type {
  WatchData,
  WatchStats,
  SyncState,
  WatchChannelResponse,
} from './watch.types';

// Sync types
export type {
  SyncEventResult,
  BatchSyncOptions,
  BatchSyncProgress,
  RoundRobinStatus,
  EventTransformOptions,
  EventHandlingConfig,
} from './sync.types';
```

### 6. Update model files with type imports

**File:** `gcp/src/models/user.model.ts`

```typescript
/**
 * User data model
 */

import { UserData } from '../types';

export class User {
  constructor(public data: UserData) {}

  get userId(): string {
    return this.data.userId;
  }

  get email(): string {
    return this.data.email;
  }

  hasValidTokens(): boolean {
    return !!(this.data.accessToken && this.data.refreshToken);
  }

  isTokenExpired(): boolean {
    return Date.now() >= this.data.tokenExpiry;
  }
}
```

**File:** `gcp/src/models/watch-channel.model.ts`

```typescript
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
```

**File:** `gcp/src/models/sync-state.model.ts`

```typescript
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
```

**File:** `gcp/src/models/calendar-connection.model.ts`

```typescript
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
```

**File:** `gcp/src/models/unified-event.model.ts`

```typescript
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
```

### 7. Create models/index.ts

**File:** `gcp/src/models/index.ts`

```typescript
/**
 * Models exports
 */

export { User } from './user.model';
export { WatchChannel } from './watch-channel.model';
export { SyncStateModel } from './sync-state.model';
export { CalendarConnectionModel } from './calendar-connection.model';
export { UnifiedEventModel } from './unified-event.model';
```

## Validation Checklist

- [ ] All type files created in gcp/src/types/
- [ ] All model files created in gcp/src/models/
- [ ] Types match the ones in functions/calendar-sync/types.ts
- [ ] Models have basic helper methods
- [ ] TypeScript compiles: `pnpm build`
- [ ] No circular dependencies

## Testing

```bash
cd /Users/trilliumsmith/code/calendar-merge-service/gcp
pnpm build

# Should compile without errors
# Check output
ls -la dist/types/
ls -la dist/models/
```

## Next Task

→ **04_TASK_create_utility_functions.md** - Create logger, crypto, and date helpers

## Notes

- These types replace `functions/calendar-sync/types.ts`
- Models add helper methods on top of plain interfaces
- Additional type `EventHandlingConfig` added for the Airbnb feature
