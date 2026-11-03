#!/usr/bin/env bun
/**
 * Booking Blocks CLI
 *
 * Reads Airbnb Services booking emails, compares them with the calendar and
 * prints the blocks needed so every back-to-back / extended booking is fully
 * blocked. DRY RUN unless --write is passed.
 *
 * Run: bun gcp/src/cli/booking-blocks.ts --account you@gmail.com [--days 30] [--out plan.md] [--now ISO] [--write]
 *
 * --now replays the plan as of an earlier moment (read-only; useful with --write off).
 *
 * Needs the gog CLI on PATH with credentials for the account
 * (GOG_KEYRING_BACKEND / GOG_KEYRING_PASSWORD in the environment).
 */

import fs from 'fs';
import path from 'path';
import { parseArgs } from 'util';
import { GogReader, GogWriter } from '../booking-blocks/gog-client';
import { renderPlan } from '../booking-blocks/report';
import { runBookingBlocks } from '../booking-blocks/run';

const { values } = parseArgs({
  options: {
    account: { type: 'string' },
    calendar: { type: 'string' },
    days: { type: 'string', default: '30' },
    lookback: { type: 'string', default: '180' },
    now: { type: 'string' },
    out: { type: 'string' },
    write: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});

if (values.help || !values.account) {
  console.log('Usage: booking-blocks --account <gmail> [--calendar <id>] [--days 30] [--lookback 180] [--now ISO] [--out file.md] [--write]');
  console.log('Without --write nothing is changed on the calendar.');
  process.exit(values.help ? 0 : 1);
}

const account = values.account;
const now = values.now ? Date.parse(values.now) : Date.now();
if (Number.isNaN(now)) throw new Error(`--now is not a date: ${values.now}`);
if (values.write && values.now) throw new Error('--write cannot be combined with --now');
const calendarId = values.calendar ?? account;

const result = await runBookingBlocks({
  reader: new GogReader(account),
  writer: values.write ? new GogWriter(account, calendarId) : undefined,
  calendarId,
  now,
  lookbackDays: Number(values.lookback),
  horizonDays: Number(values.days),
});

const report = renderPlan(result.plan, now, result.problems);
if (values.out) {
  fs.mkdirSync(path.dirname(values.out), { recursive: true });
  fs.writeFileSync(values.out, report);
  console.log(`Plan written to ${values.out}`);
} else {
  console.log(report);
}
if (values.write) {
  console.log(`Applied ${result.applied.length} change(s).`);
  for (const a of result.applied) console.log(`  ${a.action}: ${a.description}`);
} else {
  console.log('Dry run: no calendar changes made.');
}
