# GCP Migration Task Files

This directory contains detailed task documentation for migrating from the fragmented 5-function architecture to a consolidated, well-organized Cloud Function.

## Quick Navigation

### Start Here
- **[00_OVERVIEW.md](00_OVERVIEW.md)** - Read this first! Complete migration overview, dependencies, timeline

### Task Files (in order)

#### Phase 1: Foundation (7-12 hours)
1. [Migrate JS to TS](01_TASK_migrate_js_to_ts.md) - Convert skeleton files to TypeScript
2. [Setup Config Files](02_TASK_setup_config_files.md) - Centralized configuration
3. [Create Type Definitions](03_TASK_create_type_definitions.md) - Port and organize types
4. [Create Utilities](04_TASK_create_utility_functions.md) - Logger, crypto, date helpers
5. [Create Database Service](05_TASK_create_database_service.md) - Firestore abstraction

#### Phase 2: Services (15-20 hours)
6. [Google Auth Service](06_TASK_create_google_auth_service.md) - OAuth2 flow
7. [Google Calendar Service](07_TASK_create_google_calendar_service.md) - Calendar API wrapper
8. [Event Sync Service](08_TASK_create_event_sync_service.md) - **Includes Airbnb feature!**
9. [Batch Sync Service](09_TASK_create_batch_sync_service.md) - Large-scale syncing
10. [Watch Channel Service](10_TASK_create_watch_channel_service.md) - Webhook management

#### Phase 3: API Layer (9-13 hours)
11. [Create Middleware](11_TASK_create_middleware.md) - Auth, webhook validation, errors
12. [Create Controllers](12_TASK_create_controllers.md) - Request handlers
13. [Create Routes](13_TASK_create_routes.md) - API endpoints
14. [Create Main App](14_TASK_create_main_app.md) - Express app entry point

#### Phase 4: Deployment & Testing (16-23 hours)
15. [Deployment Config](15_TASK_create_deployment_config.md) - Scripts and configuration
16. [Setup Tests](16_TASK_create_tests.md) - Jest configuration and example tests
17. [Integration Testing](17_TASK_integration_testing.md) - End-to-end testing
18. [Final Deployment](18_TASK_final_deployment.md) - Production deployment
19. [Port Existing Tests](19_TASK_port_existing_tests.md) - **Migrate 2,165 lines of tests!**
20. [Setup CI/CD Pipeline](20_TASK_setup_cicd_pipeline.md) - **Automated testing & deployment**

## Total Effort

**47-68 hours** (~1.5-2 weeks of focused work)

## Key Features

✅ **Airbnb Event Handling** - Automatically adds `__EVENT__` marker to Airbnb events
✅ **30-50% Cost Reduction** - From $15-20/mo to $10-12/mo
✅ **Better Organization** - Routes/Controllers/Services pattern
✅ **Type Safety** - TypeScript throughout
✅ **Comprehensive Tests** - Port existing 2,165 lines of tests
✅ **Single Deployment** - One command deploys everything
✅ **CI/CD Pipeline** - Automated testing and deployment

## Quick Start

```bash
# 1. Read the overview
cat 00_OVERVIEW.md

# 2. Start with Task 01
cat 01_TASK_migrate_js_to_ts.md

# 3. Follow tasks in order
# Each task has:
#   - Step-by-step instructions
#   - Complete code examples
#   - Validation checklists
#   - Testing procedures
```

## Task Dependencies

```
01 (JS→TS) → 02 (Config) → 03 (Types) → 04 (Utils) → 05 (DB)
                                                        ↓
                                                   06 (Auth)
                                                        ↓
                                                   07 (Calendar)
                                                        ↓
                            ┌───────────────────────────┴───────────┐
                            ↓                           ↓           ↓
                      08 (Event Sync)           09 (Batch)    10 (Watch)
                            └───────────────────────────┬───────────┘
                                                        ↓
                                                   11 (Middleware)
                                                        ↓
                                                   12 (Controllers)
                                                        ↓
                                                   13 (Routes)
                                                        ↓
                                                   14 (Main App)
                                                        ↓
                                          ┌─────────────┴────────────┐
                                          ↓                          ↓
                                     15 (Deploy)                16 (Tests)
                                          └─────────────┬────────────┘
                                                        ↓
                                                   17 (Integration)
                                                        ↓
                                                   18 (Production)
                                                        ↓
                                                   19 (Port Tests)
```

## Progress Tracking

Track your progress:

- [ ] Phase 1: Foundation (Tasks 01-05)
- [ ] Phase 2: Services (Tasks 06-10)
- [ ] Phase 3: API Layer (Tasks 11-14)
- [ ] Phase 4: Deployment & Testing (Tasks 15-20)

## Architecture Comparison

### Before (functions/calendar-sync/)
```
5 separate Cloud Functions
$15-20/month cost
Duplicated dependencies
Complex deployments
```

### After (gcp/)
```
1 consolidated Cloud Function
$10-12/month cost (30-50% savings)
Shared dependencies
Single deployment
Clean architecture (routes/controllers/services)
```

## Getting Help

Each task file includes:
- ✅ Detailed step-by-step instructions
- ✅ Complete code examples (copy-paste ready)
- ✅ Validation checklists
- ✅ Testing procedures
- ✅ Troubleshooting tips
- ✅ Links to related tasks

## Special Features

### Airbnb Event Handling

The migration **preserves your custom Airbnb feature** that adds `__EVENT__` to event descriptions.

**Location in new code:** `gcp/src/services/event-sync.service.ts`

See Task 08 for details.

### Existing Tests

You already have **2,165 lines of comprehensive tests** in `functions/calendar-sync/*.test.ts`.

Task 19 shows how to port them to the new structure.

## Success Criteria

After completing all tasks:

- [ ] Single consolidated function deployed
- [ ] All routes functional
- [ ] OAuth flow working
- [ ] Airbnb feature working
- [ ] Tests passing (>80% coverage)
- [ ] Cost savings realized
- [ ] Old functions deleted

## Questions?

Each task file is self-contained with all the information you need. Start with `00_OVERVIEW.md` and follow the tasks in order.

**Happy migrating! 🚀**
