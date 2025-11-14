/
├── src/
│ ├── index.ts # Cloud function entry point, exports Express app
│ │
│ ├── routes/
│ │ ├── auth.routes.ts # OAuth flow routes
│ │ ├── calendar.routes.ts # Calendar management routes
│ │ ├── sync.routes.ts # Manual sync trigger routes
│ │ ├── webhook.routes.ts # Google webhook receiver routes
│ │ └── health.routes.ts # Health check / status routes
│ │
│ ├── controllers/
│ │ ├── auth.controller.ts # OAuth initiation, callback, token refresh
│ │ ├── calendar.controller.ts # List/add/remove calendars to sync
│ │ ├── sync.controller.ts # Perform sync operations
│ │ └── webhook.controller.ts # Handle Google push notifications
│ │
│ ├── services/
│ │ ├── google-auth.service.ts # Google OAuth client management
│ │ ├── google-calendar.service.ts # Google Calendar API calls
│ │ ├── sync-token.service.ts # Sync token storage and retrieval
│ │ ├── watch-channel.service.ts # Watch channel creation, renewal, stopping
│ │ ├── event-sync.service.ts # Event synchronization logic
│ │ └── unified-calendar.service.ts # Merge multiple calendars into one view
│ │
│ ├── middleware/
│ │ ├── auth.middleware.ts # Verify user authentication
│ │ ├── webhook-verification.middleware.ts # Verify Google webhook signatures
│ │ └── error-handler.middleware.ts # Global error handling
│ │
│ ├── models/
│ │ ├── user.model.ts # User account data
│ │ ├── calendar-connection.model.ts # Connected calendar metadata
│ │ ├── sync-state.model.ts # Sync tokens and last sync times
│ │ ├── watch-channel.model.ts # Active watch channel info
│ │ └── unified-event.model.ts # Unified event format
│ │
│ ├── db/
│ │ ├── firestore.ts # Firestore client setup (or your DB)
│ │ └── migrations/ # DB schema migrations if needed
│ │
│ ├── jobs/
│ │ ├── channel-renewal.job.ts # Background job to renew expiring channels
│ │ ├── periodic-sync.job.ts # Backup periodic sync job
│ │ └── cleanup.job.ts # Clean up stale connections
│ │
│ ├── utils/
│ │ ├── logger.ts # Logging utility
│ │ ├── crypto.ts # Encryption for tokens
│ │ └── date-helpers.ts # Date/time utilities
│ │
│ └── config/
│ ├── google.config.ts # Google OAuth credentials
│ ├── app.config.ts # App configuration
│ └── database.config.ts # Database configuration
│
├── .env.example # Environment variables template
├── .env # Actual environment variables (gitignored)
├── package.tson
└── README.md
