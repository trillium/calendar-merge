/**
 * Middleware exports
 */

export {
  requireAuth,
  optionalAuth,
  validateUserId,
} from './auth.middleware';

export { requireApiKey, internalAuthHeaders } from './api-key.middleware';

export {
  verifyWebhook,
  handleSyncState,
} from './webhook-verification.middleware';

export {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  ApiError,
} from './error-handler.middleware';
