# Task 11 Complete: Create Middleware (ODD)

**Status**: ✅ Complete
**Date**: 2025-11-13

## Summary

Created Express middleware modules for authentication, webhook verification, and error handling. Middleware provides security, validation, and consistent error responses for all API routes.

## Files Created

### 1. **auth.middleware.ts** (66 lines)
Authentication and authorization middleware:

**Functions**:
- `requireAuth(req, res, next)` - Validates authentication token
- `optionalAuth(req, res, next)` - Optional authentication (for public endpoints)
- `validateUserId(req, res, next)` - Validates userId parameter exists

**Authentication Strategy**:
- Checks for Authorization header
- Validates bearer token format
- Verifies userId from token/session
- Attaches userId to request object
- Returns 401 Unauthorized if invalid

**Usage Example**:
```typescript
router.get('/calendars/:userId', requireAuth, async (req, res) => {
  // req.userId is available and validated
});
```

### 2. **webhook-verification.middleware.ts** (62 lines)
Google Calendar webhook validation:

**Functions**:
- `verifyWebhook(req, res, next)` - Validates Google webhook headers
- `handleSyncState(req, res, next)` - Handles Google's sync verification

**Webhook Headers Checked**:
- `x-goog-channel-id` - Channel identifier (required)
- `x-goog-resource-state` - State (sync, exists, etc.)
- `x-goog-resource-id` - Resource identifier

**Sync State Handling**:
Google sends initial "sync" request to verify webhook:
```typescript
if (resourceState === 'sync') {
  log.info('Received sync verification from Google');
  res.status(200).send('Sync acknowledged');
  return; // Don't proceed to handler
}
```

**Webhook Data Attachment**:
```typescript
(req as any).webhook = {
  channelId,
  resourceState,
  resourceId,
};
```

**Usage Example**:
```typescript
router.post('/webhook', verifyWebhook, handleSyncState, async (req, res) => {
  const { channelId } = req.webhook;
  await syncCalendarEvents(channelId);
});
```

### 3. **error-handler.middleware.ts** (88 lines)
Centralized error handling:

**Classes**:
- `ApiError` - Custom error with status code and details

**Functions**:
- `errorHandler(error, req, res, next)` - Global error handler
- `notFoundHandler(req, res)` - 404 handler
- `asyncHandler(fn)` - Wraps async functions to catch errors

**Error Response Format**:
```json
{
  "error": "Error message",
  "details": { /* optional details */ }
}
```

**Handled Error Types**:
1. **ApiError** - Custom application errors
   ```typescript
   throw new ApiError(400, 'Invalid userId');
   ```

2. **Google API Errors** - Calendar API errors
   ```typescript
   if (error.code && error.errors) {
     // Google API error format
   }
   ```

3. **Generic Errors** - Unexpected errors
   ```typescript
   // Default to 500 Internal Server Error
   ```

**Usage Example**:
```typescript
// Async handler
router.post('/sync', asyncHandler(async (req, res) => {
  // Errors automatically caught and passed to errorHandler
  throw new ApiError(400, 'Missing userId');
}));

// Error handler (mounted last)
app.use(errorHandler);
```

### 4. **middleware/index.ts** (22 lines)
Central export point for all middleware:

```typescript
export {
  requireAuth,
  optionalAuth,
  validateUserId,
} from './auth.middleware';

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
```

**Benefits**:
- Single import location
- Clean route files
- Easy to add new middleware

## Key Features

### 1. Authentication Flow

**requireAuth**:
```typescript
Authorization: Bearer <token>
↓
Extract token
↓
Validate token
↓
Extract userId
↓
Attach to req.userId
↓
Continue to handler
```

**Error Responses**:
- No token → 401 "Authorization header required"
- Invalid format → 401 "Invalid authorization format"
- Invalid token → 401 "Invalid or expired token"

### 2. Webhook Security

**Google Webhook Headers**:
```
POST /webhook
x-goog-channel-id: abc-123
x-goog-resource-state: exists
x-goog-resource-id: xyz-789
```

**Validation**:
- Missing channelId → 400 "Missing required webhook headers"
- Valid headers → Attach to req.webhook
- Sync state → 200 "Sync acknowledged" (early return)

### 3. Error Handling Strategy

**1. Known Errors (ApiError)**:
```typescript
throw new ApiError(404, 'Calendar not found', { calendarId });
// Response: { "error": "Calendar not found", "details": { "calendarId": "..." } }
```

