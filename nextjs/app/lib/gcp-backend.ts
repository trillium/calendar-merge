/**
 * GCP Backend API Client
 * Utility for calling the local GCP backend during development
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';

/**
 * Call the GCP backend API
 */
export async function callGcpBackend<T = any>(
  endpoint: string,
  options: RequestInit = {}
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
 * GCP Backend API methods
 */
export const gcpBackend = {
  /**
   * Health check
   */
  health: () => callGcpBackend('/health'),

  /**
   * OAuth - Generate auth URL
   */
  startAuth: (userId: string) =>
    callGcpBackend<{ authUrl: string; state: string }>(`/auth/google?userId=${userId}`),

  /**
   * OAuth - Handle callback (called from Next.js callback route)
   */
  handleCallback: (code: string, state: string) =>
    callGcpBackend(`/auth/google/callback?code=${code}&state=${state}`),

  /**
   * Revoke OAuth access
   */
  revokeAuth: (userId: string) =>
    callGcpBackend('/auth/revoke', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),

  /**
   * List user's calendars
   */
  listCalendars: (userId: string) =>
    callGcpBackend(`/calendars/list?userId=${userId}`),

  /**
   * Create a watch channel for calendar sync
   */
  createWatch: (data: {
    userId: string;
    calendarId: string;
    targetCalendarId: string;
  }) =>
    callGcpBackend('/calendars/watch', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * Stop a watch channel
   */
  stopWatch: (channelId: string) =>
    callGcpBackend(`/calendars/watch/${channelId}`, {
      method: 'DELETE',
    }),

  /**
   * Pause a watch channel
   */
  pauseWatch: (channelId: string) =>
    callGcpBackend(`/sync/pause/${channelId}`, {
      method: 'POST',
    }),

  /**
   * Resume a watch channel
   */
  resumeWatch: (channelId: string) =>
    callGcpBackend(`/sync/resume/${channelId}`, {
      method: 'POST',
    }),

  /**
   * Trigger manual sync
   */
  triggerSync: (data: { userId?: string; channelId?: string }) =>
    callGcpBackend('/sync/trigger', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * Get sync status
   */
  getSyncStatus: (channelId: string) =>
    callGcpBackend(`/sync/status/${channelId}`),
};

/**
 * Example usage in Next.js API route:
 *
 * import { gcpBackend } from '@/app/lib/gcp-backend';
 *
 * export async function GET(req: NextRequest) {
 *   const userId = 'user-123';
 *
 *   try {
 *     const calendars = await gcpBackend.listCalendars(userId);
 *     return NextResponse.json(calendars);
 *   } catch (error) {
 *     return NextResponse.json(
 *       { error: error.message },
 *       { status: 500 }
 *     );
 *   }
 * }
 */
