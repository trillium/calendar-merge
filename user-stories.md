# User Stories - Calendar Merge Service

## Story Template

```markdown
### Story: [Brief Title]

**As a** [type of user]
**I want** [action/capability]
**So that** [benefit/value]

**Acceptance Criteria:**

- [ ] Given [context], when [action], then [expected outcome]
- [ ] Given [context], when [action], then [expected outcome]

**Technical Notes:**

- [Implementation details, API endpoints, edge cases]

**Current Status:** ✅ Working / ⚠️ Partial / ❌ Not Working / 📝 Not Implemented
```

---

### Story 1: Merge Multiple Calendars into One

**As a** User
**I want to** sync multiple calendars into a single target calendar
**So that** a web service that only accepts one shared calendar gets up-to-date availability across all my calendars

**Acceptance Criteria:**

- [ ] Given I have 3 source calendars (work, personal, side-project), when I set up sync to a target calendar, then all events from all 3 calendars appear in the target calendar
- [ ] Given an event exists in source calendar A, when it's synced to the target, then it's labeled with the source calendar name (e.g., "[work] Team Meeting")
- [ ] Given I have events across multiple calendars, when they sync, then the target calendar shows accurate busy/free status for all time slots
- [ ] Given I add a new source calendar to the sync, when I restart the sync, then events from the new calendar also appear in the target

**Technical Notes:**

