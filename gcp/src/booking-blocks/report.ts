/**
 * Renders a plan as a plain markdown table. Only client initials are shown, and
 * calendar events are described by time and kind, never by their titles.
 */

import { Appointment, CalendarEvent, PlanItem } from './types';
import { Plan } from './planner';
import { localClock, localDate } from './time';

export function initials(guest: string): string {
  const letters = guest
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(word => word[0].toUpperCase());
  return letters.join('') || '?';
}

const range = (start: number, end: number) => `${localClock(start)}–${localClock(end)}`;

function describeEvent(e: CalendarEvent): string {
  const kind = /^In-Home Massage by /.test(e.summary) ? 'Airbnb' : e.summary === 'Busy' ? 'Busy' : 'other event';
  return `${range(e.start, e.end)} (${kind})`;
}

const SERVICE_LENGTH = (a: Appointment) => Math.round((a.baseEnd - a.start) / 60000);

function services(a: Appointment): string {
  return a.extraMinutes ? `${a.service} + ${a.extraMinutes}m extension` : a.service;
}

function proposedCell(item: PlanItem): string {
  const { action, proposed, existingBlock } = item;
  switch (action) {
    case 'add':
      return `ADD ${range(proposed!.start, proposed!.end)}`;
    case 'update':
      return `UPDATE ${range(existingBlock!.start, existingBlock!.end)} → ${range(proposed!.start, proposed!.end)}`;
    case 'delete':
      return `DELETE our block ${range(existingBlock!.start, existingBlock!.end)}`;
    case 'review':
      return proposed ? `REVIEW (would add ${range(proposed.start, proposed.end)})` : 'REVIEW';
    default:
      return existingBlock ? `none (our block ${range(existingBlock.start, existingBlock.end)} is right)` : 'none (already fully blocked)';
  }
}

export function renderPlan(plan: Plan, generatedAt: number, problems: string[] = []): string {
  const lines: string[] = [];
  const counts = new Map<string, number>();
  for (const i of plan.items) counts.set(i.action, (counts.get(i.action) ?? 0) + 1);

  lines.push('# Massage booking blocks: dry run');
  lines.push('');
  lines.push(`Generated ${localDate(generatedAt)} ${localClock(generatedAt)} PT. Nothing was written to the calendar.`);
  lines.push('');
  lines.push(`Upcoming bookings: ${plan.items.length} (` + ['ok', 'add', 'update', 'delete', 'review'].map(k => `${counts.get(k) ?? 0} ${k}`).join(', ') + ')');
  lines.push('');
  lines.push('| Date | Client | Services | Booked (email) | Current calendar block | Proposed block | Notes |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const item of plan.items) {
    const a = item.appointment;
    const booked = `${range(a.start, a.baseEnd)} (${SERVICE_LENGTH(a)}m)`;
    const current = item.covering.length ? item.covering.map(describeEvent).join('<br>') : 'nothing';
    const cell = (s: string | undefined) => (s ?? '').replace(/\|/g, '/');
    lines.push(`| ${localDate(a.start)} | ${initials(a.guest)} | ${cell(services(a))} | ${booked} | ${current} | ${proposedCell(item)} | ${cell(item.note)} |`);
  }
  if (plan.orphans.length) {
    lines.push('');
    lines.push('Blocks we created whose booking was not found in the emails (left alone):');
    for (const o of plan.orphans) lines.push(`- ${localDate(o.start)} ${range(o.start, o.end)}`);
  }
  if (problems.length) {
    lines.push('');
    lines.push('Emails that could not be matched (need a look):');
    for (const p of problems) lines.push(`- ${p}`);
  }
  lines.push('');
  return lines.join('\n');
}
