import { describe, it, expect } from 'vitest';
import { planBlocks, uncovered } from './planner';
import { Appointment, CalendarEvent } from './types';
import { at } from './fixtures';

const MIN = 60000;
const appt = (key: string, start: number, minutes: number, extra = 0, over: Partial<Appointment> = {}): Appointment => ({
  key,
  guest: 'Pat',
  service: '60m Massage',
  start,
  baseEnd: start + minutes * MIN,
  extraMinutes: extra,
  status: 'active',
  review: [],
  ...over,
});
const ev = (id: string, start: number, end: number, blockKey?: string, summary = 'In-Home Massage'): CalendarEvent => ({ id, summary, start, end, blockKey });
const NOW = at(3, 1, 0);

describe('uncovered', () => {
  it('returns the whole range when nothing covers it', () => {
    expect(uncovered(10, 20, [])).toEqual([{ start: 10, end: 20 }]);
  });
  it('returns the gaps around and between events', () => {
    expect(uncovered(0, 100, [ev('a', 10, 30), ev('b', 20, 40), ev('c', 60, 80)])).toEqual([
      { start: 0, end: 10 },
      { start: 40, end: 60 },
      { start: 80, end: 100 },
    ]);
  });
  it('returns nothing when covered', () => {
    expect(uncovered(10, 20, [ev('a', 0, 50)])).toEqual([]);
  });
});

describe('planBlocks', () => {
  const nine = at(3, 4, 9);

  it('is ok when the platform event already covers the booking', () => {
    const { items } = planBlocks([appt('A', nine, 60)], [ev('e1', nine, nine + 60 * MIN)], NOW);
    expect(items[0].action).toBe('ok');
  });

  it('adds a block for the whole booking when the calendar has nothing', () => {
    const { items } = planBlocks([appt('A', nine, 150)], [], NOW);
    expect(items[0]).toMatchObject({ action: 'add', proposed: { start: nine, end: nine + 150 * MIN } });
  });

  it('adds only the extension tail when the platform event covers the base length', () => {
    const { items } = planBlocks([appt('A', nine, 60, 30)], [ev('e1', nine, nine + 60 * MIN)], NOW);
    expect(items[0]).toMatchObject({ action: 'add', proposed: { start: nine + 60 * MIN, end: nine + 90 * MIN } });
  });

  it('blocks the gap in a back-to-back run where only the first booking is on the calendar', () => {
    const second = nine + 60 * MIN;
    const { items } = planBlocks([appt('A', nine, 60), appt('B', second, 60)], [ev('e1', nine, second)], NOW);
    expect(items.map(i => i.action)).toEqual(['ok', 'add']);
    expect(items[0].note).toContain('back-to-back');
    expect(items[1].proposed).toEqual({ start: second, end: second + 60 * MIN });
  });

  it('is idempotent: our own block counts as done on the next pass', () => {
    const first = planBlocks([appt('A', nine, 60, 30)], [ev('e1', nine, nine + 60 * MIN)], NOW);
    const block = ev('ours', first.items[0].proposed!.start, first.items[0].proposed!.end, 'A', 'Massage block');
    const second = planBlocks([appt('A', nine, 60, 30)], [ev('e1', nine, nine + 60 * MIN), block], NOW);
    expect(second.items[0]).toMatchObject({ action: 'ok', existingBlock: { id: 'ours' } });
  });

  it('updates our block when the booking grows', () => {
    const block = ev('ours', nine + 60 * MIN, nine + 90 * MIN, 'A');
    const { items } = planBlocks([appt('A', nine, 60, 60)], [ev('e1', nine, nine + 60 * MIN), block], NOW);
    expect(items[0]).toMatchObject({ action: 'update', proposed: { start: nine + 60 * MIN, end: nine + 120 * MIN } });
  });

  it('deletes our block when the booking is canceled', () => {
    const block = ev('ours', nine, nine + 60 * MIN, 'A');
    const { items } = planBlocks([appt('A', nine, 60, 0, { status: 'canceled' })], [block], NOW);
    expect(items[0]).toMatchObject({ action: 'delete', existingBlock: { id: 'ours' } });
  });

  it('does nothing for a canceled booking with no block of ours', () => {
    expect(planBlocks([appt('A', nine, 60, 0, { status: 'canceled' })], [], NOW).items).toEqual([]);
  });

  it('deletes our block once the platform covers the booking itself', () => {
    const { items } = planBlocks([appt('A', nine, 60)], [ev('e1', nine, nine + 60 * MIN), ev('ours', nine, nine + 60 * MIN, 'A')], NOW);
    expect(items[0].action).toBe('delete');
  });

  it('never acts on a booking needing review, but still shows what it would add', () => {
    const { items } = planBlocks([appt('A', nine, 60, 0, { review: ['extension length unknown'] })], [ev('e1', nine, nine + 30 * MIN)], NOW);
    expect(items[0]).toMatchObject({ action: 'review', proposed: { start: nine + 30 * MIN } });
  });

  it('skips bookings that are already over', () => {
    expect(planBlocks([appt('A', at(2, 1, 9), 60)], [], NOW).items).toEqual([]);
  });

  it('flags overlapping bookings', () => {
    const { items } = planBlocks([appt('A', nine, 60), appt('B', nine + 30 * MIN, 60)], [], NOW);
    expect(items[0].note).toContain('overlaps');
  });

  it('reports our blocks that match no known booking and leaves them alone', () => {
    const orphan = ev('ours', nine, nine + 60 * MIN, 'GONE');
    const plan = planBlocks([], [orphan], NOW);
    expect(plan.orphans).toEqual([orphan]);
    expect(plan.items).toEqual([]);
  });
});
