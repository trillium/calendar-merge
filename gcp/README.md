# GCP Backend - Calendar Merge Service

## Folder Structure

```
/
├── src/
│   ├── index.ts                              # Cloud function entry point, exports Express app
│   │
│   ├── routes/
│   │   ├── index.ts                          # Main router aggregator
│   │   │   └── default export: Router
│   │   ├── auth.routes.ts                    # OAuth flow routes
│   │   │   └── default export: Router
│   │   ├── calendar.routes.ts                # Calendar management routes
│   │   │   └── default export: Router
│   │   ├── sync.routes.ts                    # Manual sync trigger routes
│   │   │   └── default export: Router
│   │   ├── webhook.routes.ts                 # Google webhook receiver routes
│   │   │   └── default export: Router
│   │   ├── batch.routes.ts                   # Batch sync routes
│   │   │   ├── createBatchRoutes()
│   │   │   └── createTestRoutes()
│   │   └── health.routes.ts                  # Health check / status routes
│   │       └── default export: Router
│   │
│   ├── controllers/
│   │   ├── index.ts                          # Controller exports
│   │   ├── auth.controller.ts                # OAuth initiation, callback, token refresh
│   │   │   ├── initiateAuth()
│   │   │   ├── handleCallback()
│   │   │   └── revokeAuth()
│   │   ├── calendar.controller.ts            # List/add/remove calendars to sync
│   │   │   ├── getCalendars()
│   │   │   └── createWatch()
│   │   ├── sync.controller.ts                # Perform sync operations
│   │   │   ├── triggerBatchSync()
│   │   │   ├── getSyncStatus()
│   │   │   ├── pauseSync()
│   │   │   ├── resumeSync()
│   │   │   ├── stopSync()
│   │   │   ├── restartSync()
│   │   │   └── clearUserData()
│   │   ├── webhook.controller.ts             # Handle Google push notifications
│   │   │   └── handleWebhook()
│   │   └── batch.controller.ts               # Batch sync operations
│   │       ├── continueBatch()
│   │       ├── retryFailedEvents()
│   │       ├── getBatchStatus()
│   │       ├── cancelBatchSync()
│   │       └── testBatch()
│   │
│   ├── services/
│   │   ├── index.ts                          # Service exports
│   │   ├── google-auth.service.ts            # Google OAuth client management
│   │   │   ├── createOAuth2Client()
│   │   │   ├── generateAuthUrl()
│   │   │   ├── handleOAuthCallback()
│   │   │   ├── getAuthClient()
│   │   │   ├── revokeAccess()
│   │   │   ├── hasValidTokens()
│   │   │   ├── getUserData()
│   │   │   └── setTargetCalendar()
│   │   ├── google-calendar.service.ts        # Google Calendar API calls
│   │   │   ├── getCalendarClient()
│   │   │   ├── listCalendars()
│   │   │   ├── getCalendar()
│   │   │   ├── listEvents()
│   │   │   ├── getEvent()
│   │   │   ├── createEvent()
│   │   │   ├── updateEvent()
│   │   │   ├── deleteEvent()
│   │   │   ├── watchCalendar()
│   │   │   ├── stopWatch()
│   │   │   └── withRateLimit()
│   │   ├── google-calendar-batch.service.ts  # Batch Calendar API operations
│   │   │   ├── batchCreateEvents()
│   │   │   └── batchUpdateEvents()
│   │   ├── sync-token.service.ts             # Sync token storage and retrieval
│   │   ├── watch-channel.service.ts          # Watch channel creation, renewal, stopping
│   │   │   ├── createWatchChannel()
│   │   │   ├── renewWatchChannel()
│   │   │   ├── deleteWatchChannel()
│   │   │   ├── getUserWatchChannels()
│   │   │   ├── getWatchChannel()
│   │   │   ├── pauseWatchChannel()
│   │   │   ├── resumeWatchChannel()
│   │   │   ├── renewExpiringWatchChannels()
│   │   │   └── cleanupOrphanedWatches()
│   │   ├── event-sync.service.ts             # Event synchronization logic
│   │   │   ├── event-sync.service.test.ts    # Tests for event sync
│   │   │   ├── syncCalendarEvents()
│   │   │   └── syncEvent()
│   │   ├── batch-sync.service.ts             # Batch event synchronization
│   │   │   ├── batch-sync.service.test.ts    # Tests for batch sync
│   │   │   ├── batchSyncEvents()
│   │   │   ├── syncEventsBatchPaginated()
│   │   │   ├── batchSyncRoundRobin()
│   │   │   ├── getBatchSyncProgress()
│   │   │   └── resetBatchSyncState()
│   │   ├── batch-state.service.ts            # Batch state management
│   │   │   ├── initializeBatchState()
│   │   │   ├── getBatchState()
│   │   │   ├── updateBatchState()
│   │   │   ├── completeBatchState()
│   │   │   ├── failBatchState()
│   │   │   ├── getBatchProgress()
│   │   │   ├── cleanupBatchStates()
│   │   │   └── cancelAllBatches()
│   │   ├── cloud-tasks.service.ts            # Google Cloud Tasks integration
│   │   │   ├── getCloudTasksClient()
│   │   │   ├── createBatchTask()
│   │   │   ├── createRetryTask()
│   │   │   ├── getQueuePath()
│   │   │   ├── deleteTask()
│   │   │   └── listPendingTasks()
│   │   └── unified-calendar.service.ts       # Merge multiple calendars into one view
│   │
│   ├── middleware/
│   │   ├── index.ts                          # Middleware exports
│   │   ├── auth.middleware.ts                # Verify user authentication
│   │   │   ├── requireAuth()
│   │   │   ├── optionalAuth()
│   │   │   └── validateUserId()
│   │   ├── webhook-verification.middleware.ts # Verify Google webhook signatures
│   │   │   ├── verifyWebhook()
│   │   │   └── handleSyncState()
│   │   ├── cloud-tasks-auth.middleware.ts    # Verify Cloud Tasks requests
│   │   │   ├── verifyCloudTasksAuth()
│   │   │   ├── validateOIDCToken()
│   │   │   └── isAuthorizedServiceAccount()
│   │   └── error-handler.middleware.ts       # Global error handling
│   │       ├── ApiError class
│   │       ├── errorHandler()
│   │       ├── notFoundHandler()
│   │       └── asyncHandler()
│   │
│   ├── models/
│   │   ├── index.ts                          # Model exports
│   │   ├── user.model.ts                     # User account data
│   │   │   └── User class
│   │   ├── calendar-connection.model.ts      # Connected calendar metadata
│   │   │   └── CalendarConnectionModel class
│   │   ├── sync-state.model.ts               # Sync tokens and last sync times
│   │   │   └── SyncStateModel class
│   │   ├── watch-channel.model.ts            # Active watch channel info
│   │   │   └── WatchChannel class
│   │   └── unified-event.model.ts            # Unified event format
│   │       └── UnifiedEventModel class
│   │
│   ├── db/
│   │   ├── index.ts                          # Database exports
│   │   └── firestore.ts                      # Firestore client setup
│   │       ├── initializeFirestore()
│   │       ├── getFirestore()
│   │       ├── getCollection()
│   │       ├── getTypedCollection()
│   │       ├── db object (CRUD operations)
│   │       └── closeFirestore()
│   │
│   ├── jobs/
│   │   ├── channel-renewal.job.ts            # Background job to renew expiring channels (placeholder)
│   │   ├── periodic-sync.job.ts              # Backup periodic sync job (placeholder)
│   │   └── cleanup.job.ts                    # Clean up stale connections (placeholder)
│   │
│   ├── utils/
│   │   ├── index.ts                          # Utility exports
│   │   ├── logger.ts                         # Logging utility
│   │   │   ├── LogLevel enum
│   │   │   ├── logger instance
│   │   │   └── createLogger()
│   │   ├── crypto.ts                         # Encryption for tokens
│   │   │   ├── generateState()
│   │   │   ├── generateChannelId()
│   │   │   ├── sha256()
│   │   │   ├── generateToken()
│   │   │   ├── isValidUUID()
│   │   │   └── generateCompositeKey()
│   │   └── date-helpers.ts                   # Date/time utilities
│   │       ├── date-helpers.test.ts          # Tests for date helpers
│   │       ├── formatDuration()
│   │       ├── now()
│   │       ├── daysFromNow()
│   │       ├── hoursFromNow()
│   │       ├── minutesFromNow()
│   │       ├── isExpired()
│   │       ├── isExpiringSoon()
│   │       ├── formatDate()
│   │       ├── sleep()
│   │       ├── parseCalendarDateTime()
│   │       ├── toCalendarDateTime()
│   │       └── timeUntilExpiration()
│   │
│   ├── types/
│   │   ├── index.ts                          # Type exports
│   │   ├── batch.types.ts                    # Batch sync types
│   │   ├── calendar.types.ts                 # Calendar-related types
│   │   ├── sync.types.ts                     # Sync operation types
│   │   └── watch.types.ts                    # Watch channel types
│   │
│   ├── config/
│   │   ├── index.ts                          # Config exports
│   │   │   └── validateAllConfig()
│   │   ├── google.config.ts                  # Google OAuth credentials
│   │   │   ├── GOOGLE_CONFIG
│   │   │   └── validateGoogleConfig()
│   │   ├── app.config.ts                     # App configuration
│   │   │   ├── APP_CONFIG
│   │   │   └── validateAppConfig()
│   │   └── database.config.ts                # Database configuration
│   │       ├── DB_CONFIG
│   │       └── getCollectionPath()
│   │
│   └── test-utils/
│       ├── setup.ts                          # Test setup and global mocks
│       └── mocks.ts                          # Reusable test mocks
│
├── .env.example                              # Environment variables template
├── .env                                      # Actual environment variables (gitignored)
├── package.json
└── README.md
```

