import { describe, it, expect } from 'vitest';
import { isBookingSubject, minutesInTitle, parseBookingEmail } from './parser';
import { at, bookedEmail, canceledEmail, extendedEmail, rescheduledEmail } from './fixtures';

const sent = at(3, 1, 9);

describe('parseBookingEmail', () => {
  it('reads a confirmation: guest, window, code, service', () => {
    const r = parseBookingEmail(bookedEmail({ when: 'Mon, March 4, 2030 · 7:00 PM – 9:30 PM PT', code: 'ZZZZ9999', service: 'Holiday: 2h30m massage', sentAt: sent }));
    expect(r).toMatchObject({ relevant: true, signal: { kind: 'booked', guest: 'Pat', code: 'ZZZZ9999', service: 'Holiday: 2h30m massage', start: at(3, 4, 19), end: at(3, 4, 21, 30) } });
  });

  it('handles a booking that runs past midnight', () => {
    const r = parseBookingEmail(bookedEmail({ when: 'Mon, March 4, 2030 · 11:00 PM – 12:30 AM PT', sentAt: sent }));
    expect(r).toMatchObject({ signal: { start: at(3, 4, 23), end: at(3, 5, 0, 30) } });
  });

  it('uses the right UTC offset across the spring DST change', () => {
    // 2030-03-10 02:00 PST -> PDT; a 10 March evening booking is PDT (-07:00)
    const r = parseBookingEmail(bookedEmail({ when: 'Sun, March 10, 2030 · 7:00 PM – 8:00 PM PT', sentAt: sent }));
    expect(r).toMatchObject({ signal: { start: Date.UTC(2030, 2, 11, 2, 0) } });
  });

  it('reads a guest cancellation and infers the year from the send date', () => {
    const r = parseBookingEmail(canceledEmail({ dayText: 'Monday, March 4', time: '10:00 AM', sentAt: sent }));
    expect(r).toMatchObject({ relevant: true, signal: { kind: 'canceled', guest: 'Pat', start: at(3, 4, 10) } });
  });

  it('reads a host cancellation ("<name>’s reservation was canceled")', () => {
    const r = parseBookingEmail(canceledEmail({ byHost: true, dayText: 'Monday, March 4', time: '7:30 PM', sentAt: sent }));
    expect(r).toMatchObject({ signal: { kind: 'canceled', guest: 'Pat', start: at(3, 4, 19, 30), service: '60m Massage' } });
  });

  it('picks the next year for a January date mentioned in a December email', () => {
    const r = parseBookingEmail(canceledEmail({ dayText: 'Tuesday, January 8', time: '10:00 AM', sentAt: at(12, 28, 9) }));
    expect(r).toMatchObject({ signal: { start: at(1, 8, 10, 0, 2031) } });
  });

  it('reads a reschedule as the new start only', () => {
    const r = parseBookingEmail(rescheduledEmail({ dayText: 'Friday, March 8', time: '11:00 AM', sentAt: sent }));
    expect(r).toMatchObject({ signal: { kind: 'rescheduled', guest: 'Pat', service: '60m Massage', start: at(3, 8, 11) } });
  });

  it('reads an extension with its length', () => {
    const r = parseBookingEmail(extendedEmail({ requestTitle: '30m extension', dayText: 'Monday, March 4', time: '11:00 AM', sentAt: sent }));
    expect(r).toMatchObject({ signal: { kind: 'extended', guest: 'Pat', start: at(3, 4, 11), extraMinutes: 30 } });
  });

  it('reads an extension whose title has no length (and an emoji)', () => {
    const r = parseBookingEmail(extendedEmail({ requestTitle: 'Time extension! 💆‍♀️', dayText: 'Monday, March 4', time: '11:00 AM', sentAt: sent }));
    expect(r).toMatchObject({ signal: { kind: 'extended', start: at(3, 4, 11), extraMinutes: undefined } });
  });

  it('reports a booking it cannot read instead of guessing', () => {
    const email = bookedEmail({ when: 'sometime next week', sentAt: sent });
    expect(parseBookingEmail(email)).toMatchObject({ relevant: true, problem: expect.stringContaining('not found') });
  });

  it('ignores unrelated mail', () => {
    expect(parseBookingEmail({ id: 'x', subject: 'We sent a payout of $340.00 USD', sentAt: sent, body: 'hi' })).toEqual({ relevant: false });
    expect(parseBookingEmail({ id: 'x', subject: 'Confirmed: Your June 17 photo shoot, here’s your receipt', sentAt: sent, body: 'hi' })).toEqual({ relevant: false });
  });

  it('does not let a hostile guest name smuggle markup or newlines', () => {
    const r = parseBookingEmail(bookedEmail({ guest: 'Pat<script>', when: 'Mon, March 4, 2030 · 7:00 PM – 8:00 PM PT', sentAt: sent }));
    expect(r).toMatchObject({ signal: { guest: 'Patscript' } });
  });
});

describe('isBookingSubject', () => {
  it('selects only the five booking subjects', () => {
    expect(isBookingSubject('Confirmed: Pat booked a massage for March 4')).toBe(true);
    expect(isBookingSubject('Pat canceled their reservation: 60m Massage')).toBe(true);
    expect(isBookingSubject('Reservation reminder: Pat’s massage is scheduled for tomorrow')).toBe(false);
  });
});

describe('minutesInTitle', () => {
  it.each([
    ['30m extension', 30],
    ['1h extension', 60],
    ['1hr 15m add-on', 75],
    ['2hr30m', 150],
    ['Time extension!', undefined],
    ['Tip for 3 people', undefined],
  ])('%s -> %s', (title, minutes) => {
    expect(minutesInTitle(title)).toBe(minutes);
  });
});
