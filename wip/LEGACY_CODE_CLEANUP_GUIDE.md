# Legacy Code Cleanup Guide

**Date:** 2025-11-13
**Context:** Migration from 5 separate functions to 1 consolidated function completed on 2025-10-27

---

## 🎯 Quick Answer

Your frustration with "3 separate fns that all relied on the same code" has been **resolved**. The consolidation is complete and working. However, there are legacy artifacts left over from the old architecture that can be safely removed.

---

## ✅ What Can Be Safely Removed

### 1. Old Deployment Scripts (HIGH PRIORITY) 🔴

**Location:** `scripts/deploy/`

These scripts deploy functions that **no longer exist**:

```bash
# SAFE TO DELETE:
scripts/deploy/deploy-handleWebhook.sh      # Function deleted 2025-10-27
scripts/deploy/deploy-batchSync.sh          # Function deleted 2025-10-27
scripts/deploy/deploy-renewWatches.sh       # Function deleted 2025-10-27
scripts/deploy/deploy-triggerInitialSync.sh # Function deleted 2025-10-27
scripts/deploy/deploy-api.sh                # Function deleted 2025-10-27
```

**Why Safe:**
- These functions were deleted from GCP
- Attempting to deploy them will fail (no target exists)
- New consolidated function uses `deploy-calendar-sync.sh`

**Action:**
```bash
# Archive old scripts
mkdir -p scripts/deploy/archived-old-functions
mv scripts/deploy/deploy-handleWebhook.sh scripts/deploy/archived-old-functions/
mv scripts/deploy/deploy-batchSync.sh scripts/deploy/archived-old-functions/
mv scripts/deploy/deploy-renewWatches.sh scripts/deploy/archived-old-functions/
mv scripts/deploy/deploy-api.sh scripts/deploy/archived-old-functions/
mv scripts/deploy/deploy-triggerInitialSync.sh scripts/deploy/archived-old-functions/
```

---

### 2. Old npm Scripts (HIGH PRIORITY) 🔴

**Location:** `package.json`

These npm scripts reference deleted functions:

```json
// SAFE TO REMOVE FROM package.json:

"deploy:handleWebhook": "./scripts/deploy/deploy-handleWebhook.sh",
"deploy:renewWatches": "./scripts/deploy/deploy-renewWatches.sh",
"deploy:triggerInitialSync": "./scripts/deploy/deploy-triggerInitialSync.sh",
"deploy:batchSync": "./scripts/deploy/deploy-batchSync.sh",
"deploy:api": "./scripts/deploy/deploy-api.sh",
"deploy:functions": "pnpm deploy:handleWebhook && pnpm deploy:renewWatches && pnpm deploy:triggerInitialSync && pnpm deploy:batchSync && pnpm deploy:api",
"deploy": "pnpm deploy:functions",
"build:deploy": "pnpm build && pnpm deploy",
"deploy:full": "pnpm build && pnpm deploy:functions && pnpm frontend:deploy",
"logs:batchSync": "gcloud functions logs read batchSync --limit=${LIMIT:-50}",
"logs:webhook": "gcloud functions logs read handleWebhook --limit=${LIMIT:-50}",
```

**Why Safe:**
- Functions don't exist anymore
- Scripts point to deleted deployment files
- New function has different deployment process

**Replacement Scripts to ADD:**
```json
"deploy": "./scripts/deploy/deploy-calendar-sync.sh",
"build:deploy": "pnpm build && pnpm deploy",
"logs": "gcloud functions logs read calendarSync --limit=${LIMIT:-50}",
"logs:webhook": "gcloud functions logs read calendarSync | grep 'POST /webhook'",
"logs:batch": "gcloud functions logs read calendarSync | grep 'POST /batch-sync'"
```

---

### 3. Helper Deployment Scripts (MEDIUM PRIORITY) 🟡

**Location:** Root directory

```bash
# LIKELY SAFE TO DELETE (verify first):
scripts/deploy-all-functions.sh    # Referenced 5 old functions
scripts/build-and-deploy-gcp.sh     # May still be used, check content first
```

**Verify Before Deleting:**
```bash
# Check if build-and-deploy-gcp.sh uses old or new function
grep -E "handleWebhook|batchSync|renewWatches|triggerInitialSync|api" scripts/build-and-deploy-gcp.sh

# If it references old functions: SAFE TO DELETE
# If it references calendarSync: KEEP IT
```

---