- Uses `WatchData.targetCalendarId` to specify merge destination
- Each source calendar gets its own watch subscription
- Events labeled with source calendar name in [sync.ts:108-115](functions/calendar-sync/sync.ts#L108)
- Calendar name extracted from email: `calendarId.split('@')[0]`

**Current Status:** ✅ Working

---

### Story 2: Calendar App Transparency Control

**As a** user
**I want to** use my calendar app's busy/free settings to control event appearance
**So that** I only need to set this up once in my calendar app and the sync respects it

**Acceptance Criteria:**

- [ ] Given I mark an event as "free" (transparent) in source calendar, when it syncs, then it appears as "free" in target calendar and shows " - free" in the title
- [ ] Given I mark an event as "busy" (opaque) in source calendar, when it syncs, then it appears as "busy" in target calendar and shows " - busy" in the title
- [ ] Given I change an event from "busy" to "free" in my calendar app, when the webhook fires, then the target calendar updates to show " - free"
- [ ] Given a source calendar is configured, when ALL its events sync to target, then they are marked as private (entire calendar level privacy)
- [ ] Given a source calendar configuration level is changed from `private` to `public` (or some other wording), when many events have already been synced, then syncing style is changed from this moment forward and the user is prompted to know if they want to change past events

**Technical Notes:**

- Currently syncs ALL events from all source calendars (no filtering)
- Preserves transparency (busy/free) from source in [sync.ts:111-122](functions/calendar-sync/sync.ts#L111)
- All synced events marked as `visibility: 'private'` in target (calendar-level setting)
- Title format: `[calendar-name] Event Title - busy/free` in [sync.ts:115](functions/calendar-sync/sync.ts#L115)
- No per-event privacy control (intentional design decision)

**Current Status:** ✅ Working - Respects busy/free from source, all events marked private at calendar level

---

### Story 3: Configurable Event Detail Verbosity

**As a** User
**I want to** configure how much detail appears in synced events per source calendar
**So that** I can keep certain calendars more private while still blocking their availability

**Acceptance Criteria:**

- [ ] Given I configure source calendar A as "full detail", when events sync, then they show `[calendar-A] Meeting with John - busy`
- [ ] Given I configure source calendar B as "minimal detail", when events sync, then they show `[calendar-B] Busy - busy` (title hidden)
- [ ] Given I configure source calendar C as "title only", when events sync, then they show `[calendar-C] Meeting with John` (no busy/free suffix)
- [ ] Given I change calendar A from "full detail" to "minimal detail", when I restart sync, then future syncs use minimal detail

**Technical Notes:**

- Currently uses FIXED format for all calendars: `[name] ${title} - busy/free`
- No configuration UI or storage for verbosity settings
- Would need to add `verbosityLevel` field to `WatchData` or separate calendar config
- Implementation would modify event summary generation in [sync.ts:115](functions/calendar-sync/sync.ts#L115)

**Current Status:** 📝 Not Implemented - All calendars use same "full detail" format

---

### Story 4: Real-time Event Updates

**As a** User
**I want to** update a calendar event and see that update reflected in the synced calendar
**So that** I know my availability is always up-to-date

**Acceptance Criteria:**

- [ ] Given I create a new event for tomorrow on source calendar A, when the webhook fires, then the event appears in the target calendar within seconds
- [ ] Given I update an event title on source calendar A, when the webhook fires, then the target calendar shows the updated title
- [ ] Given I move an event to a different time, when the webhook fires, then the target calendar reflects the new time
- [ ] Given I delete an event from source calendar, when the webhook fires, then the event is removed from the target calendar
- [ ] Given I create an event 2 weeks in the future, when the webhook fires, then it syncs immediately (not just when it's <24hrs away)

**Technical Notes:**

- Uses Google Calendar Push Notifications (webhooks) to detect changes
- Webhook triggers `syncCalendarEvents()` in [sync.ts:12](functions/calendar-sync/sync.ts#L12)
- **CURRENT BUG**: Uses `timeMin` which filters by event END time, not modification time
- This means events ending >24hrs from now won't sync even if just created/updated
- Should use `updatedMin` or `syncToken` instead to catch all changes
- See: [analysis-sync-behavior.md](analysis-sync-behavior.md) for details

**Current Status:** ❌ Not Working - Updates to future events don't sync due to timeMin bug

---

## Edge Cases & Error Handling

### Story 5: User Error Notifications

**As a** User
**I want to** be informed if something isn't working as intended
**So that** I can contact the admin to fix it

**Acceptance Criteria:**

- [ ] Given my OAuth token expires, when the system tries to sync, then I receive an email notification that re-authentication is needed
- [ ] Given a watch subscription expires, when the renewal fails, then I receive a notification
- [ ] Given sync has been failing for 24+ hours, when I visit the web UI, then I see a warning banner with the error
- [ ] Given the system encounters an error, when I check the status page, then I see the last successful sync time and error count

**Technical Notes:**

- Currently only logs errors to console (Cloud Functions logs)
- No user-facing error notifications
- No status page or health check UI
- Would need:
  - Email notification system (SendGrid, Cloud Pub/Sub)
  - Status tracking in Firestore (last sync, error counts)
  - Web UI to display status
  - Error categorization (auth vs transient vs config)

**Current Status:** 📝 Not Implemented - Errors only visible in Cloud Logs (admin only) -- this is to be implemented later on, ignore at this stage due to extending for email being outside of current MVP scope

---

## Edge Cases & Error Handling

### Story 6: Admin Sync Verification

**As an** Admin
**I want to** confirm the number of events being synced per user
**So that** I can verify the system is functioning correctly

**Acceptance Criteria:**

- [ ] Given a user has set up sync, when I check the admin dashboard, then I see total events synced per user
- [ ] Given sync just completed, when I check the logs, then I see "Found X events to sync" and "Sync complete"
- [ ] Given multiple users are syncing, when I check metrics, then I see sync counts, success rates, and error rates
- [ ] Given I want to verify a specific user's sync, when I query their watches collection, then I see active watch count and target calendar

**Technical Notes:**

- Currently logs event counts in [sync.ts:52](functions/calendar-sync/sync.ts#L52): "Found X events to sync"
- Logs sync completion in [sync.ts:61](functions/calendar-sync/sync.ts#L61)
- No aggregated metrics or admin dashboard
- Could add:
  - Cloud Monitoring dashboards for sync metrics
  - Firestore collection for sync history/stats
  - Admin web UI to view per-user stats
  - Queries like: `firestore.collection('watches').where('userId', '==', userId).get()`

**Current Status:** ⚠️ Partial - Can view logs manually, but no dashboard or aggregated metrics

---

## Edge Cases & Error Handling

### Story 7: Multi-User Health Monitoring

**As an** Admin
**I want to** confirm the system works on an ongoing basis for multiple users
**So that** I know it is functional and can confidently charge users for the service

**Acceptance Criteria:**

- [ ] Given 10 users are actively syncing, when I check system health, then I see overall sync success rate >99%
- [ ] Given a user's sync has been failing for 1+ hour, when I check alerts, then I'm notified of the issue
- [ ] Given watches are expiring, when the renewal job runs, then I see renewal success rate and any failures
- [ ] Given I want to assess system reliability, when I check metrics over 30 days, then I see uptime, error rates, and API quota usage

**Technical Notes:**

- No system-wide health monitoring currently
- Would need:
  - Cloud Monitoring alerts for error rates, latency spikes
  - Uptime checks (ping healthcheck endpoints)
  - Quota monitoring for Google Calendar API
  - Success/failure tracking in Firestore with timestamps
  - Alerting integration (PagerDuty, Slack, email)
- Could use `renewWatches` function logs to track renewal success
- Currently reactive (check logs when issues occur) vs proactive monitoring

**Current Status:** 📝 Not Implemented - No proactive monitoring, only reactive log checking
