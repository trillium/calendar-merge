/**
 * Compares appointments with the calendar and decides which blocks to add,
 * update or delete so the full appointment length is busy.
 *
 * Blocks this tool owns carry a bookingBlockKey (the confirmation code) and are
 * ignored when measuring what the calendar already covers, so the same inputs
 * always produce the same plan.
 */

import { Appointment, CalendarEvent, PlanItem } from './types';

export interface Plan {
  items: PlanItem[];
  /** Blocks we own whose booking is not among the parsed emails; never touched */
  orphans: CalendarEvent[];
}

const MINUTE = 60000;

export function requiredWindow(a: Appointment): { start: number; end: number } {
  return { start: a.start, end: a.baseEnd + a.extraMinutes * MINUTE };
}

/** The parts of [start, end) not covered by any of `events` */
export function uncovered(start: number, end: number, events: CalendarEvent[]): { start: number; end: number }[] {
  const gaps: { start: number; end: number }[] = [];
  let cursor = start;
  for (const e of [...events].sort((a, b) => a.start - b.start)) {
    if (e.end <= cursor) continue;
    if (e.start >= end) break;
    if (e.start > cursor) gaps.push({ start: cursor, end: e.start });
    cursor = Math.max(cursor, e.end);
  }
  if (cursor < end) gaps.push({ start: cursor, end });
  return gaps;
}

export function planBlocks(appointments: Appointment[], events: CalendarEvent[], now: number): Plan {
  const owned = events.filter(e => e.blockKey);
  const others = events.filter(e => !e.blockKey);
  const items: PlanItem[] = [];

  const active = appointments.filter(a => a.status === 'active');
  const notes = (a: Appointment): string[] => {
    const w = requiredWindow(a);
    const out = [...a.review];
    for (const b of active) {
      if (b === a) continue;
      const bw = requiredWindow(b);
      if (bw.start < w.end && bw.end > w.start) out.push('overlaps another booking');
      else if (bw.start === w.end) out.push('back-to-back with the next booking');
    }
    return out;
  };

  for (const a of appointments) {
    const required = requiredWindow(a);
    if (required.end <= now) continue; // already over
    const existing = owned.find(e => e.blockKey === a.key);

    if (a.status === 'canceled') {
      if (existing) items.push({ action: 'delete', appointment: a, required, covering: [], existingBlock: existing, note: 'booking canceled; remove our block' });
      continue;
    }

    const covering = others.filter(e => e.start < required.end && e.end > required.start);
    const gaps = uncovered(required.start, required.end, covering);
    const note = notes(a).join('; ') || undefined;
    const base = { appointment: a, required, covering, existingBlock: existing, note };

    if (gaps.length === 0) {
      items.push(existing ? { ...base, action: 'delete', note: 'calendar now covers the whole booking; remove our block' } : { ...base, action: a.review.length ? 'review' : 'ok' });
      continue;
    }

    const proposed = { start: gaps[0].start, end: gaps[gaps.length - 1].end };
    let action: PlanItem['action'] = 'add';
    if (existing) action = existing.start === proposed.start && existing.end === proposed.end ? 'ok' : 'update';
    if (a.review.length) action = 'review';
    items.push({ ...base, action, proposed });
  }

  const known = new Set(appointments.map(a => a.key));
  const orphans = owned.filter(e => e.end > now && !known.has(e.blockKey!));
  return { items, orphans };
}