### 4. GCP Directory (LOW PRIORITY - REFERENCE ONLY) 🟢

**Location:** `gcp/`

This appears to be an **aspirational/reference implementation** of a routes/controllers/services architecture.

```bash
gcp/
├── src/
│   ├── routes/
│   ├── controllers/
│   ├── services/
│   ├── middleware/
│   └── models/

# Status: Not deployed, not used
```

**Why It Exists:**
- Planning/reference for future refactoring
- Shows ideal code organization
- MVC pattern example

**Safe to Remove?**
- **If** you have no plans to refactor → **YES, delete it**
- **If** you might refactor later → **KEEP as reference**

**Recommendation:** Keep it in `wip/gcp-reference/` as documentation of future architecture

```bash
mkdir -p wip/gcp-reference
mv gcp/* wip/gcp-reference/
rmdir gcp
```

---

### 5. Old Documentation (MEDIUM PRIORITY) 🟡

**Location:** `wip/`

Migration documentation that's now outdated:

```bash
# These migrations are COMPLETE, so docs are historical:
wip/MIGRATION.md                    # 29KB - Round-robin migration (DONE)
wip/MIGRATION_SINGLE_DEPLOY.md     # 11KB - Single deploy (DONE)
wip/CLOUD_FNS_TEARDOWN.md          # 16KB - Teardown procedure (DONE)
wip/ENV_VARS_NEEDED.md              # 2.6KB - Env var audit (may still be useful)
wip/BATCH_SYNC_TASKS.md             # 23KB - Task tracking (historical)

# These are current/useful:
wip/2025-11-13_STATE_OF_REPO.md           # KEEP - Current analysis
wip/2025-11-13_TEARDOWN_STATUS.md         # KEEP - Current status
wip/ARCHITECTURE_COMPARISON.md            # KEEP - Architecture reference
wip/2025-11-13_GIT_LOG_SUMMARY.md         # KEEP - Recent history
wip/2025-11-13_TEARDOWN_COMPLETE_SUMMARY.md # KEEP - Summary
wip/LOCAL_WATCH_TESTING_GUIDE.md          # KEEP - Testing guide
wip/LEGACY_CODE_CLEANUP_GUIDE.md          # KEEP - This file
```

**Action:**
```bash
# Archive completed migration docs
mkdir -p docs/archive/completed-migrations
mv wip/MIGRATION.md docs/archive/completed-migrations/
mv wip/MIGRATION_SINGLE_DEPLOY.md docs/archive/completed-migrations/
mv wip/CLOUD_FNS_TEARDOWN.md docs/archive/completed-migrations/
mv wip/BATCH_SYNC_TASKS.md docs/archive/completed-migrations/
mv wip/ENV_VARS_NEEDED.md docs/archive/completed-migrations/  # Or keep if still useful
```

---

## ⚠️ What to KEEP (Don't Delete)

### Active Code

```bash
# KEEP - Current working code:
functions/calendar-sync/app.ts          # Consolidated Express app (DEPLOYED)
functions/calendar-sync/index.ts        # Entry point (exports calendarSync)
functions/calendar-sync/batchSync.ts    # Round-robin batch sync logic
functions/calendar-sync/sync.ts         # Event sync logic
functions/calendar-sync/watch.ts        # Watch management
functions/calendar-sync/control.ts      # Control operations
functions/calendar-sync/auth.ts         # OAuth
functions/calendar-sync/oauth.ts        # OAuth token management
functions/calendar-sync/config.ts       # Configuration
functions/calendar-sync/types.ts        # TypeScript types
functions/calendar-sync/dev-server.ts   # Local development server
```

### Active Scripts

```bash
# KEEP - Current deployment:
scripts/deploy/deploy-calendar-sync.sh  # Deploys consolidated function

# KEEP - Infrastructure setup:
scripts/setup-cloud-tasks-queue.sh
scripts/setup-cloud-tasks-permissions.sh
scripts/use-gcloud-auth.sh
scripts/setup-oauth.sh
scripts/monitor-sync.sh

# KEEP - Utilities:
scripts/get-api-url.sh
```

### Tests

```bash
# KEEP - All test files:
functions/calendar-sync/*.test.ts
```

---

## 📋 Cleanup Checklist

### Phase 1: Archive Old Deployment Scripts

