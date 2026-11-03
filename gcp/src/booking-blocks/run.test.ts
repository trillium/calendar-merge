import { describe, it, expect } from 'vitest';
import { runBookingBlocks, RunOptions } from './run';
import { renderPlan } from './report';
import { at, bookedEmail, canceledEmail, extendedEmail } from './fixtures';
import { CalendarEvent } from './types';
import { RawEmail } from './parser';

const MIN = 60000;
const NOW = at(3, 1, 0);

/** A fake calendar that records writes and reflects them in later reads */
function fakeWorld(emails: RawEmail[], events: CalendarEvent[]) {
  const writes: string[] = [];
  let seq = 0;
  const reader = {
    fetchBookingEmails: async () => emails,
    fetchEvents: async () => events,
  };
  const writer = {
    create: async (key: string, summary: string, _d: string, start: number, end: number) => {
      writes.push(`create ${key}`);
      events.push({ id: `blk${++seq}`, summary, start, end, blockKey: key });
    },
    update: async (id: string, start: number, end: number) => {
      writes.push(`update ${id}`);
      Object.assign(events.find(e => e.id === id)!, { start, end });
    },
    remove: async (id: string) => {
      writes.push(`remove ${id}`);
      events.splice(events.findIndex(e => e.id === id), 1);
    },
  };
  return { reader, writer, writes, events };
}

const base = (world: ReturnType<typeof fakeWorld>, write: boolean): RunOptions => ({
  reader: world.reader,
  writer: write ? world.writer : undefined,
  calendarId: 'cal',
  now: NOW,
  lookbackDays: 180,
  horizonDays: 30,
});

const booking = bookedEmail({ code: 'AAAA1111', guest: 'Pat Example', when: 'Mon, March 4, 2030 · 10:00 AM – 11:00 AM PT', sentAt: at(2, 20, 9) });
const extension = extendedEmail({ guest: 'Pat Example', requestTitle: '30m extension', dayText: 'Monday, March 4', time: '10:00 AM', sentAt: at(2, 21, 9) });
const platformEvent = (): CalendarEvent => ({ id: 'plat', summary: 'In-Home Massage by Casey', start: at(3, 4, 10), end: at(3, 4, 11) });

describe('runBookingBlocks', () => {
  it('dry run plans the change but writes nothing', async () => {
    const world = fakeWorld([booking, extension], [platformEvent()]);
    const result = await runBookingBlocks(base(world, false));
    expect(result.plan.items[0]).toMatchObject({ action: 'add', proposed: { start: at(3, 4, 11), end: at(3, 4, 11, 30) } });
    expect(result.applied).toEqual([]);
    expect(world.writes).toEqual([]);
  });

  it('write mode applies the plan once and a second pass changes nothing', async () => {
    const world = fakeWorld([booking, extension], [platformEvent()]);
    const first = await runBookingBlocks(base(world, true));
    expect(first.applied).toHaveLength(1);
    const second = await runBookingBlocks(base(world, true));
    expect(second.applied).toEqual([]);
    expect(world.writes).toEqual(['create AAAA1111']);
  });

  it('removes our block when the booking is later canceled', async () => {
    const world = fakeWorld([booking, extension], [platformEvent()]);
    await runBookingBlocks(base(world, true));
    const cancel = canceledEmail({ guest: 'Pat Example', dayText: 'Monday, March 4', time: '10:00 AM', sentAt: at(2, 25, 9) });
    const after = fakeWorld([booking, extension, cancel], world.events);
    const result = await runBookingBlocks(base(after, true));
    expect(result.applied.map(a => a.action)).toEqual(['delete']);
    expect(after.events.some(e => e.blockKey)).toBe(false);
  });

  it('ignores emails sent after the moment being replayed', async () => {
    const world = fakeWorld([booking, extension], []);
    const result = await runBookingBlocks({ ...base(world, false), now: at(2, 20, 12) });
    expect(result.plan.items[0].appointment.extraMinutes).toBe(0);
  });

  it('never applies items marked for review', async () => {
    const vague = extendedEmail({ guest: 'Pat Example', requestTitle: 'Time extension!', dayText: 'Monday, March 4', time: '10:00 AM', sentAt: at(2, 21, 9) });
    const world = fakeWorld([booking, vague], [platformEvent()]);
    const result = await runBookingBlocks(base(world, true));
    expect(result.plan.items[0].action).toBe('review');
    expect(result.plan.items[0].appointment.review).toHaveLength(1);
    expect(world.writes).toEqual([]);
  });

  it('reports unparseable booking emails as problems', async () => {
    const broken = bookedEmail({ code: 'BBBB2222', when: 'garbled', sentAt: at(2, 20, 9) });
    const result = await runBookingBlocks(base(fakeWorld([broken], []), false));
    expect(result.problems).toHaveLength(1);
  });
});

describe('renderPlan', () => {
  it('shows initials and times, never client names or event titles', async () => {
    const secret: CalendarEvent = { id: 's', summary: 'Massage with Jordan Private', start: at(3, 4, 10), end: at(3, 4, 12) };
    const world = fakeWorld([booking, extension], [platformEvent(), secret]);
    const result = await runBookingBlocks(base(world, false));
    const md = renderPlan(result.plan, NOW, result.problems);
    expect(md).toContain('| PE |');
    expect(md).toContain('other event');
    expect(md).not.toMatch(/Pat|Example|Jordan|Private/);
  });
});
