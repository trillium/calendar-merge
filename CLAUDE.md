# Calendar Merge Service

## First thing every session

Run `bun gcp/src/cli/status.ts` (or `cd gcp && bun run status`) to see ground truth from SQLite — watch sync status, task queue state, active batches. Never rely on handover docs or memory for system state.

## Architecture

- **gcp/** — Express backend (Bun runtime), SQLite database at `gcp/data/calendar-sync.db`
- **nextjs/** — Next.js frontend dashboard
- Server runs on port 13013

## Key endpoints

- `GET /sync/status?userId=115699614043593531056` — sync status for all watches
- `POST /sync/trigger` with `{"userId":"..."}` — kick off round-robin sync
- `GET /health` — server health check

## Gotchas

See `~/data/knowledge/entries/work/calendar-merge-service-gotchas.md` for the full list of traps.

## Testing

- `vitest` for Node-compatible tests
- `bun test` for tests using `bun:sqlite` (vitest can't import it)
- Do NOT swap `bun:sqlite` for `better-sqlite3` in production code
