/**
 * Thin wrapper over the `gog` CLI for the booking-blocks job.
 *
 * Reads always pass --readonly, so a bug here cannot write. Writes go through
 * GogWriter, which the CLI only constructs when writes are explicitly enabled.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { CalendarEvent } from './types';
import { RawEmail, isBookingSubject } from './parser';
import { toRfc3339 } from './time';

const run = promisify(execFile);

export const BOOKING_SENDER = 'automated@airbnb.com';
export const BLOCK_PROPERTY = 'bookingBlockKey';

async function gog(account: string, args: string[], readonly: boolean): Promise<string> {
  const base = readonly ? ['--readonly'] : [];
  const { stdout } = await run('gog', [...base, '-a', account, ...args], { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

const asJson = (text: string): any => JSON.parse(text);

export class GogReader {
  constructor(private account: string) {}

  /** Booking-related emails from the last `lookbackDays` days, bodies included */
  async fetchBookingEmails(lookbackDays: number): Promise<RawEmail[]> {
    const query = `from:${BOOKING_SENDER} newer_than:${lookbackDays}d`;
    const found: any[] = asJson(await gog(this.account, ['gmail', 'messages', 'search', query, '--all', '-j', '--results-only'], true)) ?? [];

    const emails: RawEmail[] = [];
    for (const m of found) {
      if (!isBookingSubject(m.subject ?? '')) continue;
      const full = asJson(await gog(this.account, ['gmail', 'get', m.id, '--format', 'full', '-j', '--results-only'], true));
      // The sender is checked exactly: a look-alike display name must not pass
      if (!new RegExp(`<${BOOKING_SENDER}>$|^${BOOKING_SENDER}$`).test(String(full.headers?.from ?? '').trim())) continue;
      emails.push({ id: m.id, subject: m.subject, sentAt: Date.parse(m.internalDateIso), body: String(full.body ?? '') });
    }
    return emails;
  }

  async fetchEvents(calendarId: string, from: number, to: number): Promise<CalendarEvent[]> {
    const args = ['calendar', 'events', '--calendars', calendarId, '--from', toRfc3339(from), '--to', toRfc3339(to), '--max', '2500', '--all-pages', '-j', '--results-only'];
    const raw: any[] = asJson(await gog(this.account, args, true)) ?? [];
    const events: CalendarEvent[] = [];
    for (const e of raw) {
      if (e.status === 'cancelled' || e.transparency === 'transparent') continue;
      if (!e.start?.dateTime || !e.end?.dateTime) continue; // all-day events do not block a time slot
      events.push({
        id: e.id,
        summary: e.summary ?? '',
        start: Date.parse(e.start.dateTime),
        end: Date.parse(e.end.dateTime),
        blockKey: e.extendedProperties?.private?.[BLOCK_PROPERTY],
      });
    }
    return events;
  }
}

export class GogWriter {
  constructor(private account: string, private calendarId: string) {}

  async create(key: string, summary: string, description: string, start: number, end: number): Promise<void> {
    await gog(
      this.account,
      ['calendar', 'create', this.calendarId, '--summary', summary, '--description', description, '--from', toRfc3339(start), '--to', toRfc3339(end), '--private-prop', `${BLOCK_PROPERTY}=${key}`, '--no-reminders', '--send-updates', 'none', '--no-input'],
      false
    );
  }

  async update(eventId: string, start: number, end: number): Promise<void> {
    await gog(this.account, ['calendar', 'update', this.calendarId, eventId, '--from', toRfc3339(start), '--to', toRfc3339(end), '--send-updates', 'none', '--no-input'], false);
  }

  async remove(eventId: string): Promise<void> {
    await gog(this.account, ['calendar', 'delete', this.calendarId, eventId, '--force', '--no-input'], false);
  }
}
