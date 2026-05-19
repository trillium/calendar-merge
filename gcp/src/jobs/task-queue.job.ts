/**
 * Task Queue Job
 * Local replacement for Cloud Tasks — polls SQLite tasks table
 * and dispatches ready tasks via HTTP to the same endpoints
 * Cloud Tasks would hit in production.
 *
 * Persistence: tasks survive server restarts (stored in SQLite).
 * Retry: failed tasks retry up to 3 times with linear backoff.
 */

import { schedule, type ScheduledTask } from 'node-cron';
import { logger } from '../utils';
import { APP_CONFIG } from '../config';

const log = logger;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 5000; // 5s per attempt

let task: ScheduledTask | null = null;
let processing = false; // guard against overlapping ticks

/**
 * Process all ready tasks from the queue
 */
async function processPendingTasks(): Promise<void> {
  if (processing) return;
  processing = true;

  try {
    const { db } = await import('../db');
    const allTasks = await db.getAll<any>('tasks');
    const now = Date.now();

    const ready = allTasks.filter(
      t => t.status === 'pending' && t.scheduledAt <= now
    );

    if (ready.length === 0) return;

    log.info(`Task queue: ${ready.length} task(s) ready`);

    for (const queuedTask of ready) {
      const { id, endpoint, payload, attempts } = queuedTask;

      // Claim task
      await db.updateDoc('tasks', id, {
        status: 'processing',
        updatedAt: Date.now(),
      });

      try {
        const url = `http://localhost:${APP_CONFIG.PORT}${endpoint}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          await db.updateDoc('tasks', id, {
            status: 'completed',
            updatedAt: Date.now(),
          });
          log.info(`Task queue: completed task ${id} (${endpoint})`);
        } else {
          const body = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
        }
      } catch (error) {
        const nextAttempts = attempts + 1;
        const errMsg = error instanceof Error ? error.message : 'Unknown error';

        if (nextAttempts >= MAX_ATTEMPTS) {
          await db.updateDoc('tasks', id, {
            status: 'failed',
            attempts: nextAttempts,
            error: errMsg,
            updatedAt: Date.now(),
          });
          log.error(`Task queue: task ${id} failed after ${nextAttempts} attempts: ${errMsg}`);
        } else {
          // Back to pending with backoff
          await db.updateDoc('tasks', id, {
            status: 'pending',
            attempts: nextAttempts,
            scheduledAt: Date.now() + nextAttempts * BACKOFF_MS,
            updatedAt: Date.now(),
          });
          log.warn(`Task queue: task ${id} attempt ${nextAttempts} failed, retrying: ${errMsg}`);
        }
      }
    }
  } catch (error) {
    log.error('Task queue: polling error', error);
  } finally {
    processing = false;
  }
}

/**
 * Start the task queue poller
 * Polls every 2 seconds for pending tasks
 */
export function startTaskQueueJob(): void {
  if (task) {
    log.warn('Task queue job already running');
    return;
  }

  // Every 2 seconds (6-field cron = seconds)
  task = schedule('*/2 * * * * *', processPendingTasks);

  log.info('Task queue job scheduled (every 2 seconds)');

  // Process any tasks that were pending before restart
  processPendingTasks().catch(err =>
    log.error('Task queue: initial sweep failed', err)
  );
}

/**
 * Stop the task queue poller
 */
export function stopTaskQueueJob(): void {
  if (task) {
    task.stop();
    task = null;
    log.info('Task queue job stopped');
  }
}
