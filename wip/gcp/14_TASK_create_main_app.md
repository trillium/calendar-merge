# Task 14: Create Main Express App

**Status:** Not Started
**Priority:** Critical
**Estimated Time:** 2-3 hours
**Dependencies:** Task 13 (Routes), Task 11 (Middleware)

---

## Objective

Create the main Express application entry point that combines all routes, middleware, and exports the Cloud Function.

## Why This Task?

- Main entry point for the Cloud Function
- Configures Express app with middleware
- Mounts all routes
- Exports for Cloud Functions deployment

## File to Create

```
gcp/src/
└── index.ts  (Main Express app + Cloud Function export)
```

## Steps

### 1. Create index.ts

**File:** `gcp/src/index.ts`

```typescript
/**
 * Main application entry point
 * Express app for Google Cloud Functions
 */

import express from 'express';
import cors from 'cors';
import { logger } from './utils';
import { APP_CONFIG, validateAllConfig } from './config';
import { errorHandler, notFoundHandler } from './middleware';
import routes from './routes';

// Validate configuration on startup
try {
  validateAllConfig();
  logger.info('Configuration validated successfully');
} catch (error) {
  logger.error('Configuration validation failed', error);
  if (APP_CONFIG.NODE_ENV === 'production') {
    // In production, fail fast if config is invalid
    process.exit(1);
  }
}

// Create Express app
const app = express();

// Global middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS configuration
app.use(
  cors({
    origin: APP_CONFIG.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Goog-Channel-Id', 'X-Goog-Resource-State', 'X-Goog-Resource-Id'],
  })
);

// Request logging middleware
app.use((req, res, next) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    query: req.query,
    headers: {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent'],
    },
  });
  next();
});

// Mount all routes
app.use('/', routes);

// Error handlers (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Cloud Function export
export const calendarSync = app;

// Local development server
if (process.env.NODE_ENV === 'development' || require.main === module) {
  const PORT = APP_CONFIG.PORT;
  app.listen(PORT, () => {
    logger.info(`Server listening on port ${PORT}`);
    logger.info(`Environment: ${APP_CONFIG.NODE_ENV}`);
    logger.info(`Cloud Function URL: ${APP_CONFIG.CLOUD_FUNCTION_URL || 'not set'}`);
  });
}
```

### 2. Create local development server (optional)

**File:** `gcp/src/dev-server.ts`

```typescript
/**
 * Local development server
 * Runs the Express app locally for testing
 */

import { calendarSync as app } from './index';
import { logger } from './utils';
import { APP_CONFIG } from './config';

const PORT = APP_CONFIG.PORT;

app.listen(PORT, () => {
  logger.info('='.repeat(50));
  logger.info('🚀 Calendar Merge Service - Development Server');
  logger.info('='.repeat(50));
  logger.info(`Server: http://localhost:${PORT}`);
  logger.info(`Health: http://localhost:${PORT}/health`);
  logger.info(`Environment: ${APP_CONFIG.NODE_ENV}`);
  logger.info('='.repeat(50));
  logger.info('Available endpoints:');
  logger.info('  GET  /health              - Health check');
  logger.info('  POST /webhook             - Calendar notifications');
  logger.info('  GET  /auth/init           - Start OAuth');
  logger.info('  GET  /auth/callback       - OAuth callback');
  logger.info('  GET  /calendars           - List calendars');
  logger.info('  POST /calendars/watch     - Create watch');
  logger.info('  POST /batch-sync          - Trigger batch sync');
  logger.info('  GET  /sync/status         - Sync status');
  logger.info('  POST /sync/pause          - Pause sync');
  logger.info('  POST /sync/resume         - Resume sync');
  logger.info('='.repeat(50));
});
```

### 3. Update package.json scripts

The package.json already has the scripts, but verify they're correct:

```json
{
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "dev:server": "tsx src/dev-server.ts"
  }
}
```

### 4. Create .env.example

**File:** `gcp/.env.example`

```bash
# Google Cloud Configuration
GCP_PROJECT=your-project-id
GCLOUD_PROJECT=your-project-id
FUNCTION_REGION=us-central1

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Cloud Function
CLOUD_FUNCTION_URL=https://us-central1-your-project.cloudfunctions.net/calendarSync

# Frontend
FRONTEND_URL=http://localhost:3000

# Optional
NODE_ENV=development
PORT=8080
LOG_LEVEL=info
BATCH_SIZE=10
CORS_ORIGIN=*
```

## Validation Checklist

- [ ] index.ts created with Express app
- [ ] dev-server.ts created for local testing
- [ ] .env.example created
- [ ] Config validation runs on startup
- [ ] CORS configured properly
- [ ] Routes mounted
- [ ] Error handlers in place
- [ ] TypeScript compiles: `pnpm build`
- [ ] Local server runs: `pnpm dev`

## Testing

```bash
cd /Users/trilliumsmith/code/calendar-merge-service/gcp

# Copy .env.example to .env and fill in values
cp .env.example .env
# Edit .env with your actual values

# Install dependencies
pnpm install

# Build
pnpm build

# Run local dev server
pnpm dev

# In another terminal, test endpoints
curl http://localhost:8080/health
curl http://localhost:8080/
```

Expected responses:
```json
// GET /health
{
  "status": "healthy",
  "timestamp": "2025-11-13T...",
  "service": "calendar-merge-service"
}

// GET /
{
  "name": "Calendar Merge Service",
  "version": "1.0.0",
  "endpoints": { ... }
}
```

## Next Task

→ **15_TASK_create_deployment_config.md** - Create deployment scripts and configuration

## Notes

- The exported `calendarSync` is the Cloud Function entry point
- Local dev server runs when `require.main === module` (file executed directly)
- Config validation fails fast in production
- Request logging helps debug issues
- CORS allows frontend to call the API
