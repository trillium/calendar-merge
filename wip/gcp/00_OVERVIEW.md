# GCP Migration - Task Overview

**Created:** 2025-11-13
**Status:** Not Started
**Goal:** Migrate from `functions/calendar-sync/` (5 separate functions) to `/gcp` (1 consolidated function)

---

## Executive Summary

This directory contains **20 detailed task files** that guide the complete migration from the current fragmented architecture to a consolidated, well-organized Cloud Function structure.

### Why This Migration?

**Current State:** 5 separate Cloud Functions with duplicated code
**Target State:** 1 consolidated function with clean architecture (routes/controllers/services)

**Benefits:**
- 🚀 **30-50% cost reduction** ($15-20/mo → $10-12/mo)
- ⚡ **Faster deployments** (1 command vs 5)
- 🏗️ **Better organization** (services/controllers/routes pattern)
- 🔧 **Easier maintenance** (DRY principle, shared code)
- 🎯 **Type safety** (TypeScript throughout)
- 🤖 **Automated CI/CD** (tests + deployments)

---

## Task Breakdown

### Phase 1: Foundation (Tasks 01-05)

| Task | Description | Est. Time | Priority |
|------|-------------|-----------|----------|
| [01](01_TASK_migrate_js_to_ts.md) | Migrate .js to .ts | 2-3h | Critical |
| [02](02_TASK_setup_config_files.md) | Set up config files | 1-2h | Critical |
| [03](03_TASK_create_type_definitions.md) | Create type definitions | 1-2h | Critical |
| [04](04_TASK_create_utility_functions.md) | Create utilities | 2-3h | High |
| [05](05_TASK_create_database_service.md) | Create database service | 1-2h | Critical |

**Phase 1 Total:** 7-12 hours

### Phase 2: Services (Tasks 06-10)

| Task | Description | Est. Time | Priority |
|------|-------------|-----------|----------|
| [06](06_TASK_create_google_auth_service.md) | Google Auth service | 3-4h | Critical |
| [07](07_TASK_create_google_calendar_service.md) | Calendar API service | 2-3h | Critical |
| [08](08_TASK_create_event_sync_service.md) | Event sync (incl. Airbnb) | 4-5h | Critical |
| [09](09_TASK_create_batch_sync_service.md) | Batch sync service | 3-4h | High |
| [10](10_TASK_create_watch_channel_service.md) | Watch channel service | 3-4h | High |

**Phase 2 Total:** 15-20 hours

### Phase 3: API Layer (Tasks 11-14)

| Task | Description | Est. Time | Priority |
|------|-------------|-----------|----------|
| [11](11_TASK_create_middleware.md) | Express middleware | 2-3h | High |
| [12](12_TASK_create_controllers.md) | Controllers | 3-4h | High |
| [13](13_TASK_create_routes.md) | Routes | 2-3h | High |
| [14](14_TASK_create_main_app.md) | Main Express app | 2-3h | Critical |

**Phase 3 Total:** 9-13 hours

### Phase 4: Deployment & Testing (Tasks 15-20)

| Task | Description | Est. Time | Priority |
|------|-------------|-----------|----------|
| [15](15_TASK_create_deployment_config.md) | Deployment scripts | 2-3h | Critical |
| [16](16_TASK_create_tests.md) | Testing setup | 3-4h | Medium |
| [17](17_TASK_integration_testing.md) | Integration testing | 2-3h | High |
| [18](18_TASK_final_deployment.md) | Production deployment | 2-3h | Critical |
| [19](19_TASK_port_existing_tests.md) | Port existing tests | 4-6h | High |
| [20](20_TASK_setup_cicd_pipeline.md) | CI/CD pipeline | 3-4h | Medium |

**Phase 4 Total:** 16-23 hours

---

## Total Effort Estimate

**Total Time:** 47-68 hours (~1.5-2 weeks of focused work)

**Recommended Approach:**
1. Complete Phase 1 first (foundation)
2. Complete Phase 2 (services) - can do in parallel if multiple developers
3. Complete Phase 3 (API layer)
4. Complete Phase 4 (deployment & testing)

---

## Key Features Included

### ✅ Airbnb Event Handling

The migration **preserves and enhances** the Airbnb event handling feature:

**Location:** `gcp/src/services/event-sync.service.ts`

```typescript
// Automatically detects Airbnb events and adds __EVENT__ marker
const isAirbnbEvent =
  sourceEvent.summary?.toLowerCase().includes('airbnb') ||
  sourceEvent.organizer?.email?.toLowerCase().includes('airbnb') ||
  sourceEvent.creator?.email?.toLowerCase().includes('airbnb') ||
  sourceEvent.attendees?.some(attendee =>
    attendee.email?.toLowerCase().includes('airbnb')
  );

if (isAirbnbEvent) {
  description = description ? `__EVENT__\n\n${description}` : '__EVENT__';
}
```

**Benefits:**
- Easier to extend for other domains (VRBO, Booking.com, etc.)
- Centralized in `transformEventData()` function
- Well-tested and documented

### ✅ Other Key Features

- **Round-robin batch sync** - Process multiple calendars efficiently
- **Automatic watch renewal** - Keep webhooks active
- **Rate limiting** - Respect Google API quotas
- **Error handling** - Graceful degradation
- **Progress tracking** - Real-time sync status
- **Backward compatibility** - Works with existing data
- **CI/CD pipeline** - Automated testing and deployment
- **Comprehensive tests** - 2,165+ lines of tests ported

---

## Quick Start

### Option 1: Sequential Execution

```bash
# Start with Task 01
cd /Users/trilliumsmith/code/calendar-merge-service/gcp

# Follow tasks in order
cat wip/gcp/01_TASK_migrate_js_to_ts.md
# Complete Task 01...

cat wip/gcp/02_TASK_setup_config_files.md
# Complete Task 02...

# ... continue through Task 20
```

