# Archived Code

## functions-legacy-pre-gcp-rewrite/

**Archived:** 2025-11-16  
**Reason:** Full teardown and rewrite using /gcp with proper MVC architecture

The old `/functions/calendar-sync` code was a single Express app with all logic in top-level files.

The new `/gcp` implementation has:
- Proper routes/controllers/services separation
- No code duplication (utilities extracted)
- PageToken-based pagination
- Modern test framework (Vitest)
- Better type safety

This archive is kept for reference only.