## Architecture Overview

### API Routes
- **Auth Routes**: OAuth 2.0 flow for Google Calendar API access
- **Calendar Routes**: List and manage connected calendars
- **Sync Routes**: Trigger and manage synchronization operations
- **Webhook Routes**: Receive Google Calendar push notifications
- **Batch Routes**: Handle batch synchronization with Cloud Tasks
- **Health Routes**: Service health and status checks

### Services Layer
- **Google Auth**: OAuth 2.0 client management, token refresh
- **Google Calendar**: Direct Google Calendar API interactions
- **Google Calendar Batch**: Batch API operations for efficiency
- **Watch Channel**: Push notification channel lifecycle management
- **Event Sync**: Single event synchronization logic with Airbnb detection
- **Batch Sync**: Paginated batch synchronization with round-robin self-triggering
- **Batch State**: Batch operation state management in Firestore
- **Cloud Tasks**: Google Cloud Tasks integration for async processing
- **Sync Token**: Incremental sync token management
- **Unified Calendar**: Multi-calendar aggregation

### Data Layer
- **Firestore**: NoSQL database for user data, sync state, watch channels
- **Models**: Type-safe data model classes
- **Types**: TypeScript type definitions

### Middleware
- **Auth**: JWT/session-based authentication
- **Webhook Verification**: Verify Google webhook signatures
- **Cloud Tasks Auth**: Verify OIDC tokens from Cloud Tasks
- **Error Handler**: Centralized error handling and logging

### Testing
Tests are co-located with source files:
- `services/batch-sync.service.test.ts` - Batch sync tests (34 tests)
- `services/event-sync.service.test.ts` - Event sync tests (13 tests)
- `utils/date-helpers.test.ts` - Date utility tests (14 tests)

Run tests: `pnpm test`

## Environment Variables

See `.env.example` for required environment variables.

## Deployment

The GCP backend is deployed as a Cloud Run service with Cloud Tasks integration for batch processing.
