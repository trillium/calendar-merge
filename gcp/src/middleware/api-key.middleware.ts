/**
 * API key authentication middleware
 * Guards every externally reachable endpoint with a shared secret supplied
 * via the API_AUTH_TOKEN environment variable (never committed).
 */

import { timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils';

const log = logger;

/**
 * Endpoints that stay reachable without the API key:
 * - health/root: liveness probes, expose only the service version
 * - webhook: Google cannot send our credential; verifyWebhook checks its headers
 * - OAuth callbacks: browser redirects from Google, validated by code + state
 */
const PUBLIC_ROUTES: ReadonlyArray<{ method: string; path: string }> = [
  { method: 'GET', path: '/' },
  { method: 'GET', path: '/health' },
  { method: 'POST', path: '/webhook' },
  { method: 'GET', path: '/auth/google/callback' },
  { method: 'GET', path: '/auth/google/local-callback' },
];

function isPublicRoute(req: Request): boolean {
  return PUBLIC_ROUTES.some(r => r.method === req.method && r.path === req.path);
}

function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Require `Authorization: Bearer <API_AUTH_TOKEN>` on all non-public routes.
 * Fails closed: if API_AUTH_TOKEN is not configured, protected routes are refused.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  if (isPublicRoute(req)) {
    next();
    return;
  }

  const expected = process.env.API_AUTH_TOKEN;
  if (!expected) {
    log.error('API_AUTH_TOKEN is not configured - refusing protected request', {
      path: req.path,
      method: req.method,
    });
    res.status(503).json({
      error: 'Service Unavailable',
      message: 'API authentication is not configured on the server',
    });
    return;
  }

  const authHeader = req.headers.authorization;
  const provided = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';

  if (!provided || !tokensMatch(provided, expected)) {
    log.warn('Unauthorized request - missing or invalid API key', {
      path: req.path,
      method: req.method,
    });
    res.setHeader('WWW-Authenticate', 'Bearer');
    res.status(401).json({
      error: 'Unauthorized',
      message: 'A valid Bearer token is required',
    });
    return;
  }

  next();
}

/**
 * Authorization header for the service's own HTTP self-calls
 * (task queue, batch self-trigger), which pass through requireApiKey.
 */
export function internalAuthHeaders(): Record<string, string> {
  const token = process.env.API_AUTH_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
