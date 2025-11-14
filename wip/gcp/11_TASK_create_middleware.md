# Task 11: Create Express Middleware

**Status:** Not Started
**Priority:** High
**Estimated Time:** 2-3 hours
**Dependencies:** Task 02 (Config), Task 04 (Utils)

---

## Objective

Create Express middleware for authentication, webhook verification, and error handling.

## Why This Task?

- Middleware provides reusable request handling logic
- Protects routes with authentication
- Validates webhook requests from Google
- Provides consistent error responses

## Files to Create

```
gcp/src/middleware/
├── auth.middleware.ts                 (Authentication)
├── webhook-verification.middleware.ts (Webhook validation)
├── error-handler.middleware.ts        (Error handling)
└── index.ts                           (Exports)
```

## Steps

### 1. Create auth.middleware.ts

**File:** `gcp/src/middleware/auth.middleware.ts`

```typescript
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
  res: Response,
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
```

### 2. Create webhook-verification.middleware.ts

**File:** `gcp/src/middleware/webhook-verification.middleware.ts`

```typescript
/**
 * Webhook verification middleware
 * Validates webhook requests from Google Calendar
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils';

const log = logger;

/**
 * Verify Google Calendar webhook headers
 */
export async function verifyWebhook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const channelId = req.headers['x-goog-channel-id'] as string;
  const resourceState = req.headers['x-goog-resource-state'] as string;
  const resourceId = req.headers['x-goog-resource-id'] as string;

  if (!channelId) {
    log.warn('Webhook missing x-goog-channel-id header');
    res.status(400).json({
      error: 'Bad Request',
      message: 'Missing required webhook headers',
    });
    return;
  }

  // Attach webhook data to request
  (req as any).webhook = {
    channelId,
    resourceState,
    resourceId,
  };

  log.debug('Webhook verified', { channelId, resourceState, resourceId });

  next();
}

/**
 * Handle sync state (Google's initial verification request)
 */
export async function handleSyncState(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const resourceState = req.headers['x-goog-resource-state'] as string;

  if (resourceState === 'sync') {
    log.info('Received sync verification from Google');
    res.status(200).send('Sync acknowledged');
    return;
  }

  next();
}
```

### 3. Create error-handler.middleware.ts

**File:** `gcp/src/middleware/error-handler.middleware.ts`

```typescript
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
  next: NextFunction
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
```

### 4. Create middleware/index.ts

**File:** `gcp/src/middleware/index.ts`

```typescript
/**
 * Middleware exports
 */

export {
  requireAuth,
  optionalAuth,
  validateUserId,
} from './auth.middleware';

export {
  verifyWebhook,
  handleSyncState,
} from './webhook-verification.middleware';

export {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  ApiError,
} from './error-handler.middleware';
```

## Validation Checklist

- [ ] auth.middleware.ts created
- [ ] webhook-verification.middleware.ts created
- [ ] error-handler.middleware.ts created
- [ ] middleware/index.ts exports all middleware
- [ ] TypeScript compiles: `pnpm build`

## Testing

Middleware will be tested as part of the Express app in later tasks.

## Next Task

→ **12_TASK_create_controllers.md** - Create controller layer for business logic

## Notes

- `requireAuth()` validates Bearer tokens (Cloud Functions handles token verification)
- `verifyWebhook()` validates Google Calendar webhook headers
- `errorHandler()` provides consistent error responses
- `asyncHandler()` wraps async route handlers to catch errors
- `ApiError` is a custom error class for throwing API errors with status codes
