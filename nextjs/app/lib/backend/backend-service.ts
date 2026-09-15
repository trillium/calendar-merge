/**
 * BackendService interface.
 *
 * Every method the frontend or Next.js API routes need to talk to "the backend"
 * lives here. Swap the implementation (GCP, mock, etc.) in index.ts.
 */

import type {
  AuthStartResult,
  Calendar,
  SetupSyncParams,
  SyncRestartParams,
  SyncStatusResult,
  SyncTriggerParams,
  WatchCreateParams,
} from './types';

export interface BackendService {
  // ── Health ────────────────────────────────────────────────
  health(): Promise<{ status: string }>;

  // ── Auth ──────────────────────────────────────────────────
  /** Get the OAuth start URL. Called from the client to kick off Google sign-in. */
  startAuth(userId?: string): Promise<AuthStartResult>;

  /** Exchange code+state via the backend callback handler. */
  handleCallback(code: string, state: string): Promise<unknown>;

  /** Revoke OAuth access for a user. */
  revokeAuth(userId: string): Promise<unknown>;

  /** Store tokens via the backend after OAuth exchange. */
  storeTokens(params: {
    userId: string;
    email: string;
    accessToken: string;
    refreshToken: string;
    tokenExpiry: number;
  }): Promise<unknown>;

  // ── Calendars ─────────────────────────────────────────────
  /** List calendars for a user. Returns the raw backend response. */
  listCalendars(userId: string): Promise<{ calendars: Calendar[] }>;

  /** Create a new Google Calendar. */
  createCalendar(userId: string, summary: string): Promise<Calendar>;

  /** Delete a Google Calendar. */
  deleteCalendar(userId: string, calendarId: string): Promise<unknown>;

  // ── Sync ──────────────────────────────────────────────────
  /** Set up sync: create watches + trigger initial sync. Called by /api/setup route. */
  createWatch(params: WatchCreateParams): Promise<unknown>;

  /** Trigger a manual sync. */
  triggerSync(params: SyncTriggerParams): Promise<unknown>;

  /** Get sync status for a user. */
  getSyncStatus(userId: string): Promise<SyncStatusResult>;

  /** Stop a watch channel. */
  stopWatch(channelId: string): Promise<unknown>;

  /** Pause a watch channel. */
  pauseWatch(channelId: string): Promise<unknown>;

  /** Resume a watch channel. */
  resumeWatch(channelId: string): Promise<unknown>;

  /** Restart sync with full params (proxied by /api/sync/restart). */
  restartSync(params: SyncRestartParams): Promise<unknown>;

  /** Clear all sync data for a user (danger zone). */
  clearSyncData(userId: string): Promise<unknown>;

  // ── Client-side convenience (calls Next.js API routes) ────
  /**
   * Set up calendar sync end-to-end from the client.
   * Calls /api/setup which orchestrates watch creation + initial sync.
   */
  setupCalendarSync(params: SetupSyncParams): Promise<{ watchesCreated: number; [key: string]: unknown }>;

  /**
   * Fetch calendars from the client side (via backend direct).
   * Includes debug JSONL logging on failure.
   */
  fetchCalendars(userId: string): Promise<Calendar[]>;
}
