/**
 * API key middleware tests: protected routes fail without the credential
 * and pass with it; the public allowlist stays reachable.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { requireApiKey, internalAuthHeaders } from './api-key.middleware';

const TOKEN = 'test-api-token-123';
let server: Server;
let base: string;
let savedToken: string | undefined;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(requireApiKey);
  const ok = (_req: express.Request, res: express.Response) => res.status(200).json({ ok: true });
  app.get('/', ok);
  app.get('/health', ok);
  app.post('/webhook', ok);
  app.get('/auth/google/callback', ok);
  app.get('/auth/google/local-callback', ok);
  app.get('/auth/google', ok);
  app.get('/api/health', ok);
  app.get('/sync/status', ok);
  app.post('/sync/trigger', ok);
  app.delete('/sync/data', ok);
  app.get('/calendars/list', ok);
  app.delete('/calendars', ok);
  app.post('/auth/store-tokens', ok);
  app.post('/auth/revoke', ok);
  app.post('/scheduler/renew-watches', ok);
  app.post('/batch/continue', ok);
  app.post('/test/batch', ok);
  await new Promise<void>(resolve => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  savedToken = process.env.API_AUTH_TOKEN;
  process.env.API_AUTH_TOKEN = TOKEN;
});

afterEach(() => {
  if (savedToken === undefined) delete process.env.API_AUTH_TOKEN;
  else process.env.API_AUTH_TOKEN = savedToken;
});

const PROTECTED: Array<[string, string]> = [
  ['GET', '/auth/google'],
  ['GET', '/api/health'],
  ['GET', '/sync/status?userId=u1'],
  ['POST', '/sync/trigger'],
  ['DELETE', '/sync/data'],
  ['GET', '/calendars/list?userId=u1'],
  ['DELETE', '/calendars'],
  ['POST', '/auth/store-tokens'],
  ['POST', '/auth/revoke'],
  ['POST', '/scheduler/renew-watches'],
  ['POST', '/batch/continue'],
  ['POST', '/test/batch'],
];

const PUBLIC: Array<[string, string]> = [
  ['GET', '/'],
  ['GET', '/health'],
  ['POST', '/webhook'],
  ['GET', '/auth/google/callback?code=x&state=y'],
  ['GET', '/auth/google/local-callback?code=x&state=y'],
];

const call = (method: string, path: string, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method, headers });

describe('requireApiKey', () => {
  describe.each(PROTECTED)('%s %s', (method, path) => {
    it('refuses a request with no credential (401)', async () => {
      const res = await call(method, path);
      expect(res.status).toBe(401);
      expect(res.headers.get('www-authenticate')).toBe('Bearer');
      expect(await res.json()).toMatchObject({ error: 'Unauthorized' });
    });

    it('refuses a wrong token (401)', async () => {
      const res = await call(method, path, { Authorization: 'Bearer wrong-token' });
      expect(res.status).toBe(401);
    });

    it('serves a request with the correct token', async () => {
      const res = await call(method, path, { Authorization: `Bearer ${TOKEN}` });
      expect(res.status).toBe(200);
    });
  });

  it.each(PUBLIC)('leaves %s %s reachable without a credential', async (method, path) => {
    const res = await call(method, path);
    expect(res.status).toBe(200);
  });

  it('refuses non-Bearer schemes', async () => {
    const res = await call('GET', '/sync/status', { Authorization: `Basic ${TOKEN}` });
    expect(res.status).toBe(401);
  });

  it('fails closed (503) when API_AUTH_TOKEN is not configured, even with a header', async () => {
    delete process.env.API_AUTH_TOKEN;
    const bare = await call('GET', '/sync/status');
    expect(bare.status).toBe(503);
    const withHeader = await call('GET', '/sync/status', { Authorization: 'Bearer ' });
    expect(withHeader.status).toBe(503);
    // public allowlist still works
    expect((await call('GET', '/health')).status).toBe(200);
  });
});

describe('internalAuthHeaders', () => {
  it('returns the Bearer header when configured', () => {
    expect(internalAuthHeaders()).toEqual({ Authorization: `Bearer ${TOKEN}` });
  });

  it('returns nothing when not configured', () => {
    delete process.env.API_AUTH_TOKEN;
    expect(internalAuthHeaders()).toEqual({});
  });
});
