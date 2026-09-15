/**
 * Services exports
 */

// Auth service
export {
  createOAuth2Client,
  generateAuthUrl,
  handleOAuthCallback,
  getAuthClient,
  revokeAccess,
  hasValidTokens,
  getUserData,
  setTargetCalendar,
} from './google-auth.service';

// Calendar service
export {
  getCalendarClient,
  listCalendars,
  getCalendar,
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  watchCalendar,
  stopWatch,
  withRateLimit,
} from './google-calendar.service';

// Event sync service
export {
  syncCalendarEvents,
  syncEvent,
} from './event-sync.service';

// Batch sync service
export {
  syncEventsBatchPaginated,
  batchSyncRoundRobin,
  getBatchSyncProgress,
  resetBatchSyncState,
} from './batch-sync.service';

// Batch API service (Google Calendar Batch)
export {
  batchCreateEvents,
  batchUpdateEvents,
} from './google-calendar-batch.service';

// Watch channel service
export {
  createWatchChannel,
  renewWatchChannel,
  deleteWatchChannel,
  getUserWatchChannels,
  getWatchChannel,
  pauseWatchChannel,
  resumeWatchChannel,
  renewExpiringWatchChannels,
  cleanupOrphanedWatches,
} from './watch-channel.service';

// API health tracking
export {
  recordApiCall,
  getApiHealth,
} from './api-health.service';
