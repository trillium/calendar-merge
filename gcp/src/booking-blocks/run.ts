/**
 * One pass of the booking-blocks job: read emails and calendar, plan, and
 * (only when a writer is supplied) apply the plan.
 */

import { buildAppointments } from './ledger';
import { parseBookingEmail } from './parser';
import { Plan, planBlocks } from './planner';
import { BookingSignal, PlanItem } from './types';
import { GogReader, GogWriter } from './gog-client';
import { initials } from './report';
import { localClock, localDate } from './time';

export interface RunOptions {
  reader: Pick<GogReader, 'fetchBookingEmails' | 'fetchEvents'>;
  /** Absent means dry run: nothing is written */
  writer?: Pick<GogWriter, 'create' | 'update' | 'remove'>;
  calendarId: string;
  now: number;
  lookbackDays: number;
  horizonDays: number;
}

export interface RunResult {
  plan: Plan;
  problems: string[];
  applied: { action: string; description: string }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function blockText(item: PlanItem): { summary: string; description: string } {
  const a = item.appointment;
  return {
    summary: `Massage block (${initials(a.guest)})`,
    description: `Auto-block for booking ${a.key} (${localDate(a.start)} ${localClock(a.start)}). Created by calendar-merge-service booking-blocks; safe to delete, it is rebuilt from the emails.`,
  };
}

export async function runBookingBlocks(opts: RunOptions): Promise<RunResult> {
  const emails = await opts.reader.fetchBookingEmails(opts.lookbackDays);

  const signals: BookingSignal[] = [];
  const problems: string[] = [];
  for (const email of emails) {
    if (email.sentAt > opts.now) continue; // replaying an earlier moment: ignore later emails
    const parsed = parseBookingEmail(email);
    if (!parsed.relevant) continue;
    if ('signal' in parsed) signals.push(parsed.signal);
    else problems.push(parsed.problem);
  }

  const ledger = buildAppointments(signals);
  for (const p of ledger.problems) if (p.start >= opts.now - DAY_MS) problems.push(p.message);

  // Look a day back so a booking already in progress still sees its own events
  const events = await opts.reader.fetchEvents(opts.calendarId, opts.now - DAY_MS, opts.now + opts.horizonDays * DAY_MS);
  const plan = planBlocks(ledger.appointments, events, opts.now);

  const applied: RunResult['applied'] = [];
  if (opts.writer) {
    for (const item of plan.items) {
      const { summary, description } = blockText(item);
      if (item.action === 'add') {
        await opts.writer.create(item.appointment.key, summary, description, item.proposed!.start, item.proposed!.end);
      } else if (item.action === 'update') {
        await opts.writer.update(item.existingBlock!.id, item.proposed!.start, item.proposed!.end);
      } else if (item.action === 'delete') {
        await opts.writer.remove(item.existingBlock!.id);
      } else {
        continue;
      }
      applied.push({ action: item.action, description: `${item.appointment.key} ${localDate(item.appointment.start)}` });
    }
  }

  return { plan, problems, applied };
}