### Option 2: Parallel Execution (if multiple developers)

**Developer 1:** Tasks 01-05 (Foundation)
**Developer 2:** Tasks 06-10 (Services) - can start after Task 05
**Developer 3:** Tasks 11-14 (API Layer) - can start after Task 10
**Developer 4:** Tasks 15-20 (Deployment) - final integration

---

## Current vs Target Architecture

### Current (functions/calendar-sync/)

```
functions/calendar-sync/
├── index.ts              (exports 5 functions)
├── api.ts                (API routes)
├── auth.ts               (OAuth)
├── batchSync.ts          (batch sync)
├── control.ts            (sync control)
├── oauth.ts              (token management)
├── sync.ts               (event sync + Airbnb feature)
├── watch.ts              (watch management)
└── types.ts              (types)

Deployment: 5 separate functions
Cost: $15-20/month
Tests: 2,165 lines (Vitest)
```

### Target (gcp/)

```
gcp/src/
├── config/               (centralized config)
├── types/                (type definitions)
├── models/               (data models)
├── utils/                (helpers)
├── db/                   (database service)
├── services/             (business logic)
│   ├── google-auth.service.ts
│   ├── google-calendar.service.ts
│   ├── event-sync.service.ts      ← Airbnb feature here
│   ├── batch-sync.service.ts
│   └── watch-channel.service.ts
├── middleware/           (Express middleware)
├── controllers/          (request handlers)
├── routes/               (API routes)
└── index.ts              (main Express app)

Deployment: 1 consolidated function
Cost: $10-12/month (30-50% savings)
Tests: 2,165+ lines (Jest)
CI/CD: GitHub Actions
```

---

## Dependencies

### External Dependencies

```json
{
  "dependencies": {
    "@google-cloud/firestore": "^7.10.0",
    "@google-cloud/tasks": "^6.2.1",
    "cors": "^2.8.5",
    "express": "^4.21.2",
    "googleapis": "^144.0.0"
  },
  "devDependencies": {
    "@jest/globals": "^30.2.0",
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/jest": "^30.0.0",
    "@types/node": "^22.10.2",
    "jest": "^30.2.0",
    "ts-jest": "^29.4.5",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
```

### Task Dependencies

```
01 (JS→TS) ─┬─→ 02 (Config) ───→ 03 (Types) ───→ 04 (Utils) ───→ 05 (DB)
            │                                                       │
            │                                                       ↓
            └─────────────────────────────────────────→ 06 (Auth Service)
                                                                   │
                                                                   ↓
                                              07 (Calendar Service)
                                                                   │
                     ┌─────────────────────────────────────────────┴─────────────┐
                     ↓                     ↓                     ↓               ↓
              08 (Event Sync)      09 (Batch Sync)      10 (Watch Service)
                     └─────────────────────────────────────────────┬───────────┘
                                                                   │
                                                                   ↓
                                                            11 (Middleware)
                                                                   │
                                                                   ↓
                                                            12 (Controllers)
                                                                   │
                                                                   ↓
                                                             13 (Routes)
                                                                   │
                                                                   ↓
                                                             14 (Main App)
                                                                   │
                     ┌─────────────────────────────────────────────┴─────────────────┐
                     ↓                     ↓                     ↓                   ↓
              15 (Deploy)            16 (Tests)          19 (Port Tests)      20 (CI/CD)
                     │                     │                     │                   │
                     └─────────────────────┴─────────────────────┴───────────────────┘
                                                                   │
                                                                   ↓
                                                           17 (Integration)
                                                                   │
                                                                   ↓
                                                           18 (Production)
```

---

## Success Criteria

After completing all tasks, you should have:

- [ ] Single consolidated Cloud Function deployed
- [ ] All routes functional and tested
- [ ] OAuth flow working
- [ ] Calendar syncing working
- [ ] Airbnb event marking working
- [ ] Webhooks processing correctly
- [ ] Batch sync completing successfully
- [ ] Cloud Scheduler jobs configured
- [ ] Frontend connected to new API
- [ ] Old functions deleted
- [ ] Cost savings realized (30-50%)
- [ ] Monitoring in place
- [ ] Tests passing (>80% coverage)
- [ ] CI/CD pipeline running
- [ ] Documentation updated

---

## Status Tracking

Mark tasks as you complete them:

**Phase 1: Foundation**
- [ ] 01 - Migrate JS to TS
- [ ] 02 - Setup config files
- [ ] 03 - Create type definitions
- [ ] 04 - Create utility functions
- [ ] 05 - Create database service

**Phase 2: Services**
- [ ] 06 - Create Google Auth service
- [ ] 07 - Create Google Calendar service
- [ ] 08 - Create event sync service (Airbnb)
- [ ] 09 - Create batch sync service
- [ ] 10 - Create watch channel service

**Phase 3: API Layer**
- [ ] 11 - Create middleware
- [ ] 12 - Create controllers
- [ ] 13 - Create routes
- [ ] 14 - Create main app

**Phase 4: Deployment & Testing**
- [ ] 15 - Create deployment config
- [ ] 16 - Create tests
- [ ] 17 - Integration testing
- [ ] 18 - Final deployment
- [ ] 19 - Port existing tests
- [ ] 20 - Setup CI/CD pipeline

---

## Getting Help

Each task file includes:
- ✅ Step-by-step instructions
- ✅ Complete code examples
- ✅ Validation checklists
- ✅ Testing procedures
- ✅ Troubleshooting tips
- ✅ Links to next tasks

**Read each task file carefully before starting!**

---

**Ready to start?** → Begin with [Task 01: Migrate JS to TS](01_TASK_migrate_js_to_ts.md)
