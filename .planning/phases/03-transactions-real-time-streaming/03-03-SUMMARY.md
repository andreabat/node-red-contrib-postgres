---
phase: 03-transactions-real-time-streaming
plan: 03
subsystem: database
tags: [postgres, cursor, DECLARE, FETCH, COPY, pg-copy-streams, retry, backoff]

# Dependency graph
requires:
  - phase: 02
    provides: pg.Pool, error formatter, type mapping, named params
  - plan: 03-01
    provides: TransactionQuery interface, transactionMode toggle pattern in PostgresNode
  - plan: 03-02
    provides: pg-format for identifier escaping (pattern reference)
provides:
  - Cursor streaming: DECLARE/FETCH loop for SELECT queries with sequential batch sends
  - COPY import/export: csv via pg-copy-streams with pipeline() error handling
  - Retry: jittered exponential backoff for transient errors (40P01, 40001, connection resets)
  - Editor toggles: cursorMode, copyMode, retryEnabled with typedInputs
  - CursorBatch interface
affects: []

# Tech tracking
tech-stack:
  added:
    - pg-copy-streams@^7.0.0 (COPY protocol support)
  patterns:
    - DECLARE/FETCH cursor pattern: DECLARE → while(FETCH) → batch send → completion signal
    - COPY pattern: copyFrom/to + pipeline() from node:stream/promises
    - Retry: while(true) wrapper with TRANSIENT_CODES whitelist + jittered backoff + client reconnect
    - Dispatch order: COPY → Cursor → Transaction → Single-query (retry applies only to last two)

key-files:
  created:
    - src/lib/pg-copy-streams.d.ts — type declaration for pg-copy-streams module
  modified:
    - src/nodes/PostgresNode.ts — cursor (DECLARE/FETCH), COPY (from/to + pipeline), retry loop
    - src/nodes/PostgresNode.html — 3 checkboxes + 3 typedInputs for cursor/COPY/retry
    - src/lib/types.ts — cursorMode, copyMode, retryEnabled, CursorBatch, etc.
    - locales/en-US/postgrestor.json — 6 labels, 3 placeholders, 6 titles, Advanced section
    - src/nodes/__tests__/PostgresNode.test.ts — 9 new tests (2 cursor, 2 COPY, 5 retry)
    - package.json — pg-copy-streams runtime dependency

key-decisions:
  - "D-04: Cursor Dispatch — cursorMode + SELECT query triggers DECLARE/FETCH path, exclusive with COPY/transaction"
  - "D-05: Cursor only for SELECT — non-SELECT queries ignore cursorMode, fall through to single-query"
  - "D-10: Retry exclusion — retry wraps transaction + single-query paths ONLY; cursor and COPY return early, bypassing retry"
  - "D-12: Transient error detection: SQLSTATE codes (40P01, 40001, 57xxx, 08xxx) + connection error patterns"
  - "pg-cursor rejected via human checkpoint → DECLARE/FETCH manual implementation instead"
  - "CURSOR-01: DECLARE + FETCH loop with sequential node.send per batch"

patterns-established:
  - "DECLARE/FETCH cursor streaming without external library (replacing pg-cursor)"
  - "COPY protocol with pipeline() for stream error propagation"
  - "Retry loop: release + reconnect + backoff + maxRetries gating"

requirements-completed: [STREAM-01, STREAM-02, REL-01]

# Metrics
duration: 25min
completed: 2026-06-10
---

# Phase 03 Plan 03: Cursor Streaming, COPY, Retry Summary

**SELECT streaming via DECLARE/FETCH, CSV import/export via COPY protocol, transient error retry with jittered backoff — 137 total tests**

## Performance

- **Duration:** 25 min
- **Started:** 2026-06-10T18:10:00Z
- **Completed:** 2026-06-10T18:35:00Z
- **Tasks:** 3 (1 checkpoint + 2 implementation)
- **Files modified:** 6 (+ 1 created)

## Accomplishments
- Cursor streaming via PostgreSQL DECLARE/FETCH (no pg-cursor dependency — user rejected)
- COPY FROM/TO via pg-copy-streams with pipeline() for error propagation
- Retry loop with TRANSIENT_CODES (40P01, 40001, 57xxx, 08xxx) + jittered backoff
- Editor toggles for cursorMode, copyMode, retryEnabled with typedInputs
- Cursor/COPY paths exclude retry (D-10) via early return
- 9 new tests: cursor batches, completion signal, COPY from, retry transient, retry non-transient, retry exhaustion

## Task Commits

1. **Task 1: Install pg-copy-streams, add types/editor/i18n** — `91b7879` (feat)
2. **Task 2: Implement cursor (DECLARE/FETCH), COPY, retry runtime + tests** — `a1ba566` (feat)
3. **Human checkpoint: pg-cursor rejected** — Use DECLARE/FETCH manual implementation

## Files Created/Modified
- `src/nodes/PostgresNode.ts` — Cursor (20 lines), COPY (18 lines), Retry (40 lines)
- `src/nodes/PostgresNode.html` — 3 checkboxes + 3 typedInputs + Advanced section
- `src/lib/types.ts` — 9 new fields on PostgresNodeConfig + CursorBatch interface
- `locales/en-US/postgrestor.json` — 15 i18n entries
- `src/lib/pg-copy-streams.d.ts` — TypeScript declaration for pg-copy-streams
- `src/nodes/__tests__/PostgresNode.test.ts` — 9 new tests
- `package.json` — pg-copy-streams@^7.0.0

## Decisions Made
- D-04/D-05: Cursor path for SELECT only, early return in dispatch order
- D-10: Retry exclusion — cursor and COPY return BEFORE retry block
- D-12: Transient error whitelist (TRANSIENT_CODES + CONNECTION_ERROR_PATTERNS)
- pg-cursor rejected by user (SUS flag) → manual DECLARE/FETCH implementation

## Deviations from Plan

**1. pg-cursor rejected at human checkpoint**
- **Issue:** pg-cursor@2.20.0 flagged as SUS due to recent publish date
- **Decision:** User chose "Use DECLARE/FETCH manually" alternative
- **Impact:** No pg-cursor dependency; cursor functionality is self-contained in PostgresNode.ts using raw DECLARE/FETCH/CLOSE

## Issues Encountered

- Jest OOM with retry tests + fake timers — retry loop's recursive setTimeout combined with `jest.runAllTimersAsync()` caused heap exhaustion. Fixed by using `mockRejectedValueOnce` with exact attempt counts.
- pg-copy-streams has no @types package — created `src/lib/pg-copy-streams.d.ts` declaration file.

## User Setup Required

None — pg-copy-streams is a runtime dependency with no external configuration. No API keys or services needed.

---
*Phase: 03-transactions-real-time-streaming*
*Completed: 2026-06-10*
