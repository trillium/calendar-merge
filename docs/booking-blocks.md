# Booking blocks

Reads Airbnb Services host emails in a Gmail account and makes sure the calendar is blocked for the *whole* time of each appointment, including accepted extensions and back-to-back bookings. Read-only by default.

## How it works

1. **Emails.** Via the `gog` CLI (always `--readonly`), it fetches mail from `automated@airbnb.com` and understands five kinds:
   confirmation (guest, date, start and end, confirmation code), guest cancel, host cancel, reschedule (new time only), and accepted payment request (extension).
2. **Appointments.** Emails are applied oldest first, so state comes only from the mailbox. Anything it cannot place (an extension with no stated length, a reschedule that could be two bookings) is marked **review** and is never written.
3. **Plan.** For each upcoming appointment, the needed window is start to end plus extensions. Whatever part of that window no calendar event covers gets a block (`add`). Blocks it created carry a private property `bookingBlockKey` (the confirmation code), so a re-run does not double-block; it `update`s a block when the booking changes and `delete`s it when the booking is canceled or the platform's own event now covers everything.
4. **Output.** A markdown table: date, client initials, services, booked time, current calendar block, proposed block. Event titles are never printed.

## Commands

```bash
. ~/.config/gog/env        # GOG_KEYRING_* for gog

# dry run (default): prints the plan, changes nothing
bun gcp/src/cli/booking-blocks.ts --account you@gmail.com --days 30 --out plan.md

# the same, as of an earlier moment (read-only)
bun gcp/src/cli/booking-blocks.ts --account you@gmail.com --lookback 300 --now 2026-07-27T13:00:00-07:00

# apply the plan to the calendar: only with --write
bun gcp/src/cli/booking-blocks.ts --account you@gmail.com --write
```

## Watcher (not installed)

`gcp/src/cli/booking-blocks-watch.ts` is one dry-run pass that refreshes a plan file; it has no write path. `deploy/booking-blocks/` holds a launchd plist (every 15 minutes) and the wrapper script it runs. Set `BOOKING_BLOCKS_ACCOUNT` in the plist, check the paths, then:

```bash
cp deploy/booking-blocks/com.trillium.booking-blocks.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.trillium.booking-blocks.plist
```

## Limits

- Only Pacific-time bookings are read (the email says `PT`); anything else is reported as unparseable.
- A reschedule email does not say which booking moved. It matches on guest and service, and asks for review if that is ambiguous.
- The sender address is checked, but the email's DKIM result is not, so a forged "booking" from outside could add a block. Blocks are labelled with the confirmation code in their description, and a block whose booking disappears from the mailbox is reported in the plan (never silently deleted).
- Tests use synthetic emails only (`src/booking-blocks/fixtures.ts`). Never commit real emails.
