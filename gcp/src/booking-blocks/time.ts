/**
 * Time helpers. The booking emails give wall-clock times in Pacific time;
 * everything downstream works in epoch ms.
 */

export const BLOCK_TIME_ZONE = 'America/Los_Angeles';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export function monthIndex(name: string): number {
  return MONTHS.indexOf(name.toLowerCase());
}

/** Offset (ms) of `timeZone` from UTC at the instant `at` */
function zoneOffsetMs(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find(p => p.type === type)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** Wall-clock time in `timeZone` -> epoch ms. Month is 0-based. */
export function zonedToEpoch(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string = BLOCK_TIME_ZONE
): number {
  const guess = Date.UTC(year, month, day, hour, minute);
  const first = guess - zoneOffsetMs(guess, timeZone);
  // Re-resolve once so times near a DST change land on the right side of it
  return guess - zoneOffsetMs(first, timeZone);
}

/** "7:00 PM" -> [19, 0] */
export function parseClock(text: string): [number, number] | null {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(text.trim());
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (m[3].toUpperCase() === 'PM') hour += 12;
  return [hour, Number(m[2])];
}

/** Local calendar date (YYYY-MM-DD) of an instant in the block time zone */
export function localDate(epoch: number, timeZone: string = BLOCK_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(epoch));
}

/** "7:00 PM" style local time of an instant */
export function localClock(epoch: number, timeZone: string = BLOCK_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(epoch));
}

/** RFC3339 with the zone's offset, e.g. 2026-11-02T19:00:00-08:00 */
export function toRfc3339(epoch: number, timeZone: string = BLOCK_TIME_ZONE): string {
  const offset = zoneOffsetMs(epoch, timeZone);
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset) / 60000;
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  const local = new Date(epoch + offset).toISOString().slice(0, 19);
  return `${local}${sign}${hh}:${mm}`;
}
