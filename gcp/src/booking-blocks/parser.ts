/**
 * Parses Airbnb Services host emails into BookingSignals.
 *
 * Email content is untrusted: everything is matched with strict patterns, and
 * anything that does not match is reported as a problem rather than guessed.
 */

import { BookingSignal } from './types';
import { monthIndex, parseClock, zonedToEpoch } from './time';

export interface RawEmail {
  id: string;
  subject: string;
  /** Epoch ms the email was sent */
  sentAt: number;
  /** text/plain body as returned by Gmail */
  body: string;
}

export type ParseResult =
  | { relevant: false }
  | { relevant: true; signal: BookingSignal }
  | { relevant: true; problem: string };

const DAY = '(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day';

const BOOKED_SUBJECT = /^Confirmed: (.{1,60}?) booked an? (.{1,80}?) for [A-Za-z]+ \d{1,2}$/;
const CANCELED_SUBJECT = /^(.{1,60}?) canceled their reservation: (.{1,80})$/;
const HOST_CANCELED_SUBJECT = /^(.{1,60}?)['’]s reservation was canceled$/;
const RESCHEDULED_SUBJECT = /^(.{1,60}?) rescheduled their reservation: (.{1,80})$/;
const EXTENDED_SUBJECT = /^(.{1,60}?) accepted your payment request for (.{1,80})$/;

const INVISIBLE = /[\u034f\u00ad\u200b\u200c\u200d\ufeff]/g;

/** Strip links and layout whitespace so patterns can match across line breaks */
function flatten(body: string): string {
  return body
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[͏­​‌‍﻿]/g, '')
    .replace(/[\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanName(raw: string): string {
  return raw.replace(/[^\p{L}\p{N} .'’-]/gu, '').trim().slice(0, 40);
}

/** Month/day without a year: pick the year that puts the date nearest the send date */
function inferYear(month: number, day: number, hour: number, minute: number, sentAt: number): number {
  const sentYear = new Date(sentAt).getUTCFullYear();
  let best = sentYear;
  let bestDistance = Infinity;
  for (const year of [sentYear - 1, sentYear, sentYear + 1]) {
    const distance = Math.abs(zonedToEpoch(year, month, day, hour, minute) - sentAt);
    if (distance < bestDistance) {
      best = year;
      bestDistance = distance;
    }
  }
  return best;
}

/** Minutes in a title such as "30m extension" or "1h 15m add-on"; undefined when it states none */
export function minutesInTitle(title: string): number | undefined {
  const hours = /(\d+)\s*(?:h|hr|hrs|hour|hours)(?![a-z])/i.exec(title);
  const minutes = /(\d+)\s*(?:m|min|mins|minutes)(?![a-z])/i.exec(title);
  if (!hours && !minutes) return undefined;
  return (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
}

/** "Monday, November 2 10:00 AM" appearing after `anchor` in the flattened text */
function startAfter(flat: string, anchor: RegExp, sentAt: number): number | null {
  const m = new RegExp(`${anchor.source}.*?${DAY}, ([A-Za-z]+) (\\d{1,2}) (\\d{1,2}:\\d{2} [AP]M)`).exec(flat);
  if (!m) return null;
  const month = monthIndex(m[1]);
  const clock = parseClock(m[3]);
  if (month < 0 || !clock) return null;
  const year = inferYear(month, Number(m[2]), clock[0], clock[1], sentAt);
  return zonedToEpoch(year, month, Number(m[2]), clock[0], clock[1]);
}

function parseBooked(email: RawEmail, guest: string, subjectService: string): ParseResult {
  const flat = flatten(email.body);
  const when = /DATE AND TIME [A-Za-z]{3}, ([A-Za-z]+) (\d{1,2}), (\d{4}) · (\d{1,2}:\d{2} [AP]M) – (\d{1,2}:\d{2} [AP]M) PT/.exec(flat);
  const code = /CONFIRMATION CODE ([A-Z0-9]{6,12})/.exec(flat);
  if (!when || !code) return { relevant: true, problem: `booking email ${email.id}: date/time or confirmation code not found` };

  const month = monthIndex(when[1]);
  const startClock = parseClock(when[4]);
  const endClock = parseClock(when[5]);
  if (month < 0 || !startClock || !endClock) return { relevant: true, problem: `booking email ${email.id}: unreadable date/time` };

  const year = Number(when[3]);
  const day = Number(when[2]);
  const start = zonedToEpoch(year, month, day, startClock[0], startClock[1]);
  let end = zonedToEpoch(year, month, day, endClock[0], endClock[1]);
  if (end <= start) end = zonedToEpoch(year, month, day + 1, endClock[0], endClock[1]); // runs past midnight

  const earnings = /EARNINGS (.{1,80}?) x \d+ guests?/.exec(flat);
  const service = (earnings ? earnings[1] : subjectService).trim();
  return { relevant: true, signal: { kind: 'booked', messageId: email.id, sentAt: email.sentAt, guest, service, start, end, code: code[1] } };
}

/** True for subjects worth fetching the body of */
export function isBookingSubject(subject: string): boolean {
  const s = subject.trim();
  return [BOOKED_SUBJECT, CANCELED_SUBJECT, HOST_CANCELED_SUBJECT, RESCHEDULED_SUBJECT, EXTENDED_SUBJECT].some(p => p.test(s));
}

export function parseBookingEmail(email: RawEmail): ParseResult {
  const subject = email.subject.trim();

  const booked = BOOKED_SUBJECT.exec(subject);
  if (booked) return parseBooked(email, cleanName(booked[1]), booked[2]);

  const flat = flatten(email.body);
  const hostCanceled = HOST_CANCELED_SUBJECT.exec(subject);
  const canceled = CANCELED_SUBJECT.exec(subject);
  if (canceled || hostCanceled) {
    const guest = cleanName((canceled ?? hostCanceled)![1]);
    const start = startAfter(flat, /CANCELED RESERVATION .{1,80}? Hosted by/, email.sentAt);
    if (start === null) return { relevant: true, problem: `cancellation email ${email.id}: start time not found` };
    const service = canceled ? canceled[2].trim() : (/CANCELED RESERVATION (.{1,80}?) Hosted by/.exec(flat)?.[1] ?? '').trim();
    return { relevant: true, signal: { kind: 'canceled', messageId: email.id, sentAt: email.sentAt, guest, service, start } };
  }

  const rescheduled = RESCHEDULED_SUBJECT.exec(subject);
  if (rescheduled) {
    const start = startAfter(flat, /UPDATED RESERVATION .{1,80}? Hosted by/, email.sentAt);
    if (start === null) return { relevant: true, problem: `reschedule email ${email.id}: new start time not found` };
    return {
      relevant: true,
      signal: { kind: 'rescheduled', messageId: email.id, sentAt: email.sentAt, guest: cleanName(rescheduled[1]), service: rescheduled[2].trim(), start },
    };
  }

  const extended = EXTENDED_SUBJECT.exec(subject);
  if (extended) {
    const requestTitle = extended[2].replace(INVISIBLE, '').trim();
    const afterTitle = flat.indexOf(requestTitle);
    const rest = afterTitle >= 0 ? flat.slice(afterTitle + requestTitle.length) : flat;
    const m = new RegExp(`^ (.{1,80}?) ${DAY}, ([A-Za-z]+) (\\d{1,2}) (\\d{1,2}:\\d{2} [AP]M)`).exec(rest);
    const clock = m ? parseClock(m[4]) : null;
    const month = m ? monthIndex(m[2]) : -1;
    if (!m || !clock || month < 0) return { relevant: true, problem: `extension email ${email.id}: booking start not found` };
    const year = inferYear(month, Number(m[3]), clock[0], clock[1], email.sentAt);
    return {
      relevant: true,
      signal: {
        kind: 'extended',
        messageId: email.id,
        sentAt: email.sentAt,
        guest: cleanName(extended[1]),
        service: m[1].trim(),
        start: zonedToEpoch(year, month, Number(m[3]), clock[0], clock[1]),
        extraMinutes: minutesInTitle(requestTitle),
      },
    };
  }

  return { relevant: false };
}
