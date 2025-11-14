# Task 13: Create Routes

**Status:** Not Started
**Priority:** High
**Estimated Time:** 2-3 hours
**Dependencies:** Task 11 (Middleware), Task 12 (Controllers)

---

## Objective

Create Express route files that wire up controllers and middleware to HTTP endpoints.

## Why This Task?

- Routes define the API surface
- Apply middleware at route level
- Keep route files clean and declarative
- Easy to see all API endpoints

## Files to Create

```
gcp/src/routes/
├── webhook.routes.ts       (Webhook endpoints)
├── sync.routes.ts          (Sync control endpoints)
├── calendar.routes.ts      (Calendar management)
├── auth.routes.ts          (OAuth flow)
├── health.routes.ts        (Health check)
└── index.ts                (Combine all routes)
```

## Steps

### 1. Create webhook.routes.ts

**File:** `gcp/src/routes/webhook.routes.ts`

```typescript
/**
 * Webhook routes
 */

import { Router } from 'express';
import { handleWebhook } from '../controllers';
import { verifyWebhook, handleSyncState, asyncHandler } from '../middleware';

const router = Router();

/**
 * POST /webhook
 * Receive Google Calendar push notifications
 */
router.post(
  '/webhook',
  verifyWebhook,
  handleSyncState,
  asyncHandler(handleWebhook)
);

export default router;
```

### 2. Create sync.routes.ts

**File:** `gcp/src/routes/sync.routes.ts`

```typescript
/**
 * Sync control routes
 */

import { Router } from 'express';
import {
  triggerBatchSync,
  getSyncStatus,
  pauseSync,
  resumeSync,
  stopSync,
  restartSync,
  clearUserData,
} from '../controllers';
import { requireAuth, asyncHandler } from '../middleware';

const router = Router();

/**
 * POST /batch-sync
 * Trigger batch sync (authenticated)
 */
router.post('/batch-sync', requireAuth, asyncHandler(triggerBatchSync));

/**
 * GET /sync/status
 * Get sync status for a user
 */
router.get('/sync/status', asyncHandler(getSyncStatus));

/**
 * POST /sync/pause
 * Pause sync for a calendar
 */
router.post('/sync/pause', asyncHandler(pauseSync));

/**
 * POST /sync/resume
 * Resume sync for a calendar
 */
router.post('/sync/resume', asyncHandler(resumeSync));

/**
 * POST /sync/stop
 * Stop sync (delete watch)
 */
router.post('/sync/stop', asyncHandler(stopSync));

/**
 * POST /sync/restart
 * Restart sync (reset and re-sync)
 */
router.post('/sync/restart', asyncHandler(restartSync));

/**
 * DELETE /user/clear
 * Clear all user data
 */
router.delete('/user/clear', asyncHandler(clearUserData));

export default router;
```

### 3. Create calendar.routes.ts

**File:** `gcp/src/routes/calendar.routes.ts`

```typescript
/**
 * Calendar management routes
 */

import { Router } from 'express';
import { getCalendars, createWatch } from '../controllers';
import { asyncHandler } from '../middleware';

const router = Router();

/**
 * GET /calendars
 * List all calendars for a user
 */
router.get('/calendars', asyncHandler(getCalendars));

/**
 * POST /calendars/watch
 * Create a watch for a calendar
 */
router.post('/calendars/watch', asyncHandler(createWatch));

export default router;
```

### 4. Create auth.routes.ts

**File:** `gcp/src/routes/auth.routes.ts`

```typescript
/**
 * OAuth authentication routes
 */

import { Router } from 'express';
import { initiateAuth, handleCallback, revokeAuth } from '../controllers';
import { asyncHandler } from '../middleware';

const router = Router();

/**
 * GET /auth/init
 * Initiate OAuth flow
 */
router.get('/auth/init', asyncHandler(initiateAuth));

/**
 * GET /auth/callback
 * Handle OAuth callback from Google
 */
router.get('/auth/callback', asyncHandler(handleCallback));

/**
 * POST /auth/revoke
 * Revoke OAuth access
 */
router.post('/auth/revoke', asyncHandler(revokeAuth));

export default router;
```

### 5. Create health.routes.ts

**File:** `gcp/src/routes/health.routes.ts`

```typescript
/**
 * Health check routes
 */

import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /health
 * Health check endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'calendar-merge-service',
  });
});

/**
 * GET /
 * Root endpoint
 */
router.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    name: 'Calendar Merge Service',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      webhook: '/webhook',
      auth: '/auth/*',
      calendars: '/calendars',
      sync: '/sync/*',
    },
  });
});

export default router;
```

### 6. Create routes/index.ts

**File:** `gcp/src/routes/index.ts`

```typescript
/**
 * Routes index
 * Combines all route modules
 */

import { Router } from 'express';
import webhookRoutes from './webhook.routes';
import syncRoutes from './sync.routes';
import calendarRoutes from './calendar.routes';
import authRoutes from './auth.routes';
import healthRoutes from './health.routes';

const router = Router();

// Mount route modules
router.use('/', healthRoutes);
router.use('/', webhookRoutes);
router.use('/', syncRoutes);
router.use('/', calendarRoutes);
router.use('/', authRoutes);

export default router;
```

## Route Summary

Here's the complete API surface:

### Public Routes
```
GET  /                    - Service info
GET  /health              - Health check
POST /webhook             - Google Calendar notifications
GET  /auth/init           - Start OAuth flow
GET  /auth/callback       - OAuth callback
POST /auth/revoke         - Revoke access
```

### API Routes (used by Next.js frontend)
```
GET  /calendars           - List user calendars
POST /calendars/watch     - Create watch
GET  /sync/status         - Get sync status
POST /sync/pause          - Pause sync
POST /sync/resume         - Resume sync
POST /sync/stop           - Stop sync
POST /sync/restart        - Restart sync
DELETE /user/clear        - Clear user data
```

### Protected Routes (require authentication)
```
POST /batch-sync          - Trigger batch sync (Cloud Tasks only)
```

## Validation Checklist

- [ ] All 6 route files created
- [ ] Routes use asyncHandler for async controllers
- [ ] Middleware applied appropriately
- [ ] Protected routes use requireAuth
- [ ] Webhook routes use verifyWebhook
- [ ] TypeScript compiles: `pnpm build`
- [ ] routes/index.ts combines all routes

## Next Task

→ **14_TASK_create_main_app.md** - Create main Express app (index.ts)

## Notes

- Routes are declarative (just wiring)
- All business logic is in controllers/services
- `asyncHandler` wraps async functions to catch errors
- Middleware is applied per-route or per-router
- The route structure matches the current `app.ts` routes
