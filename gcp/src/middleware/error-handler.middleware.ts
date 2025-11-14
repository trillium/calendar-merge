/**
 * Error handling middleware
 * Provides consistent error responses
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils';

const log = logger;

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Global error handler
 */
export function errorHandler(
  error: Error | ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  log.error('Error in request', error, {
    path: req.path,
    method: req.method,
    body: req.body,
  });

  // Handle ApiError
  if (error instanceof ApiError) {
    res.status(error.statusCode).json({
      error: error.message,
      details: error.details,
    });
    return;
  }

  // Handle Google API errors
  if ((error as any).code && (error as any).errors) {
    const googleError = error as any;
    res.status(googleError.code).json({
      error: googleError.message || 'Google API error',
      details: googleError.errors,
    });
    return;
  }

  // Default to 500 Internal Server Error
  res.status(500).json({
    error: 'Internal Server Error',
    message: error.message || 'An unexpected error occurred',
  });
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    method: req.method,
    message: 'API endpoint not found',
  });
}

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