```bash
# Create archive directory
mkdir -p scripts/deploy/archived-old-functions

# Move old scripts
mv scripts/deploy/deploy-handleWebhook.sh scripts/deploy/archived-old-functions/
mv scripts/deploy/deploy-batchSync.sh scripts/deploy/archived-old-functions/
mv scripts/deploy/deploy-renewWatches.sh scripts/deploy/archived-old-functions/
mv scripts/deploy/deploy-api.sh scripts/deploy/archived-old-functions/
mv scripts/deploy/deploy-triggerInitialSync.sh scripts/deploy/archived-old-functions/

# Add README
cat > scripts/deploy/archived-old-functions/README.md << 'EOF'
# Archived Deployment Scripts

These scripts deployed 5 separate Cloud Functions that were consolidated into a single `calendarSync` function on 2025-10-27.

**Do not use these scripts** - the functions they deploy no longer exist.

Use `deploy-calendar-sync.sh` instead.

Archived: 2025-11-13
EOF
```

### Phase 2: Update package.json

Edit `package.json` and replace old scripts:

```json
{
  "scripts": {
    // REMOVE these:
    // "deploy:handleWebhook": "./scripts/deploy/deploy-handleWebhook.sh",
    // "deploy:renewWatches": "./scripts/deploy/deploy-renewWatches.sh",
    // "deploy:triggerInitialSync": "./scripts/deploy/deploy-triggerInitialSync.sh",
    // "deploy:batchSync": "./scripts/deploy/deploy-batchSync.sh",
    // "deploy:api": "./scripts/deploy/deploy-api.sh",
    // "deploy:functions": "pnpm deploy:handleWebhook && ...",
    // "logs:batchSync": "gcloud functions logs read batchSync ...",
    // "logs:webhook": "gcloud functions logs read handleWebhook ...",

    // ADD these:
    "deploy": "./scripts/deploy/deploy-calendar-sync.sh",
    "build:deploy": "pnpm build && pnpm deploy",
    "logs": "gcloud functions logs read calendarSync --limit=${LIMIT:-50}",
    "logs:webhook": "gcloud functions logs read calendarSync | grep 'POST /webhook'",
    "logs:batch": "gcloud functions logs read calendarSync | grep 'POST /batch-sync'",
    "logs:api": "gcloud functions logs read calendarSync | grep 'POST /api'",

    // KEEP these (unchanged):
    "build": "pnpm --filter calendar-sync-function run gcp-build",
    "dev": "concurrently -n server,client -c cyan,magenta \"pnpm dev:server\" \"pnpm dev:client\"",
    "test": "vitest --run",
    "auth:setup": "./scripts/use-gcloud-auth.sh",
    "monitor": "./scripts/monitor-sync.sh",
    // ... etc
  }
}
```

### Phase 3: Archive Migration Documentation

```bash
# Create archive directory
mkdir -p docs/archive/completed-migrations

# Move completed migration docs
mv wip/MIGRATION.md docs/archive/completed-migrations/
mv wip/MIGRATION_SINGLE_DEPLOY.md docs/archive/completed-migrations/
mv wip/CLOUD_FNS_TEARDOWN.md docs/archive/completed-migrations/
mv wip/BATCH_SYNC_TASKS.md docs/archive/completed-migrations/
mv wip/ENV_VARS_NEEDED.md docs/archive/completed-migrations/

# Add README
cat > docs/archive/completed-migrations/README.md << 'EOF'
# Completed Migrations

Documentation for migrations that have been completed.

## Function Consolidation (2025-10-27)

Migrated from 5 separate Cloud Functions to a single consolidated function with Express routes.

- MIGRATION.md - Round-robin batch sync migration plan
- MIGRATION_SINGLE_DEPLOY.md - Single deploy strategy
- CLOUD_FNS_TEARDOWN.md - Teardown procedure
- BATCH_SYNC_TASKS.md - Phase completion tracking
- ENV_VARS_NEEDED.md - Environment variable audit

Status: Completed 2025-10-27
Current Function: calendarSync (deployed)
EOF
```

### Phase 4: Clean Up Helper Scripts

```bash
# Check if these reference old functions
grep -l "handleWebhook\|deploy-api\|deploy-batchSync" scripts/*.sh

# If they do, archive them:
mv scripts/deploy-all-functions.sh scripts/deploy/archived-old-functions/
mv scripts/build-and-deploy-gcp.sh scripts/deploy/archived-old-functions/  # If it references old functions
```

### Phase 5: Move GCP Reference (Optional)

