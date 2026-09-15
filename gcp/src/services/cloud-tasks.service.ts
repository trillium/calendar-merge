/**
 * Cloud Tasks Service
 * Handles task creation and scheduling for batch sync operations
 * Uses real Cloud Tasks in production, SQLite-backed task queue locally
 */

import { CloudTasksClient } from '@google-cloud/tasks';
import { logger } from '../utils';
import { BatchTaskPayload } from '../types/batch.types';
import crypto from 'crypto';

const log = logger;

/**
 * Initialize Cloud Tasks client
 * Detects environment and configures client accordingly
 * @returns CloudTasksClient instance
 */
export function getCloudTasksClient(): CloudTasksClient {
  return new CloudTasksClient();
}

/**
 * Create a batch continuation task
 * In production: schedules via Cloud Tasks
 * Locally: persists to SQLite tasks table for the task queue poller
 */
export async function createBatchTask(params: {
  userId: string;
  batchStateId: string;
  batchNumber: number;
  scheduleTime: number;
}): Promise<string> {
  // Use local SQLite task queue unless we have real Cloud Tasks infrastructure
  const project = process.env.GCP_PROJECT_ID || process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;
  const serviceAccountEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
  const useLocalQueue = !project || !serviceAccountEmail || process.env.NODE_ENV === 'development';

  if (useLocalQueue) {
    const { db } = await import('../db');
    const taskId = crypto.randomUUID();

    await db.setDoc('tasks', taskId, {
      id: taskId,
      endpoint: '/batch/continue',
      payload: {
        userId: params.userId,
        batchStateId: params.batchStateId,
        batchNumber: params.batchNumber,
      },
      scheduledAt: params.scheduleTime,
      status: 'pending',
      attempts: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    log.info(`Local task queue: enqueued batch ${params.batchNumber} (task ${taskId})`, {
      batchStateId: params.batchStateId,
      scheduledAt: new Date(params.scheduleTime).toISOString(),
    });

    return `local-task-${taskId}`;
  }

  // Cloud Tasks production path
  const tasksClient = getCloudTasksClient();
  const location = process.env.CLOUD_TASKS_LOCATION || 'us-central1';
  const queue = process.env.CLOUD_TASKS_QUEUE || 'calendar-sync-queue';
  const queuePath = tasksClient.queuePath(project!, location, queue);
  const url = `${process.env.GCP_BACKEND_URL}/batch/continue`;

  const payload: BatchTaskPayload = {
    userId: params.userId,
    batchStateId: params.batchStateId,
    batchNumber: params.batchNumber,
  };

  const task = {
    httpRequest: {
      httpMethod: 'POST' as const,
      url,
      headers: {
        'Content-Type': 'application/json',
      },
      body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      oidcToken: {
        serviceAccountEmail,
      },
    },
    scheduleTime: {
      seconds: Math.floor(params.scheduleTime / 1000),
    },
  };

  const [response] = await tasksClient.createTask({ parent: queuePath, task });

  log.info(
    `Created Cloud Task for batch ${params.batchNumber}, state: ${params.batchStateId}`,
    { taskName: response.name }
  );

  return response.name || '';
}

/**
 * Create a retry task for failed events
 * Schedules retry with exponential backoff
 * @param userId - User ID
 * @param failedEventIds - Array of event IDs that failed
 * @param attempt - Retry attempt number (1-based)
 * @returns Task name/ID
 */
export async function createRetryTask(
  userId: string,
  failedEventIds: string[],
  attempt: number
): Promise<string> {
  // TODO: Implementation
  throw new Error(
    `createRetryTask not implemented (userId=${userId}, events=${failedEventIds.length}, attempt=${attempt})`
  );
}

/**
 * Get the full queue path for Cloud Tasks
 * @returns Formatted queue path string
 */
export function getQueuePath(): string {
  // TODO: Implementation
  throw new Error('getQueuePath not implemented');
}

/**
 * Cancel/delete a scheduled task
 * In production: deletes from Cloud Tasks
 * Locally: deletes from SQLite tasks table
 */
export async function deleteTask(taskName: string): Promise<boolean> {
  // Local task (starts with "local-task-")
  if (taskName.startsWith('local-task-')) {
    const taskId = taskName.replace('local-task-', '');
    const { db } = await import('../db');
    try {
      await db.deleteDoc('tasks', taskId);
      log.info(`Local task queue: deleted task ${taskId}`);
      return true;
    } catch {
      return false;
    }
  }

  // Cloud Tasks
  try {
    const tasksClient = getCloudTasksClient();
    await tasksClient.deleteTask({ name: taskName });
    log.info(`Deleted Cloud Task: ${taskName}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * List pending tasks for a user
 * Locally: queries SQLite tasks table
 * Production: queries Cloud Tasks API
 */
export async function listPendingTasks(userId?: string): Promise<any[]> {
  // Local: query SQLite (same detection as createBatchTask)
  const project = process.env.GCP_PROJECT_ID || process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;
  const serviceAccountEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
  const useLocalQueue = !project || !serviceAccountEmail || process.env.NODE_ENV === 'development';
  if (useLocalQueue) {
    const { db } = await import('../db');
    const allTasks = await db.getAll<any>('tasks');
    const pending = allTasks.filter(t => t.status === 'pending' || t.status === 'processing');

    if (userId) {
      return pending.filter(t => t.payload?.userId === userId);
    }
    return pending;
  }

  // Cloud Tasks: not implemented yet
  return [];
}
