/**
 * Folds booking signals, oldest first, into the current set of appointments.
 *
 * State is derived only from the emails, so re-running with the same emails
 * always yields the same appointments.
 */

import { Appointment, BookingSignal } from './types';

export interface LedgerResult {
  appointments: Appointment[];
  /** Signals that matched no booking, or matched ambiguously */
  problems: LedgerProblem[];
}

export interface LedgerProblem {
  /** Start of the booking the signal talked about (epoch ms), to ignore old ones */
  start: number;
  message: string;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function buildAppointments(signals: BookingSignal[]): LedgerResult {
  const ordered = [...signals].sort((a, b) => a.sentAt - b.sentAt);
  const byKey = new Map<string, Appointment>();
  const problems: LedgerProblem[] = [];

  for (const signal of ordered) {
    if (signal.kind === 'booked') {
      if (!signal.code || signal.end === undefined) continue;
      if (byKey.has(signal.code)) continue; // duplicate delivery of the same confirmation
      byKey.set(signal.code, {
        key: signal.code,
        guest: signal.guest,
        service: signal.service,
        start: signal.start,
        baseEnd: signal.end,
        extraMinutes: 0,
        status: 'active',
        review: [],
      });
      continue;
    }

    const active = [...byKey.values()].filter(a => a.status === 'active' && same(a.guest, signal.guest));

    if (signal.kind === 'canceled') {
      const match = active.find(a => a.start === signal.start);
      if (match) match.status = 'canceled';
      else problems.push({ start: signal.start, message: `cancellation (${signal.messageId}) matches no active booking` });
    } else if (signal.kind === 'extended') {
      const match = active.find(a => a.start === signal.start);
      if (!match) {
        problems.push({ start: signal.start, message: `extension (${signal.messageId}) matches no active booking` });
      } else if (signal.extraMinutes === undefined) {
        match.review.push('extension accepted but its length is not in the email');
      } else {
        match.extraMinutes += signal.extraMinutes;
      }
    } else {
      // The reschedule email carries only the new start, so match on guest + service
      const candidates = active.filter(a => same(a.service, signal.service) && a.baseEnd + a.extraMinutes * 60000 > signal.sentAt);
      if (candidates.length === 1) {
        const [match] = candidates;
        const length = match.baseEnd - match.start;
        match.start = signal.start;
        match.baseEnd = signal.start + length;
      } else if (candidates.length === 0) {
        problems.push({ start: signal.start, message: `reschedule (${signal.messageId}) matches no active booking` });
      } else {
        for (const c of candidates) c.review.push('rescheduled, but the email does not say which of this guest\'s bookings moved');
      }
    }
  }

  return { appointments: [...byKey.values()].sort((a, b) => a.start - b.start), problems };
}
