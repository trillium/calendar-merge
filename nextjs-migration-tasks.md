---
# Next.js Migration Tasks

This checklist tracks the migration of API and frontend logic from legacy code to Next.js.

## API Route Migration
- [ ] Create API route stubs in `/nextjs/app/api/`:
    - [ ] `/oauth/start/route.ts` (migrate `oauthStart` from `functions/calendar-sync/oauth.ts`)
    - [ ] `/oauth/callback/route.ts` (migrate `oauthCallback` from `functions/calendar-sync/oauth.ts`)
    - [ ] `/setup/route.ts` (migrate `setup` from `functions/calendar-sync/oauth.ts`)
    - [ ] `/sync/pause/route.ts` (migrate `pauseSync` from `functions/calendar-sync/control.ts`)
    - [ ] `/sync/resume/route.ts` (migrate `resumeSync` from `functions/calendar-sync/control.ts`)
    - [ ] `/sync/stop/route.ts` (migrate `stopSync` from `functions/calendar-sync/control.ts`)
    - [ ] `/sync/restart/route.ts` (migrate `restartSync` from `functions/calendar-sync/control.ts`)
    - [ ] `/user/clear/route.ts` (migrate `clearUserData` from `functions/calendar-sync/control.ts`)
    - [ ] `/health/route.ts` (health check endpoint)

## Frontend Migration
- [ ] Migrate UI from `web/index.html` to `/nextjs/app/page.tsx`
- [ ] Migrate logic from `web/src/main.ts` to `/nextjs/app/page.tsx` (React hooks/components)
- [ ] Migrate styles from `web/index.html <style>` to `/nextjs/app/globals.css`
- [ ] Move static assets from `/web` to `/nextjs/public` as needed

## Middleware & Config
- [ ] Implement CORS middleware in `/nextjs/middleware.ts`
- [ ] Audit and set up environment variables in Vercel
- [ ] Update API logic to use `NextRequest`/`NextResponse` instead of Express

## Deployment
- [ ] Configure Vercel project root to `/nextjs`
- [ ] Add `vercel.json` with build/install/output settings
- [ ] Deploy Next.js app to Vercel

## Tracking & Cleanup
- [ ] Track migrated endpoints and pages in this checklist
- [ ] Remove legacy code from `/web` and `/functions/calendar-sync/` (timeline TBD)

---
