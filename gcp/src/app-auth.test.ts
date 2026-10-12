/**
 * Wiring test: the real Express app refuses unauthenticated calls to
 * protected routes and still serves the public allowlist.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

const TOKEN = 'wiring-test-token';
let server: Server;
let base: string;

beforeAll(async () => {
  process.env.API_AUTH_TOKEN = TOKEN;
  const { calendarSync } = await import('./index');
  await new Promise<void>(resolve => {
    server = calendarSync.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
});

describe('real app wiring', () => {
  it.each([
    ['GET', '/sync/status?userId=u1'],
    ['POST', '/sync/trigger'],
    ['GET', '/calendars/list?userId=u1'],
    ['POST', '/auth/store-tokens'],
    ['POST', '/scheduler/incremental'],
    ['POST', '/batch/continue'],
    ['GET', '/api/health'],
  ])('%s %s is 401 without the credential', async (method, path) => {
    const res = await fetch(`${base}${path}`, { method });
    expect(res.status).toBe(401);
  });

  it('does not 401 with the credential', async () => {
    const res = await fetch(`${base}/sync/status`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status).not.toBe(401);
  });

  it('serves /health without a credential', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
  });
});