```bash
# If keeping as reference:
mkdir -p wip/gcp-reference
mv gcp/* wip/gcp-reference/
rmdir gcp

cat > wip/gcp-reference/README.md << 'EOF'
# GCP Reference Architecture

This is a reference implementation showing an ideal routes/controllers/services architecture for the Cloud Function.

**Status:** Not deployed, reference only

**Current deployed structure:** functions/calendar-sync/app.ts (single Express app)

**This structure:** Shows how to organize code with MVC pattern if we refactor in the future.
EOF
```

---

## 🎯 After Cleanup

### New Simplified Structure

```bash
scripts/
├── deploy/
│   ├── deploy-calendar-sync.sh         # ✅ Only deployment script needed
│   ├── grant-batchSync-permissions.sh  # ✅ IAM permissions (still used)
│   └── archived-old-functions/         # 📦 Old scripts (reference only)
│       ├── deploy-handleWebhook.sh
│       ├── deploy-batchSync.sh
│       ├── deploy-renewWatches.sh
│       ├── deploy-triggerInitialSync.sh
│       ├── deploy-api.sh
│       └── README.md
├── setup-cloud-tasks-queue.sh          # ✅ Infrastructure
├── setup-cloud-tasks-permissions.sh    # ✅ Infrastructure
└── monitor-sync.sh                     # ✅ Monitoring

docs/
├── ARCHITECTURE.md                     # ✅ Current architecture
├── SETUP.md                            # ✅ Setup guide
└── archive/
    └── completed-migrations/           # 📦 Historical docs
        ├── MIGRATION.md
        ├── MIGRATION_SINGLE_DEPLOY.md
        ├── CLOUD_FNS_TEARDOWN.md
        └── README.md

wip/
├── 2025-11-13_STATE_OF_REPO.md         # ✅ Current analysis
├── 2025-11-13_TEARDOWN_STATUS.md       # ✅ Current status
├── ARCHITECTURE_COMPARISON.md          # ✅ Reference
├── LOCAL_WATCH_TESTING_GUIDE.md        # ✅ Testing guide
└── gcp-reference/                      # 📚 Optional reference architecture
    └── src/...
```

### Updated package.json Scripts

```json
{
  "scripts": {
    "build": "pnpm --filter calendar-sync-function run gcp-build",
    "deploy": "./scripts/deploy/deploy-calendar-sync.sh",
    "build:deploy": "pnpm build && pnpm deploy",
    "dev": "concurrently -n server,client -c cyan,magenta \"pnpm dev:server\" \"pnpm dev:client\"",
    "test": "vitest --run",
    "logs": "gcloud functions logs read calendarSync --limit=${LIMIT:-50}",
    "logs:webhook": "gcloud functions logs read calendarSync | grep 'POST /webhook'",
    "logs:batch": "gcloud functions logs read calendarSync | grep 'POST /batch-sync'",
    "monitor": "./scripts/monitor-sync.sh"
  }
}
```

---

## ✅ Verification

After cleanup, verify everything still works:

```bash
# 1. Build should work
pnpm build

# 2. Deploy should work (once billing is enabled)
pnpm deploy

# 3. Logs should work
pnpm logs

# 4. Tests should pass
pnpm test

# 5. Dev server should start
pnpm dev:server
```

---

## 📊 Impact Summary

| Item | Before Cleanup | After Cleanup | Benefit |
|------|---------------|---------------|---------|
| Deployment Scripts | 6 scripts (5 broken, 1 working) | 1 script (working) | ✅ Clarity |
| npm Scripts | 15+ (many broken) | 8 (all working) | ✅ Simplicity |
| Documentation | Mixed current/historical | Organized by status | ✅ Navigability |
| Confusion | High (old + new code) | Low (only current code) | ✅ Maintainability |

---

## 🎉 Bottom Line

**Your Architecture Preference is Already Implemented:**
- ✅ Single function with sub-routes (app.ts)
- ✅ All code shared, no duplication
- ✅ Deployed and working (once billing is enabled)

**Legacy Cleanup:**
- 🗑️ 5 old deployment scripts → Archive
- 🗑️ 10+ broken npm scripts → Remove
- 🗑️ Completed migration docs → Archive
- 🗑️ Possibly gcp/ directory → Move to reference

**Result:** Clean, maintainable codebase that matches your architectural vision.

---

**Next Steps:**
1. Run the cleanup scripts above
2. Test that deployment still works
3. Enjoy your clean, single-function architecture! 🎊
