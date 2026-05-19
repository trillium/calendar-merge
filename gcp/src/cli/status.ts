#!/usr/bin/env bun
/**
 * Calendar Merge Service — Status CLI
 *
 * Reads directly from SQLite to show ground truth.
 * No server required. Run: bun gcp/src/cli/status.ts
 */

import { Database } from 'bun:sqlite';
import path from 'path';

const dbPath = process.env.SQLITE_DB_PATH || path.join(import.meta.dir, '../../data/calendar-sync.db');

if (!require('fs').existsSync(dbPath)) {
  console.log('No database found at', dbPath);
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true });

// --- Watches ---
const watchRows = db.prepare('SELECT id, data FROM watches').all() as { id: string; data: string }[];
const watches = watchRows.map(r => ({ id: r.id, ...JSON.parse(r.data) }));

console.log('\n=== Calendar Sync Status ===\n');

if (watches.length === 0) {
  console.log('No watches configured.\n');
} else {
  const nameWidth = Math.max(12, ...watches.map((w: any) => (w.calendarName || w.calendarId || '').length));

  console.log(
    'Calendar'.padEnd(nameWidth),
    'Status'.padEnd(12),
    'syncToken'.padEnd(10),
    'Events'.padEnd(8),
    'Last Sync'
  );
  console.log('-'.repeat(nameWidth + 12 + 10 + 8 + 24));

  for (const w of watches as any[]) {
    const name = (w.calendarName || w.calendarId || w.id).substring(0, nameWidth);
    const status = w.syncState?.status || 'unknown';
    const hasToken = w.syncToken ? 'YES' : 'NONE';
    const events = w.stats?.totalEventsSynced ?? 0;
    const lastSync = w.stats?.lastSyncTime
      ? new Date(w.stats.lastSyncTime).toLocaleString()
      : '-';

    console.log(
      name.padEnd(nameWidth),
      status.padEnd(12),
      hasToken.padEnd(10),
      String(events).padEnd(8),
      lastSync
    );
  }
}

// --- Task Queue ---
const taskRows = db.prepare('SELECT data FROM tasks').all() as { data: string }[];
const tasks = taskRows.map(r => JSON.parse(r.data));
const pending = tasks.filter((t: any) => t.status === 'pending');
const processing = tasks.filter((t: any) => t.status === 'processing');
const failed = tasks.filter((t: any) => t.status === 'failed');

console.log('\n=== Task Queue ===\n');
console.log(`Total: ${tasks.length}  |  Pending: ${pending.length}  |  Processing: ${processing.length}  |  Failed: ${failed.length}`);

if (pending.length > 0 || processing.length > 0) {
  console.log('\nActive tasks:');
  for (const t of [...processing, ...pending] as any[]) {
    const payload = typeof t.payload === 'string' ? JSON.parse(t.payload) : (t.payload ?? {});
    console.log(`  ${t.status.padEnd(12)} ${t.endpoint}  batch=${payload.batchNumber ?? '?'}  attempts=${t.attempts ?? 0}`);
  }
}

if (failed.length > 0) {
  console.log('\nFailed tasks:');
  for (const t of failed as any[]) {
    console.log(`  ${t.endpoint}  error=${t.lastError || 'unknown'}  attempts=${t.attempts ?? 0}`);
  }
}

// --- Batch States ---
const batchRows = db.prepare('SELECT id, data FROM batchStates').all() as { id: string; data: string }[];
const batches = batchRows.map(r => ({ id: r.id, ...JSON.parse(r.data) }));
const activeBatches = batches.filter((b: any) => b.status === 'processing');

if (activeBatches.length > 0) {
  console.log('\n=== Active Batches ===\n');
  for (const b of activeBatches as any[]) {
    console.log(`  ${b.calendarId || b.id}  events=${b.processedEvents ?? 0}  pages=${b.pagesProcessed ?? '?'}`);
  }
}

console.log('');
db.close();
