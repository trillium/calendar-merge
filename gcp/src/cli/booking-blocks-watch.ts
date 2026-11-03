#!/usr/bin/env bun
/**
 * Booking Blocks watcher — one dry-run pass, meant to be started on a timer
 * (launchd StartInterval; see deploy/booking-blocks/).
 *
 * It never writes to the calendar: it refreshes the plan file and logs a one
 * line summary. Applying a plan is a separate, explicit `booking-blocks --write`.
 *
 * Env: BOOKING_BLOCKS_ACCOUNT (required), BOOKING_BLOCKS_OUT (plan file, required),
 *      BOOKING_BLOCKS_DAYS (default 30), plus gog's own GOG_* variables.
 */

import fs from 'fs';
import path from 'path';
import { GogReader } from '../booking-blocks/gog-client';
import { renderPlan } from '../booking-blocks/report';
import { runBookingBlocks } from '../booking-blocks/run';

const account = process.env.BOOKING_BLOCKS_ACCOUNT;
const out = process.env.BOOKING_BLOCKS_OUT;
if (!account || !out) {
  console.error('BOOKING_BLOCKS_ACCOUNT and BOOKING_BLOCKS_OUT are required');
  process.exit(1);
}

const now = Date.now();
const result = await runBookingBlocks({
  reader: new GogReader(account),
  calendarId: account,
  now,
  lookbackDays: 180,
  horizonDays: Number(process.env.BOOKING_BLOCKS_DAYS ?? 30),
});

// Write-then-rename so a reader never sees a half-written plan
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(`${out}.tmp`, renderPlan(result.plan, now, result.problems));
fs.renameSync(`${out}.tmp`, out);

const counts: Record<string, number> = {};
for (const item of result.plan.items) counts[item.action] = (counts[item.action] ?? 0) + 1;
console.log(`${new Date(now).toISOString()} booking-blocks dry run: ${JSON.stringify(counts)} problems=${result.problems.length} -> ${out}`);
