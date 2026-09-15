/**
 * GCP Backend Service implementation.
 *
 * Talks to the Express backend at NEXT_PUBLIC_BACKEND_URL.
 * This is the only file that knows the backend URL shape.
 */

import type { BackendService } from './backend-service';
import type {
  AuthStartResult,
  Calendar,
  SetupSyncParams,
  SyncRestartParams,
  SyncStatusResult,
  SyncTriggerParams,
  WatchCreateParams,
} from './types';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:13013';

/**
 * Low-level fetch wrapper for the GCP backend.
 * Adds Content-Type, parses JSON, throws on non-2xx.
 */
async function callBackend<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${BACKEND_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || error.message || 'Backend request failed');
  }

  return response.json();
}

/**
 * Send a debug breadcrumb to the JSONL debug endpoint.
 * Fire-and-forget — never throws, never awaited.
 */
function debugLog(msg: string, extra: Record<string, string> = {}): void {
  const params = new URLSearchParams({ msg, ...extra });
  fetch(`/api/debug?${params}`).catch(() => {});
}

export function createGcpBackendService(): BackendService {
  return {
    // ── Health ────────────────────────────────────────────
    health: () => callBackend('/health'),

    // ── Auth ──────────────────────────────────────────────
    startAuth: (userId?: string) => {
      const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
      return callBackend<AuthStartResult>(`/auth/google${qs}`);
    },

    handleCallback: (code: string, state: string) =>
      callBackend(`/auth/google/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`),

    revokeAuth: (userId: string) =>
      callBackend('/auth/revoke', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      }),

    storeTokens: (params) =>
      callBackend('/auth/store-tokens', {
        method: 'POST',
        body: JSON.stringify({
          userId: params.userId,
          email: params.email,
          accessToken: params.accessToken,
          refreshToken: params.refreshToken,
          tokenExpiry: params.tokenExpiry,
        }),
      }),

    // ── Calendars ─────────────────────────────────────────
    listCalendars: (userId: string) =>
      callBackend<{ calendars: Calendar[] }>(`/calendars/list?userId=${encodeURIComponent(userId)}`),

    createCalendar: (userId: string, summary: string) =>
      callBackend<Calendar>('/calendars', {
        method: 'POST',
        body: JSON.stringify({ userId, summary }),
      }),

    deleteCalendar: (userId: string, calendarId: string) =>
      callBackend('/calendars', {
        method: 'DELETE',
        body: JSON.stringify({ userId, calendarId }),
      }),

    // ── Sync ──────────────────────────────────────────────
    createWatch: (params: WatchCreateParams) =>
      callBackend('/calendars/watch', {
        method: 'POST',
        body: JSON.stringify(params),
      }),

    triggerSync: (params: SyncTriggerParams) =>
      callBackend('/sync/trigger', {
        method: 'POST',
        body: JSON.stringify(params),
      }),

    getSyncStatus: (userId: string) =>
      callBackend<SyncStatusResult>(`/sync/status?userId=${encodeURIComponent(userId)}`),

    stopWatch: (channelId: string) =>
      callBackend(`/calendars/watch/${encodeURIComponent(channelId)}`, {
        method: 'DELETE',
      }),

    pauseWatch: (channelId: string) =>
      callBackend(`/sync/pause/${encodeURIComponent(channelId)}`, {
        method: 'POST',
      }),

    resumeWatch: (channelId: string) =>
      callBackend(`/sync/resume/${encodeURIComponent(channelId)}`, {
        method: 'POST',
      }),

    restartSync: (params: SyncRestartParams) =>
      callBackend('/sync/restart', {
        method: 'POST',
        body: JSON.stringify(params),
      }),

    clearSyncData: (userId: string) =>
      callBackend('/sync/data', {
        method: 'DELETE',
        body: JSON.stringify({ userId }),
      }),

    // ── Client-side convenience ───────────────────────────
    setupCalendarSync: async (params: SetupSyncParams) => {
      const userId = localStorage.getItem('calendar_merge_userId');
      if (!userId) throw new Error('Not authenticated');

      const response = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          sourceCalendars: params.selectedSources,
          targetCalendar: params.targetCalendarId,
        }),
      });
      if (!response.ok) throw new Error('Setup failed');
      return response.json();
    },

    fetchCalendars: async (userId: string) => {
      const url = `${BACKEND_URL}/calendars/list?userId=${encodeURIComponent(userId)}`;
      try {
        const response = await fetch(url);
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(`Backend ${response.status}: ${text}`);
        }
        const data = await response.json();
        return data.calendars;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        debugLog('fetchCalendars-detail', {
          url,
          err: msg,
        });
        throw new Error(`Failed to load calendars: ${msg}`);
      }
    },
  };
}
