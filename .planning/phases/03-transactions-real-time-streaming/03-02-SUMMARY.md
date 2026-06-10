---
phase: 03-transactions-real-time-streaming
plan: 02
subsystem: database
tags: [postgres, listen, notify, reconnection, pg-format, JSON]

# Dependency graph
requires:
  - phase: 02
    provides: pg.Pool connection management (PostgresDBNode), Node-RED lifecycle patterns
provides:
  - listenLoop with jittered exponential backoff reconnection via pg-format sanitized LISTEN
  - JSON auto-parsing of NOTIFY payloads with raw string fallback
  - parseNotifyJson config toggle in PostgresListenerNode editor
  - Badge states: green (listening), yellow (reconnecting), red (disconnected)
affects: [03-03]

# Tech tracking
tech-stack:
  added:
    - pg-format@^1.0.4 (channel identifier sanitization)
    - @types/pg-format@^1.0.0
  patterns:
    - Async listenLoop pattern: while (!closed) { connect -> LISTEN -> wait for error/end -> catch -> backoff }
    - Jittered exponential backoff: Math.min(30000, 500 * 2^attempt) * Math.random()
    - pg-format %I for PostgreSQL identifier escaping
    - try/catch JSON.parse with raw string fallback in notification handler

key-files:
  created: []
  modified:
    - package.json — pg-format runtime dep + @types/pg-format dev dep
    - src/lib/types.ts — parseNotifyJson field on PostgresListenerNodeConfig
    - src/nodes/PostgresListenerNode.ts — Full rewrite: listenLoop with reconnection + JSON parse
    - src/nodes/PostgresListenerNode.html — parseNotifyJson checkbox + defaults + oneditprepare
    - locales/en-US/postgrestor.json — label.parseNotifyJson + title.parseNotifyJson + label.channel

key-decisions:
  - "D-07: Reconnection never gives up — while (!closed) loop; only exit is explicit close"
  - "D-08: Jittered exponential backoff: min(30000, 500 * 2^attempt) * Math.random()"
  - "D-09: Badge states: green 'listening on {channel}' / yellow 'reconnecting (attempt N)' / red 'disconnected'"
  - "LISTEN-02: Channel sanitized via pg-format format('%I', channel) — prevents SQL injection"
  - "LISTEN-03: JSON auto-parse with try/catch fallback to raw string"

patterns-established:
  - "listenLoop pattern: async while (!closed) with backoff + notification handler"
  - "pg-format %I identifier escaping for LISTEN/UNLISTEN"
  - "Best-effort release + null assignment in catch block for cleanup"

requirements-completed: [LISTEN-01, LISTEN-02, LISTEN-03]

# Metrics
duration: 15min
completed: 2026-06-10
---

# Phase 03 Plan 02: Listener Reconnection & Sanitization Summary

**Listener auto-reconnects with jittered backoff, channel sanitized via pg-format, NOTIFY JSON auto-parsed — 21 tests**

## Performance

- **Duration:** 15 min
- **Started:** 2026-06-10T17:50:00Z
- **Completed:** 2026-06-10T18:05:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Async listenLoop replaces fragile .then() chain with robust reconnect loop
- Channel sanitization via pg-format %I prevents SQL injection in LISTEN/UNLISTEN
- JSON auto-parsing of NOTIFY payloads with raw string fallback
- Badge states: green/yellow/red for connection status observability
- Full test coverage (21 tests) including reconnection, sanitization, JSON parsing

## Task Commits

1. **Task 1: Install pg-format, add parseNotifyJson types/editor/i18n** — `9e8e830` (feat)
2. **Task 2: Implement listenLoop with reconnection, channel sanitization** — `f37d203` (feat)
3. **Task 3: Badge state verification and close handler hardening** — `ef5675e` (test)

## Files Created/Modified
- `package.json` — pg-format@^1.0.4 + @types/pg-format@^1.0.0
- `src/lib/types.ts` — parseNotifyJson field on PostgresListenerNodeConfig
- `src/nodes/PostgresListenerNode.ts` — Full rewrite: listenLoop (97 lines)
- `src/nodes/PostgresListenerNode.html` — parseNotifyJson checkbox toggle
- `locales/en-US/postgrestor.json` — i18n strings for parseNotifyJson + channel
- `src/nodes/__tests__/PostgresListenerNode.test.ts` — 21 tests

## Decisions Made
- D-07: Reconnection never gives up — while(!closed) loop, only explicit close stops
- D-08: Jittered exponential backoff: 500ms base, 30s max, 2x multiplier, full jitter
- D-09: Three badge states for connection observability
- LISTEN-02: pg-format %I sanitization for all LISTEN/UNLISTEN queries

## Deviations from Plan

None — plan executed as written. Test infrastructure adapted from fake timers to real timers + setImmediate flushing due to listenLoop's setTimeout-based backoff conflicting with jest.runAllTimersAsync().

## Issues Encountered

- Jest fake timers (`jest.runAllTimersAsync()`) conflict with listenLoop backoff setTimeout — switched to real timers + setImmediate for microtask flushing
- TypeScript null-check warnings on listenerClient after pool.connect() assignment — used non-null assertions (!)

## User Setup Required

None — pg-format is a zero-config library, installed as a runtime dependency. No external service configuration required.

## Next Phase Readiness
- Plan 03-03 (Cursor/COPY/retry) can proceed — listener changes are isolated to PostgresListenerNode
- No PostgresNode changes in this plan (cursor/COPY/retry will build on Plan 01's PostgresNode.ts)

---
*Phase: 03-transactions-real-time-streaming*
*Completed: 2026-06-10*
