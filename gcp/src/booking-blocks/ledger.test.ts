import { describe, it, expect } from 'vitest';
import { buildAppointments } from './ledger';
import { parseBookingEmail, RawEmail } from './parser';
import { at, bookedEmail, canceledEmail, extendedEmail, rescheduledEmail } from './fixtures';
import { BookingSignal } from './types';

const signalsOf = (emails: RawEmail[]): BookingSignal[] =>
  emails.map(e => {
    const r = parseBookingEmail(e);
    if (!r.relevant || !('signal' in r)) throw new Error(`fixture did not parse: ${e.id}`);
    return r.signal;
  });

const book = (code: string, guest: string, when: string, sentAt = at(3, 1, 9), service = '60m Massage') => bookedEmail({ code, guest, when, service, sentAt });

describe('buildAppointments', () => {
  it('turns confirmations into appointments, ignoring a duplicate delivery', () => {
    const e = book('AAAA1111', 'Pat', 'Mon, March 4, 2030 · 10:00 AM – 11:00 AM PT');
    const { appointments } = buildAppointments(signalsOf([e, { ...e, id: 'again' }]));
    expect(appointments).toHaveLength(1);
    expect(appointments[0]).toMatchObject({ key: 'AAAA1111', status: 'active', extraMinutes: 0, start: at(3, 4, 10), baseEnd: at(3, 4, 11) });
  });

  it('adds accepted extensions to the matching booking', () => {
    const { appointments } = buildAppointments(
      signalsOf([
        book('AAAA1111', 'Pat', 'Mon, March 4, 2030 · 10:00 AM – 11:00 AM PT'),
        extendedEmail({ requestTitle: '30m extension', dayText: 'Monday, March 4', time: '10:00 AM', sentAt: at(3, 4, 10, 40) }),
        extendedEmail({ id: 'ext2', requestTitle: '15m extension', dayText: 'Monday, March 4', time: '10:00 AM', sentAt: at(3, 4, 10, 50) }),
      ])
    );
    expect(appointments[0].extraMinutes).toBe(45);
  });

  it('flags an extension with no length for review instead of guessing', () => {
    const { appointments } = buildAppointments(
      signalsOf([
        book('AAAA1111', 'Pat', 'Mon, March 4, 2030 · 10:00 AM – 11:00 AM PT'),
        extendedEmail({ requestTitle: 'Time extension!', dayText: 'Monday, March 4', time: '10:00 AM', sentAt: at(3, 4, 10, 40) }),
      ])
    );
    expect(appointments[0].extraMinutes).toBe(0);
    expect(appointments[0].review).toHaveLength(1);
  });

  it('cancels the booking that starts at the canceled time', () => {
    const { appointments, problems } = buildAppointments(
      signalsOf([
        book('AAAA1111', 'Pat', 'Mon, March 4, 2030 · 10:00 AM – 11:00 AM PT'),
        book('BBBB2222', 'Pat', 'Tue, March 5, 2030 · 10:00 AM – 11:00 AM PT'),
        canceledEmail({ dayText: 'Monday, March 4', time: '10:00 AM', sentAt: at(3, 2, 9) }),
      ])
    );
    expect(appointments.map(a => [a.key, a.status])).toEqual([['AAAA1111', 'canceled'], ['BBBB2222', 'active']]);
    expect(problems).toEqual([]);
  });

  it('moves a rescheduled booking and keeps its length', () => {
    const { appointments } = buildAppointments(
      signalsOf([
        book('AAAA1111', 'Pat', 'Mon, March 4, 2030 · 10:00 AM – 11:30 AM PT'),
        rescheduledEmail({ dayText: 'Friday, March 8', time: '2:00 PM', sentAt: at(3, 2, 9) }),
      ])
    );
    expect(appointments[0]).toMatchObject({ start: at(3, 8, 14), baseEnd: at(3, 8, 15, 30) });
  });

  it('a later cancel finds the booking at its rescheduled time', () => {
    const { appointments } = buildAppointments(
      signalsOf([
        book('AAAA1111', 'Pat', 'Mon, March 4, 2030 · 10:00 AM – 11:00 AM PT'),
        rescheduledEmail({ dayText: 'Friday, March 8', time: '2:00 PM', sentAt: at(3, 2, 9) }),
        canceledEmail({ dayText: 'Friday, March 8', time: '2:00 PM', sentAt: at(3, 3, 9) }),
      ])
    );
    expect(appointments[0].status).toBe('canceled');
  });

  it('flags a reschedule that could be either of two bookings', () => {
    const { appointments } = buildAppointments(
      signalsOf([
        book('AAAA1111', 'Pat', 'Mon, March 4, 2030 · 10:00 AM – 11:00 AM PT'),
        book('BBBB2222', 'Pat', 'Tue, March 5, 2030 · 10:00 AM – 11:00 AM PT'),
        rescheduledEmail({ dayText: 'Friday, March 8', time: '2:00 PM', sentAt: at(3, 2, 9) }),
      ])
    );
    expect(appointments.every(a => a.review.length === 1 && a.start < at(3, 8, 0))).toBe(true);
  });

  it('reports signals that match nothing', () => {
    const { problems } = buildAppointments(signalsOf([canceledEmail({ dayText: 'Monday, March 4', time: '10:00 AM', sentAt: at(3, 2, 9) })]));
    expect(problems).toHaveLength(1);
  });

  it('does not depend on the order emails arrive in', () => {
    const emails = [
      book('AAAA1111', 'Pat', 'Mon, March 4, 2030 · 10:00 AM – 11:00 AM PT'),
      extendedEmail({ requestTitle: '30m extension', dayText: 'Monday, March 4', time: '10:00 AM', sentAt: at(3, 4, 10, 40) }),
    ];
    expect(buildAppointments(signalsOf([...emails].reverse()))).toEqual(buildAppointments(signalsOf(emails)));
  });
});
