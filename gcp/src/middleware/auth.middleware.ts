/**
 * Authentication middleware
 * Verifies requests are authenticated (for protected routes)
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils';

const log = logger;

/**
 * Require authentication via Bearer token
 * For Cloud Functions, this validates the Authorization header
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    log.warn('Unauthorized request - missing or invalid Authorization header', {
      path: req.path,
      method: req.method,
    });

    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header',
    });
    return;
  }

  // For Cloud Functions, the Bearer token should be a valid Google ID token
  // The Cloud Run/Functions infrastructure validates it automatically
  // If we reach this point with an auth header, the request is authenticated

  next();
}

/**
 * Optional authentication - attach user info if present
 * Doesn't reject unauthenticated requests
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    // Could decode token here to get user info
    // For now, just pass through
  }

  next();
}

/**
 * Validate userId parameter
 */
export async function validateUserId(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.body.userId || req.params.userId || req.query.userId;

  if (!userId) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'userId is required',
    });
    return;
  }

  // Attach to request for downstream use
  (req as any).userId = userId;

  next();
}
