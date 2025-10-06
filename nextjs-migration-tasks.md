---
# Next.js Migration Tasks

<!--
LLM ADVICE BLOCK:

To complete a migration step, you may use any of the following instructions:
• "Stage and commit all changes for the current migration task."
• "Mark the checklist and commit the semantic chunk."
• "Finish the current migration step and update the checklist."
• "Complete the current todo and commit."

When you see one of these, automatically:
1. Commit the code changes for the current migration step with a semantic message.
2. Update the checklist to mark the step as complete.
3. Stage and commit the checklist update as a semantic chunk.

You do not need to ask for permission to update the checklist or commit—just do it as part of the migration workflow.

If you are an LLM or agent starting work on this migration with brand new context, you should read the following essential files before proceeding:
- nextjs-migration.md (migration plan and stub examples)
- functions/calendar-sync/api.ts (legacy API gateway)
- functions/calendar-sync/oauth.ts (legacy OAuth logic)
- functions/calendar-sync/control.ts (legacy sync control logic)
- web/index.html (legacy frontend UI and styles)
- web/src/main.ts (legacy frontend logic)
- nextjs/app/layout.tsx (Next.js root layout)
- nextjs/app/page.tsx (Next.js homepage placeholder)
- nextjs/app/globals.css (Next.js global styles)
- nextjs-migration-tasks.md (this checklist)
-->

This checklist tracks the migration of API and frontend logic from legacy code to Next.js.

After each task, change the task to note that it has been done

## Nextjs Stub
- [x] Stage and commit nextjs dir as initial commit of nextjs (done: scaffolded and committed Next.js stub with semantic message)

## API Route Migration
- [x] Create API route stubs in `/nextjs/app/api/` (done: all stubs created and committed)
    - [x] Stage and commit /oauth/start API route stub (done: UI migration committed)
    - [x] Stage and commit /oauth/callback API route stub (done: stub committed for /oauth/callback)
    - [x] Stage and commit /setup API route stub (done: stub committed for /setup)
    - [x] Stage and commit /sync/pause API route stub (done: stub committed for /sync/pause)
    - [x] Stage and commit /sync/resume API route stub (done: stub committed for /sync/resume)
    - [x] Stage and commit /sync/stop API route stub (done: stub committed for /sync/stop)
    - [x] Stage and commit /sync/restart API route stub (done: stub committed for /sync/restart)
    - [x] Stage and commit /user/clear API route stub (done: stub committed for /user/clear)
    - [x] Stage and commit /health API route stub (done: stub committed for /health)

## Frontend Migration
- [x] Migrate UI from `web/index.html` to `/nextjs/app/page.tsx` (done: UI migrated and committed as React JSX)
    - [x] Stage and commit UI migration in a semantic chunk (done: committed as semantic chunk)
- [x] Migrate logic from `web/src/main.ts` to `/nextjs/app/page.tsx` (done: logic migrated and committed as React hooks/components)
    - [x] Stage and commit logic migration in a semantic chunk (done: committed as semantic chunk)
- [x] Migrate styles from `web/index.html <style>` to `/nextjs/app/globals.css` (done: styles migrated and committed)
    - [x] Stage and commit styles migration in a semantic chunk (done: committed as semantic chunk)
- [x] Move static assets from `/web` to `/nextjs/public` as needed (done: no static assets found to migrate)
    - [x] Stage and commit static assets migration in a semantic chunk (done: committed as semantic chunk)

## Middleware & Config
- [x] Implement CORS middleware in `/nextjs/middleware.ts` (done: CORS middleware implemented and committed)
    - [x] Stage and commit CORS middleware in a semantic chunk (done: committed with semantic message)
- [ ] Audit and set up environment variables in Vercel
    - [ ] Stage and commit Vercel environment variable setup in a semantic chunk
- [ ] Update API logic to use `NextRequest`/`NextResponse` instead of Express
    - [ ] Stage and commit NextRequest/NextResponse migration in a semantic chunk

## Deployment
- [ ] Configure Vercel project root to `/nextjs`
    - [ ] Stage and commit Vercel project root config in a semantic chunk
- [ ] Add `vercel.json` with build/install/output settings
    - [ ] Stage and commit vercel.json addition in a semantic chunk
- [ ] Deploy Next.js app to Vercel
    - [ ] Stage and commit Vercel deployment in a semantic chunk

## Tracking & Cleanup
- [ ] Track migrated endpoints and pages in this checklist
    - [ ] Stage and commit endpoint/page tracking update in a semantic chunk
- [ ] Remove legacy code from `/web` and `/functions/calendar-sync/` (timeline TBD)
    - [ ] Stage and commit legacy code removal in a semantic chunk

---
