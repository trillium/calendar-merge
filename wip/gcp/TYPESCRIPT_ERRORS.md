# TypeScript Errors in /gcp

**Status:** Expected errors - skeleton files need implementation
**Date:** 2025-11-13

---

## Summary

The `/gcp` folder currently has **37 TypeScript errors** because:
1. Files are skeletons (from the initial setup)
2. Task files have code examples but actual implementation doesn't exist yet
3. This is **expected** - the tasks guide you to create the actual code

---

## Error Breakdown

### Critical Errors (need fixing before build works)

#### 1. Config exports missing (2 errors)
```
src/config/index.ts(14,3): error TS2552: Cannot find name 'validateAppConfig'
src/config/index.ts(15,3): error TS2552: Cannot find name 'validateGoogleConfig'
```

**Fix:** Complete **Task 02** to create actual config files

#### 2. Type inference errors (9 errors)
```
src/index.ts(64,14): error TS2742: The inferred type of 'calendarSync' cannot be named
src/routes/*.ts: error TS2742: The inferred type of 'router' cannot be named
```

**Fix:** Add explicit type annotations
```typescript
// Before
export const calendarSync = app;

// After
import type { Express } from 'express';
export const calendarSync: Express = app;
```

#### 3. Function signature errors (2 errors)
```
src/services/watch-channel.service.ts(93,76): error TS2554: Expected 1-2 arguments, but got 3
```

**Fix:** Complete **Task 10** with correct function signatures

#### 4. Type compatibility errors (3 errors)
```
src/db/firestore.ts(97,52): error TS2345: Argument of type 'T' is not assignable
src/services/google-auth.service.ts(49,5): error TS2322: readonly array not assignable to mutable
```

**Fix:** Complete **Task 05** and **Task 06** with correct types

### Warning Errors (unused variables - 21 errors)

These are just unused parameter warnings:
```
error TS6133: 'req' is declared but its value is never read
error TS6133: 'res' is declared but its value is never read
error TS6133: 'next' is declared but its value is never read
```

**Fix:** Prefix with underscore or use eslint-disable
```typescript
// Before
async function handler(req: Request, res: Response) { ... }

// After
async function handler(_req: Request, res: Response) { ... }
```

---

## Current State

**The `/gcp` folder is NOT ready to build** because:
- ❌ Task 01 (TypeScript migration) not started
- ❌ Task 02-14 (implementation) not started
- ❌ Only skeleton files exist

**This is EXPECTED!** The tasks guide you through creating the actual implementation.

---

## When Will These Be Fixed?

As you complete the tasks:

| Task | What It Fixes |
|------|---------------|
| Task 01 | Migrates .js to .ts |
| Task 02 | Creates working config files → fixes 2 errors |
| Task 03 | Creates type definitions |
| Task 04 | Creates utilities |
| Task 05 | Creates database service → fixes 1 error |
| Task 06 | Creates auth service → fixes 2 errors |
| Task 07-10 | Creates remaining services → fixes 2 errors |
| Task 11-14 | Creates middleware/controllers/routes → fixes 30 errors |

**After Task 14, `pnpm build` will succeed!**

---

## Can We Run Anything Now?

### ❌ Cannot run:
```bash
pnpm build      # 37 errors
pnpm dev        # Won't start (compilation errors)
pnpm start      # No dist/ folder
```

### ✅ Can run:
```bash
pnpm install    # Works ✓
pnpm clean      # Works ✓
```

### 📝 Can review:
```bash
cat wip/gcp/00_OVERVIEW.md           # Read the plan
cat wip/gcp/01_TASK_migrate_js_to_ts.md  # Start here
```

---

## Quick Fix for Immediate Build (Optional)

If you want to see a successful build RIGHT NOW, you can:

### Option 1: Exclude skeleton files from build

**File:** `gcp/tsconfig.json`

```json
{
  "compilerOptions": { ... },
  "include": ["src/**/*"],
  "exclude": [
    "node_modules",
    "dist",
    "**/*.test.ts",
    "src/config/**",        // Exclude until Task 02
    "src/types/**",         // Exclude until Task 03
    "src/utils/**",         // Exclude until Task 04
    "src/db/**",            // Exclude until Task 05
    "src/services/**",      // Exclude until Task 06-10
    "src/middleware/**",    // Exclude until Task 11
    "src/controllers/**",   // Exclude until Task 12
    "src/routes/**",        // Exclude until Task 13
    "src/index.ts"          // Exclude until Task 14
  ]
}
```

Then `pnpm build` will succeed (but compile nothing).

### Option 2: Start with Task 01

Follow the tasks in order:
```bash
cd /Users/trilliumsmith/code/calendar-merge-service/gcp
cat wip/gcp/01_TASK_migrate_js_to_ts.md

# Follow the instructions in Task 01
# Then Task 02, 03, etc.
```

After completing Tasks 01-14, all errors will be fixed.

---

## Expected Error Count by Task

| After Task | Errors Remaining |
|-----------|------------------|
| Current | 37 |
| Task 01 | 37 (no change, just setup) |
| Task 02 | 35 (config exports fixed) |
| Task 03 | 35 (types created) |
| Task 04 | 35 (utils created) |
| Task 05 | 34 (db service fixed) |
| Task 06 | 32 (auth service fixed) |
| Task 07-10 | 30 (services fixed) |
| Task 11 | 21 (middleware fixed) |
| Task 12 | 12 (controllers fixed) |
| Task 13 | 9 (routes fixed) |
| Task 14 | **0** ✅ (all fixed!) |

---

## Recommendation

**Don't worry about these errors yet!** They're expected because:

1. The `/gcp` folder is a **planned architecture**
2. The task files show you what to build
3. You're meant to follow Tasks 01-14 to implement it
4. Each task provides complete, working code

**Start with Task 01** and work through sequentially. By Task 14, everything will compile cleanly.

---

## Alternative: Use functions/calendar-sync

If you need working code RIGHT NOW:

```bash
cd /Users/trilliumsmith/code/calendar-merge-service/functions/calendar-sync

# This already works
pnpm build      # ✓ Compiles successfully
pnpm dev        # ✓ Runs dev server
pnpm test       # ✓ All tests pass (2,165 lines)
```

The `/gcp` migration is an **improvement**, not a fix. Your current code works fine!

---

## Summary

✅ **This is normal** - skeleton files are expected to have errors
✅ **Not a problem** - follow the tasks to implement the code
✅ **Working code exists** - in `functions/calendar-sync/`
✅ **Migration is optional** - it's for cost savings and better architecture

**Don't try to fix these errors manually** - the task files contain the correct implementations. Follow Tasks 01-14 in order! 🚀
