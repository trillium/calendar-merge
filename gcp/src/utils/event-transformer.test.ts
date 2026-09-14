import { describe, it, expect } from 'vitest';
import { isAirbnbEvent, transformEventData } from './event-transformer';

describe('isAirbnbEvent', () => {
  it('matches on summary', () => {
    expect(isAirbnbEvent({ summary: 'Airbnb Reservation' })).toBe(true);
  });

  it('matches on organizer email', () => {
    expect(isAirbnbEvent({ organizer: { email: 'calendar@airbnb.com' } })).toBe(true);
  });

  it('matches on creator email', () => {
    expect(isAirbnbEvent({ creator: { email: 'noreply@airbnb.com' } })).toBe(true);
  });

  it('matches on attendee email', () => {
    expect(
      isAirbnbEvent({ attendees: [{ email: 'guest@example.com' }, { email: 'x@airbnb.com' }] })
    ).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isAirbnbEvent({ summary: 'AIRBNB GUEST' })).toBe(true);
  });

  it('rejects non-Airbnb events', () => {
    expect(
      isAirbnbEvent({ summary: 'Team standup', organizer: { email: 'boss@work.com' } })
    ).toBeFalsy();
  });

  it('is null-safe on empty events', () => {
    expect(isAirbnbEvent({})).toBeFalsy();
  });
});

describe('transformEventData', () => {
  const base = {
    summary: 'Dentist',
    description: 'Teeth cleaning',
    start: { dateTime: '2025-11-13T15:00:00Z' },
    end: { dateTime: '2025-11-13T16:00:00Z' },
    location: 'Main St',
    status: 'confirmed',
  };

  it('prefixes summary with calendar name and busy status', () => {
    const out = transformEventData(base, 'work@example.com');
    expect(out.summary).toBe('[work] Dentist - busy');
  });

  it('marks transparent events as free', () => {
    const out = transformEventData({ ...base, transparency: 'transparent' }, 'work@example.com');
    expect(out.summary).toContain('- free');
    expect(out.transparency).toBe('transparent');
  });

  it('prepends __EVENT__ marker to Airbnb descriptions', () => {
    const out = transformEventData(
      { ...base, summary: 'Airbnb Reservation' },
      'rentals@example.com'
    );
    expect(out.description).toBe('__EVENT__\n\nTeeth cleaning');
  });

  it('uses bare marker when Airbnb event has no description', () => {
    const out = transformEventData({ summary: 'Airbnb' }, 'rentals@example.com');
    expect(out.description).toBe('__EVENT__');
  });

  it('leaves regular descriptions untouched', () => {
    const out = transformEventData(base, 'work@example.com');
    expect(out.description).toBe('Teeth cleaning');
  });

  it('falls back to (No title) for missing summary', () => {
    const out = transformEventData({}, 'work@example.com');
    expect(out.summary).toBe('[work] (No title) - busy');
  });

  it('forces private visibility and passes through times', () => {
    const out = transformEventData(base, 'work@example.com');
    expect(out.visibility).toBe('private');
    expect(out.start).toEqual(base.start);
    expect(out.end).toEqual(base.end);
    expect(out.location).toBe('Main St');
    expect(out.status).toBe('confirmed');
  });
});