**2. Google API Errors**:
```typescript
// Google returns: { code: 403, message: "Quota exceeded", errors: [...] }
// Response: { "error": "Quota exceeded", "details": [...] }
```

**3. Unknown Errors**:
```typescript
// Any other error
// Response: { "error": "Internal Server Error", "message": "..." }
```

### 4. Async Error Handling

**Without asyncHandler** (error prone):
```typescript
router.post('/sync', async (req, res, next) => {
  try {
    await syncEvents();
    res.json({ success: true });
  } catch (error) {
    next(error); // Easy to forget!
  }
});
```

**With asyncHandler** (automatic):
```typescript
router.post('/sync', asyncHandler(async (req, res) => {
  await syncEvents();
  res.json({ success: true });
  // Errors automatically caught and passed to errorHandler
}));
```

## Integration Points

**Uses**:
- `logger` utils → Structured logging
- Express types → Request, Response, NextFunction

**Used By**:
- All routes (Task 13) → Authentication, validation, error handling
- webhook.routes → Webhook verification
- sync.routes → Authentication
- calendar.routes → Authentication
- auth.routes → Error handling only (no auth required)

## Middleware Stack Example

**Typical Route**:
```typescript
router.post(
  '/sync/trigger',
  requireAuth,           // 1. Validate auth
  validateUserId,        // 2. Validate userId param
  asyncHandler(async (req, res) => {  // 3. Catch errors
    const { userId } = req;
    await triggerSync(userId);
    res.json({ success: true });
  })
);
```

**Execution Flow**:
```
Request
  ↓
requireAuth → 401 if invalid
  ↓
validateUserId → 400 if missing
  ↓
asyncHandler → Wraps handler
  ↓
Handler → Execute business logic
  ↓
Response OR Error
  ↓
errorHandler → Format error response
```

## Error Response Examples

### ApiError (400)
```json
{
  "error": "Missing required parameter: userId",
  "details": {
    "parameter": "userId",
    "provided": null
  }
}
```

### Google API Error (403)
```json
{
  "error": "Quota exceeded",
  "details": [
    {
      "domain": "calendar",
      "reason": "quotaExceeded",
      "message": "Calendar usage limits exceeded"
    }
  ]
}
```

### Generic Error (500)
```json
{
  "error": "Internal Server Error",
  "message": "Database connection failed"
}
```

### 404 Not Found
```json
{
  "error": "Not Found",
  "path": "/api/unknown",
  "method": "GET",
  "message": "API endpoint not found"
}
```

## Security Considerations

### 1. Authentication
- All user-facing routes require auth
- Webhook routes check Google headers
- Public routes use optionalAuth
- No hardcoded credentials

### 2. Webhook Validation
- Required headers checked
- Google sync handshake handled
- Invalid requests rejected with 400
- Prevents unauthorized webhook calls

### 3. Error Information Leakage
- Stack traces not exposed
- Generic 500 messages
- Detailed errors logged server-side
- Safe error details in development

## Testing Considerations

**Unit Tests Needed**:
- requireAuth with valid/invalid tokens
- verifyWebhook with missing headers
- handleSyncState with sync vs exists
- errorHandler with different error types
- asyncHandler with throwing functions
- notFoundHandler response format

**Integration Tests**:
- Auth middleware in route chain
- Webhook verification flow
- Error responses in real requests
- 404 handling

## Dependencies

**Requires**:
- Task 04: Utils (logger)
- Express (Request, Response, NextFunction types)

**Used By**:
- Task 13 (ODD): Routes - All routes use middleware
- Task 12 (EVEN): Controllers - Via routes
- Task 14 (EVEN): Main app - Error handlers mounted globally

## Configuration

**No external config needed** - middleware is self-contained.

**Future Enhancements**:
- JWT token validation
- Rate limiting middleware
- CORS middleware
- Request logging middleware

## Next Tasks

- Task 13 (ODD): Routes - Use middleware in route definitions
- Task 12 (EVEN): Controllers - Business logic behind routes

## Notes

- All middleware follows Express middleware pattern
- asyncHandler prevents forgotten error handling
- ApiError provides consistent error responses
- Webhook verification prevents unauthorized calls
- Authentication can be JWT, session, or custom
- Error handler logs all errors with context
- 404 handler provides helpful path information
- Middleware is stateless and reusable
- Central exports simplify imports
- Logging aids debugging and monitoring
