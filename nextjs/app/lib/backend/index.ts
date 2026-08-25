/**
 * Backend service — single entry point.
 *
 * Import { backend } from '@/app/lib/backend' everywhere.
 * To swap implementations, change the factory call below.
 */

export type { BackendService } from './backend-service';
export type {
  AuthStartResult,
  Calendar,
  SetupSyncParams,
  SyncProgress,
  SyncRestartParams,
  SyncStatusResult,
  SyncTriggerParams,
  Watch,
  WatchCreateParams,
} from './types';

import { createGcpBackendService } from './gcp-backend-service';

/** The singleton backend instance. All code imports this. */
export const backend = createGcpBackendService();
