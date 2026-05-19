/**
 * Main application entry point
 * Express app for Google Cloud Functions
 */

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

import express, { Express } from 'express';
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
app.use((req, _res, next) => {
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
export const calendarSync: Express = app;

// Local development server with background jobs
if (process.env.NODE_ENV === 'development' || require.main === module) {
  const PORT = APP_CONFIG.PORT;
  app.listen(PORT, () => {
    logger.info(`Server listening on port ${PORT}`);
    logger.info(`Environment: ${APP_CONFIG.NODE_ENV}`);
    logger.info(`Cloud Function URL: ${APP_CONFIG.CLOUD_FUNCTION_URL || 'not set'}`);

    // Start background jobs (local replacements for Cloud Scheduler)
    const { startChannelRenewalJob } = require('./jobs/channel-renewal.job');
    const { startPeriodicSyncJob } = require('./jobs/periodic-sync.job');
    const { startCleanupJob } = require('./jobs/cleanup.job');

    startChannelRenewalJob();
    startPeriodicSyncJob();
    startCleanupJob();

    logger.info('All background jobs started');
  });
}
