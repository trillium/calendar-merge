# Spike: Google Calendar API Shared Calendar Behavior

**Date:** 2026-02-09
**Bead:** ca-dyf
**Method:** API documentation analysis + codebase review

---

## Q1: Does `events.list(calendarId=A)` include events from B when B is shared with A?

### Answer: NO

`events.list` returns **only events on the specified calendar**. It does not include events from other calendars, even if those calendars are shared with the authenticated user.

From the API docs: the endpoint is `GET /calendars/{calendarId}/events` and it "Returns events on the specified calendar."

To get events from multiple calendars, you must call `events.list` separately for each `calendarId`. The current codebase already does this correctly - it creates a separate watch per source calendar and syncs each independently.

### Impact on our system: None. Current design is correct.

---

## Q2: If someone is an attendee on an event in both calendar A and B, do both watches fire?

### Answer: YES, both watches fire independently.

Watches operate per-calendar. From the docs: "If you want to get notified about all event or ACL changes for calendars A and B, you need to separately subscribe to the events/ACL collections for A and for B."

When an event is created with attendees from multiple calendars:
1. The organizer's calendar gets the event (watch on that calendar fires)
2. Each attendee's calendar gets a copy (watch on each attendee's calendar fires)

Each watch monitors its own calendar's events collection as a separate resource. Changes propagate from organizer to attendee copies, and each propagation triggers the respective calendar's watch.

### Impact on our system: **DUPLICATE SYNC RISK.** See Q3.

---

## Q3: Does the `eventMappings` composite key catch cross-calendar duplicates?

### Answer: NO - this is a gap.

The current composite key is `${sourceCalendarId}_${sourceEventId}`.

**Critical finding:** When the same logical event appears on multiple source calendars (e.g., user has calendars A and B, and an event has attendees from both), `events.list` returns the **same event ID** from both calendars.

So the mapping keys would be:
- From calendar A: `"calendarA@gmail.com_abc123"`
- From calendar B: `"calendarB@gmail.com_abc123"`

These are **different keys** because `sourceCalendarId` differs, even though `sourceEventId` is the same. The system will create **two copies** of the same event in the target calendar.

### How event IDs work across calendars

| Field | Scope | Behavior |
|-------|-------|----------|
| `id` | Per-event (same across calendars) | Same ID returned from organizer and attendee calendars |
| `iCalUID` | Global (RFC5545) | Same across all calendar copies; different per occurrence in recurring events |

The `id` field is the same when retrieved from different calendars for the same event. The Google docs state: "Use the same event ID (iCalUID) for the organizer's and the attendee's copies."

### Dedup strategies

**Option A: iCalUID-based dedup (recommended)**
Before inserting into target, check if an `event_mappings` doc already exists with the same `iCalUID`. Add an `iCalUID` field to `EventMapping`.

**Option B: Normalize on sourceEventId only**
Use just `sourceEventId` as the mapping key (dropping `sourceCalendarId`). First-writer-wins. Risk: loses info about which source calendar the event came from.

**Option C: Check-before-write with iCalUID index**
Keep current composite key but add a secondary lookup: query `event_mappings` where `sourceEventId == X` before creating. If any mapping exists for that event ID, skip or update instead of insert.

### Impact on our system: **Must fix before multi-calendar users go live.** Any user with overlapping attendees across source calendars will get duplicate events in their target calendar.

---

## Q4: What does `calendarList.list` return for shared vs owned calendars?

### Answer: Both appear in the list, distinguished by `accessRole` and `primary`.

`calendarList.list` returns ALL calendars the user can see - owned, shared, subscribed. Each entry is a `CalendarListEntry` with these distinguishing fields:

| Field | Owned primary | Owned secondary | Shared calendar |
|-------|--------------|-----------------|-----------------|
| `primary` | `true` | `false` | `false` |
| `accessRole` | `"owner"` | `"owner"` | `"reader"` / `"writer"` / `"owner"` |
| `dataOwner` | (not set) | (user's email) | (original owner's email) |

### `accessRole` values
- **`owner`** - Full control + can manage sharing
- **`writer`** - Read/write events
- **`reader`** - Read-only (private event details hidden)
- **`freeBusyReader`** - Can only see free/busy

### Key distinctions
- `primary: true` only for the user's main calendar
- `dataOwner` is set for secondary calendars and shows the email of the actual owner. For shared calendars, this is the sharer's email.
- A shared calendar can have `accessRole: "owner"` without being the `dataOwner` (ownership delegation vs data ownership)

### Impact on our system: The current `calendarList.list` call in `nextjs/app/api/calendars/route.ts` (line 25) returns all calendars without filtering. For the calendar selection UI, we should display `accessRole` so users understand their permissions, and potentially warn about shared calendars where they have read-only access (sync would fail on write operations).

---

## Summary of Findings

| Question | Answer | Risk Level |
|----------|--------|------------|
| Q1: events.list cross-calendar | No, per-calendar only | None (already correct) |
| Q2: Both watches fire | Yes, independently | Medium (triggers Q3 issue) |
| Q3: Composite key dedup | No, misses cross-calendar dupes | **HIGH** - duplicates in target |
| Q4: calendarList shared vs owned | Distinguished by accessRole/primary | Low (UI improvement needed) |

## Recommended Next Steps

1. **P0: Fix cross-calendar dedup** - Add `iCalUID` to `EventMapping` and check for existing mappings with same `sourceEventId` before creating new target events. This prevents duplicate events when the same logical event appears on multiple source calendars.

2. **P2: Enhance calendar selection UI** - Show `accessRole` badges in `StepSelectCalendars.tsx`. Warn users that `reader`/`freeBusyReader` calendars cannot be used as targets.

3. **P3: Consider event ID normalization** - Long-term, consider whether to key mappings on `iCalUID` instead of `id` for better cross-system compatibility, especially if importing from non-Google calendar systems.
