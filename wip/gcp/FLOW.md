# Calendar Sync Data Flow

```
================================================================================
LAYER 1: USER INITIALIZATION
================================================================================

[User Browser]
    |
    +-> NextJS: /api/auth/login -> generateAuthUrl()
    |       +-> Redirect to Google OAuth
    |
    +-> [User approves OAuth]
    |
    +-> NextJS: /api/oauth/callback -> handleOAuthCallback()
            |
            +-> Exchange code for tokens
            +-> Get userId from Google
            +-> Firestore: users/{userId} (store tokens)
            +-> NextJS: Create iron-session


================================================================================
LAYER 2: WATCH CHANNEL SETUP
================================================================================

[User: Select calendars to sync]
    |
    +-> NextJS: POST /api/sync/setup
            |
            +-> GCP: POST /calendars/watch
                    |
                    +-> watchChannelService.createWatchChannel()
                            |
                            +-> Google Calendar API: watch()
                            |       +-> Returns: channelId, resourceId
                            |
                            +-> Firestore: watches/{channelId}
                                    {
                                      channelId, resourceId,
                                      userId, calendarId, targetCalendarId,
                                      expiration, syncState: 'pending'
                                    }


================================================================================
LAYER 3: INITIAL SYNC (Round-Robin)
================================================================================

[Trigger: User action or Cloud Scheduler]
    |
    +-> GCP: POST /sync/trigger
            |
            +-> syncController.triggerBatchSync()
                    |
                    +-> batchSyncService.batchSyncRoundRobin(userId)
                            |
                            +-> Firestore: Query watches WHERE userId = X
                            |
                            +-> Get round-robin state: syncState/roundrobin_{userId}
                            |       +-> currentIndex (which calendar to sync)
                            |
                            +-> Fetch first page (50 events)
                              |
                              +-> Small sync (<10 events, no pagination)?
                              |       +-> eventSyncService.syncEvent() for each
                              |           +-> getEvent()
                              |           +-> transformEventData() [utils]
                              |           +-> createEvent() / updateEvent()
                              |           +-> Firestore: eventMappings/{compositeKey}
                              |
                              +-> Large sync (>=10 events OR pagination)?
                                      |
                                      +-> Firestore: batchStates/{batchStateId}
                                      |       {
                                      |         userId, calendarId, targetCalendarId,
                                      |         batchNumber: 1, currentPageToken: null,
                                      |         status: 'pending'
                                      |       }
                                      |
                                      +-> syncEventsBatchPaginated()
                                              |
                                              +-> listEvents(pageToken, syncToken)
                                              +-> For each event:
                                              |   +-> Check eventMappings
                                              |   +-> transformEventData() [utils]
                                              |   +-> Mapping exists?
                                              |       +-> Has syncToken? -> updateOps[]
                                              |       +-> No syncToken?  -> SKIP (already synced)
                                              |   +-> No mapping? -> createOps[]
                                              |
                                              +-> batchCreateEvents() [Google Batch API]
                                              +-> batchUpdateEvents() [Google Batch API] (only if syncToken)
                                              |
                                              +-> More pages?
                                              |   +-> cloudTasksService.createBatchTask()
                                              |       |
                                              |       +-> Cloud Tasks: Schedule +10s
                                              |               +-> POST /batch/continue
                                              |                   +-> batchController.continueBatch()
                                              |                       +-> [Loop back to syncEventsBatchPaginated]
                                              |
                                              +-> Last page?
                                                  +-> Firestore: watches/{channelId}
                                                  |       +-> syncToken, syncState: 'completed'
                                                  |
                                                  +-> Firestore: syncState/roundrobin_{userId}
                                                          +-> currentIndex++ (next calendar)
                            |
                            +-> Self-trigger next calendar?
                                    +-> HTTP POST /sync/trigger (userId)


================================================================================
LAYER 4: INCREMENTAL SYNC (Scheduler-driven)
================================================================================

[Google Calendar: Event changed]
    |
    +-> GCP: POST /webhook (x-goog-channel-id header)
            |
            +-> webhookController.handleWebhook()
                    |
                    +-> Validate channel ID
                    +-> Firestore: watches/{channelId}
                        +-> pendingChanges: true
                        +-> lastChangeNotification: timestamp
                        +-> Return 200 immediately (fast!)


[Cloud Scheduler: Every 15 minutes]
    |
    +-> GCP: POST /scheduler/incremental
            |
            +-> schedulerController.runIncrementalSync()
                    |
                    +-> incrementalSyncService.processIncrementalChanges()
                            |
                            +-> Firestore: Query watches WHERE pendingChanges = true
                            |
                            +-> For each watch with pending changes:
                                |
                                +-> batchSyncService.syncEventsBatchPaginated()
                                |       |
                                |       +-> listEvents(syncToken)  <- Google pre-filters!
                                |       +-> For each event:
                                |       |   +-> Check eventMappings
                                |       |   +-> transformEventData() [utils]
                                |       |   +-> Mapping exists? -> UPDATE
                                |       |   +-> No mapping? -> CREATE
                                |       |
                                |       +-> batchCreateEvents() / batchUpdateEvents()
                                |       +-> Automatic pagination (handles any volume)
                                |
                                +-> Firestore: watches/{channelId}
                                        +-> pendingChanges: false
                                        +-> syncToken: newSyncToken
                                        +-> lastSyncedAt: timestamp


================================================================================
LAYER 5: MAINTENANCE (Cloud Scheduler)
================================================================================

[Cloud Scheduler: Daily 2am]
    |
    +-> GCP: POST /calendars/renew-watches
            |
            +-> watchChannelService.renewExpiringWatchChannels()
                    |
                    +-> Firestore: Get all watches
                    +-> Filter: expiration < now + 24 hours
                    |
                    +-> For each expiring watch:
                        +-> Google Calendar API: stopWatch()
                        +-> Google Calendar API: watchCalendar()
                        +-> Firestore: DELETE watches/{oldChannelId}
                        +-> Firestore: CREATE watches/{newChannelId}


================================================================================
KEY SERVICES BY LAYER
================================================================================

NextJS Layer:
  - api/auth/login.ts              -> Generate OAuth URL
  - api/oauth/callback.ts          -> Exchange code, store tokens
  - api/sync/setup.ts              -> Call GCP to create watches

GCP Layer (Express Routes):
  - routes/auth.routes.ts          -> /auth/*
  - routes/calendar.routes.ts      -> /calendars/watch
  - routes/webhook.routes.ts       -> /webhook (Google push notifications)
  - routes/sync.routes.ts          -> /sync/trigger, /sync/pause, /sync/resume
  - routes/batch.routes.ts         -> /batch/continue (Cloud Tasks callback)
  - routes/scheduler.routes.ts     -> /scheduler/incremental, /scheduler/renew-watches

GCP Layer (Controllers):
  - auth.controller.ts             -> generateAuthUrl(), handleOAuthCallback()
  - calendar.controller.ts         -> createWatch()
  - webhook.controller.ts          -> handleWebhook() (sets pendingChanges flag)
  - scheduler.controller.ts        -> runIncrementalSync(), runWatchRenewal()
  - sync.controller.ts             -> triggerBatchSync(), pauseSync(), resumeSync()
  - batch.controller.ts            -> continueBatch()

GCP Layer (Services):
  - google-auth.service.ts         -> OAuth2 client management
  - watch-channel.service.ts       -> createWatchChannel(), renewWatchChannel()
  - incremental-sync.service.ts    -> processIncrementalChanges()
  - batch-sync.service.ts          -> batchSyncRoundRobin(), syncEventsBatchPaginated()
  - google-calendar.service.ts     -> listEvents(), getEvent(), createEvent(), updateEvent()
  - google-calendar-batch.service.ts -> batchCreateEvents(), batchUpdateEvents()
  - cloud-tasks.service.ts         -> createBatchTask()

GCP Layer (Utils):
  - event-transformer.ts           -> isAirbnbEvent(), transformEventData()

External Services:
  - Cloud Scheduler                -> Daily watch renewal trigger
  - Cloud Tasks                    -> Batch pagination continuation
  - Firestore                      -> users, watches, eventMappings, batchStates, syncState
  - Google Calendar API            -> OAuth, Events, Push Notifications


================================================================================
FIRESTORE COLLECTIONS
================================================================================

users/{userId}
  - accessToken, refreshToken, tokenExpiry
  - email, createdAt, lastLogin

watches/{channelId}
  - userId, calendarId, targetCalendarId
  - resourceId, expiration, paused
  - syncState { status, startedAt, processedEvents }
  - syncToken (for incremental sync)
  - pendingChanges (flag for scheduler)
  - lastChangeNotification, lastSyncedAt

eventMappings/{sourceCalendarId}_{sourceEventId}
  - sourceCalendarId, sourceEventId, targetEventId
  - lastSynced

batchStates/{batchStateId}
  - userId, calendarId, targetCalendarId
  - batchNumber, currentPageToken, initialSyncToken
  - processedEvents, status

syncState/roundrobin_{userId}
  - currentIndex (which calendar to sync next)


================================================================================
CRITICAL DECISION POINTS
================================================================================

1. Initial vs Incremental Sync?
   - Has syncToken? -> Incremental (Google pre-filters changes)
   - No syncToken?  -> Initial full sync

2. Always Use Batch API
   - All syncing uses batch API (1 event or 1000 events)
   - No threshold logic - single code path
   - Pagination handles any volume

3. Create vs Update Event?
   - eventMapping exists?
     - Initial sync:       -> SKIP (already synced in previous attempt)
     - Incremental sync:   -> UPDATE (Google pre-filtered this event)
   - No eventMapping?      -> CREATE (new event)

4. Continue Batch?
   - nextPageToken exists? -> Cloud Tasks: POST /batch/continue (+10s)
   - No nextPageToken?     -> Save syncToken, mark completed
```
