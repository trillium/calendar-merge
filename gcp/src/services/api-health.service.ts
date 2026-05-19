/**
 * API Health Tracker
 * Tracks Google Calendar API call rate, errors, and backoff state.
 * Persisted to SQLite via the db adapter.
 */

import { db } from '../db';

const WINDOW_MS = 10_000; // 10-second sliding window
const MAX_CALLS_PER_WINDOW = 60; // Google allows ~10/sec/user, 500/100s aggregate

// In-memory ring buffer for real-time rate calculation (last 60s)
// SQLite stores the durable aggregates + error log
interface ApiCall {
  ts: number;
  ok: boolean;
  status?: number;
}

const recentCalls: ApiCall[] = [];
let backoffState = { active: false, until: 0, attempt: 0, reason: '' };

/**
 * Record an API call — fast in-memory + async SQLite persist
 */
export function recordApiCall(ok: boolean, status?: number) {
  const now = Date.now();
  recentCalls.push({ ts: now, ok, status });

  // Prune older than 60s
  const cutoff = now - 60_000;
  while (recentCalls.length > 0 && recentCalls[0].ts < cutoff) {
    recentCalls.shift();
  }

  if (!ok && (status === 429 || status === 403)) {
    backoffState.attempt++;
    const delayMs = Math.min(1000 * Math.pow(2, backoffState.attempt), 60_000);
    backoffState.active = true;
    backoffState.until = now + delayMs;
    backoffState.reason = status === 429 ? 'Rate limit (429)' : 'Quota exceeded (403)';
  } else if (ok && backoffState.active && now > backoffState.until) {
    backoffState = { active: false, until: 0, attempt: 0, reason: '' };
  }

  // Persist to SQLite (fire-and-forget)
  persistCall(now, ok, status).catch(() => {});
}

async function persistCall(ts: number, ok: boolean, status?: number) {
  const minute = new Date(ts).toISOString().slice(0, 16); // e.g. "2026-05-19T14:32"

  // Upsert into apiHealth aggregate table
  const existing = await db.getDoc<ApiHealthMinute>('apiHealth', minute);
  if (existing) {
    await db.updateDoc('apiHealth', minute, {
      calls: existing.calls + 1,
      errors: existing.errors + (ok ? 0 : 1),
      rateLimited: existing.rateLimited + (status === 429 ? 1 : 0),
      quotaExceeded: existing.quotaExceeded + (status === 403 ? 1 : 0),
      lastCallAt: ts,
    });
  } else {
    await db.setDoc('apiHealth', minute, {
      minute,
      calls: 1,
      errors: ok ? 0 : 1,
      rateLimited: status === 429 ? 1 : 0,
      quotaExceeded: status === 403 ? 1 : 0,
      firstCallAt: ts,
      lastCallAt: ts,
    });
  }
}

interface ApiHealthMinute {
  minute: string;
  calls: number;
  errors: number;
  rateLimited: number;
  quotaExceeded: number;
  firstCallAt: number;
  lastCallAt: number;
}

/**
 * Get current API health snapshot
 */
export async function getApiHealth() {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  // Real-time from in-memory buffer
  const windowCalls = recentCalls.filter(c => c.ts > windowStart);
  const windowErrors = windowCalls.filter(c => !c.ok);
  const callsInWindow = windowCalls.length;
  const utilization = callsInWindow / MAX_CALLS_PER_WINDOW;

  // Temperature: 0-100
  let temperature = Math.round(utilization * 80);
  if (backoffState.active && now < backoffState.until) {
    temperature = Math.max(temperature, 90 + backoffState.attempt * 5);
  }
  if (windowErrors.length > 0) {
    temperature = Math.max(temperature, 60 + windowErrors.length * 10);
  }
  temperature = Math.min(temperature, 100);

  let status: 'cool' | 'warm' | 'hot' | 'critical';
  if (temperature < 40) status = 'cool';
  else if (temperature < 70) status = 'warm';
  else if (temperature < 90) status = 'hot';
  else status = 'critical';

  // Historical totals from SQLite
  const allMinutes = await db.getAll<ApiHealthMinute>('apiHealth');
  const totals = allMinutes.reduce(
    (acc, m) => ({
      calls: acc.calls + m.calls,
      errors: acc.errors + m.errors,
      rateLimited: acc.rateLimited + m.rateLimited,
      quotaExceeded: acc.quotaExceeded + m.quotaExceeded,
    }),
    { calls: 0, errors: 0, rateLimited: 0, quotaExceeded: 0 }
  );

  // Last 10 minutes of per-minute breakdown
  const tenMinAgo = new Date(now - 600_000).toISOString().slice(0, 16);
  const recentMinutes = allMinutes
    .filter(m => m.minute >= tenMinAgo)
    .sort((a, b) => a.minute.localeCompare(b.minute));

  return {
    temperature,
    status,
    window: {
      calls: callsInWindow,
      errors: windowErrors.length,
      limit: MAX_CALLS_PER_WINDOW,
      periodMs: WINDOW_MS,
      utilization: Math.round(utilization * 100),
    },
    backoff: backoffState.active && now < backoffState.until
      ? {
          active: true,
          reason: backoffState.reason,
          attempt: backoffState.attempt,
          resumesAt: new Date(backoffState.until).toISOString(),
          remainingMs: backoffState.until - now,
        }
      : { active: false },
    totals,
    history: recentMinutes,
  };
}
