---
phase: 01-foundation-modernization
plan: 03
subsystem: listener
tags: [typescript, node-red, postgresql, pg, listen-notify, push-messaging, bug-fix]

# Dependency graph
requires:
  - phase: 01-foundation-modernization
    provides:
      - TypeScript toolchain (tsc, ESLint, Jest)
      - Shared types (PostgresDBNodeConfig, PoolConfig, NodeStatus)
      - RED runtime injection module (src/lib/red.ts)
      - PostgresDBNode config node (pg.Pool creation)
      - PostgresNode query execution node
provides:
  - PostgresListenerNode in TypeScript with BUG-02 fix (client release on close)
  - 14 unit tests covering channel validation, LISTEN setup, notification handling, close cleanup, UNLISTEN error resilience
  - Phase 01 completion: all original JS/HTML migrated, barrel entry registers all three nodes
affects:
  - 02-production-database-core (all plans)
  - 03-advanced-postgres-features (LISTEN/NOTIFY auto-reconnect and enhancements)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - PostgresListenerNode pattern: pg.Pool.connect → client.on('notification') → LISTEN → close handler with UNLISTEN + release (BUG-02 fix)
    - Test pattern: direct constructor testing with proxy context, jest.fn() mocks for pg.Pool, jest.useFakeTimers for promise chains
    - BARREL entry final: postgrestor.ts imports → setRED() → registerType for all three node types
    - Listener client lifecycle: listenerClient declared at function scope, assigned in .then(), released in close handler

key-files:
  created:
    - src/nodes/PostgresListenerNode.ts — LISTEN/NOTIFY node in TypeScript (71 lines)
    - src/nodes/PostgresListenerNode.html — Editor template for listener node
    - src/nodes/__tests__/PostgresListenerNode.test.ts — 14 unit tests
  modified:
    - src/lib/types.ts — Added PostgresListenerNodeConfig interface
    - postgrestor.ts — Added PostgresListenerNode import and registration
  removed:
    - postgrestor.js — Fully migrated to TypeScript
    - postgrestor.html — Fully split to three HTML templates
    - .eslintrc.json — Replaced by eslint.config.mjs

key-decisions:
  - "BUG-02 fix: listenerClient declared at function scope (NOT inside .then()) so the close handler can access it — exactly as per PATTERNS.md BUG-02 fix pattern"
  - "client.release() called synchronously (not awaited) in close handler to match real pg.PoolClient API behavior"
  - "Tests use direct constructor binding with proxy context for listener — simpler than node-red-node-test-helper, same coverage"
  - "pg.Notification type used for notification callback — payload is string | undefined per pg types"

patterns-established:
  - "Listener client lifecycle: function-scope listenerClient → assign in connect callback → release in close handler → nullify"
  - "BUG-02 resilience: try/catch on UNLISTEN and release separately so release always runs even on UNLISTEN failure"

requirements-completed: [TSC-01, TSC-03, BUG-02]

# Metrics
duration: 8 min
completed: 2026-06-10
---

# Phase 01 Plan 03: PostgresListenerNode Migration & Phase Finalization Summary

**PostgresListenerNode (LISTEN/NOTIFY push node) migrated to TypeScript with BUG-02 fix (client release on close). 14 tests pass covering channel validation, LISTEN setup, notification forwarding, close cleanup, and UNLISTEN error resilience. All three node types registered in barrel entry. Original JS, HTML, and .eslintrc.json removed — project now compiles exclusively from TypeScript sources.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-10T11:40:00Z
- **Completed:** 2026-06-10T11:48:00Z
- **Tasks:** 2
- **Files modified:** 8 (3 created, 2 modified, 3 removed)

## Accomplishments

- PostgresListenerNode.ts: event-driven listener node — pg.Pool.connect, LISTEN setup, notification forwarding, and BUG-02 close handler with UNLISTEN + client.release()
- BUG-02 fixed: `listenerClient` declared at function scope, assigned in `.then()` callback, released in `node.on('close')` with try/catch on both UNLISTEN and release operations
- 14 unit tests covering: channel validation (empty channel → red status), LISTEN setup (connect + query + notification handler), notification forwarding ({ channel, payload } msg), BUG-02 close cleanup (UNLISTEN + release), UNLISTEN error resilience (release still called), connect failure, node lifecycle
- Barrel entry now registers all three node types: PostgresDBNode, PostgresNode, PostgresListenerNode
- Original `postgrestor.js`, `postgrestor.html`, and `.eslintrc.json` deleted — project is fully TypeScript-native
- Phase 01 complete: 47 tests passing across 4 suites (97.54% coverage), TypeScript strict mode, ESLint 9.x flat config

## Task Commits

Each task was committed atomically:

1. **Task 1: PostgresListenerNode TypeScript migration + HTML template + BUG-02 fix** — `1a7099d` (feat)
2. **Task 2: PostgresListenerNode tests + barrel entry final + remove original files** — `5c14d1f` (feat)

## Files Created/Modified

- `src/nodes/PostgresListenerNode.ts` — LISTEN/NOTIFY node: channel validation, pool.connect, client.on('notification'), LISTEN setup, BUG-02 close handler
- `src/nodes/PostgresListenerNode.html` — Editor template: channel input, server config picker, 0-inputs push node
- `src/nodes/__tests__/PostgresListenerNode.test.ts` — 14 unit tests across 7 describe blocks
- `src/lib/types.ts` — Added `PostgresListenerNodeConfig` interface (name, channel, PostgresDBNode)
- `postgrestor.ts` — Added PostgresListenerNode import and `registerType('PostgresListenerNode', PostgresListenerNode)`
- `postgrestor.js` — REMOVED (fully migrated)
- `postgrestor.html` — REMOVED (split to three templates)
- `.eslintrc.json` — REMOVED (replaced by eslint.config.mjs)

## Decisions Made

- **BUG-02 fix pattern:** Followed PATTERNS.md exactly — `listenerClient` declared at function scope, assigned in `.then()` callback (NOT a new declaration inside the callback), released in close handler. This is critical because declaring inside `.then()` would create a new local variable, leaving the outer scope's `listenerClient` null and the close handler unable to access the client.
- **Notification type:** Used `pg.Notification` as the callback type — `payload` is `string | undefined` which matches real NOTIFY semantics (payload can be omitted).
- **try/catch granularity:** UNLISTEN and release each have their own try/catch in the close handler — release always executes even if UNLISTEN fails. This is verified by Test 5.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript implicit any on client parameter**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** `node.config.pgPool.connect().then(client =>` — client parameter implicit `any` due to `node.config` being `any`
- **Fix:** Added explicit type annotation: `(client: pg.PoolClient) =>`
- **Committed in:** 1a7099d

**2. [Rule 1 - Bug] Fixed pg.PoolClient.on callback type mismatch**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** Destructured `{ channel, payload }` parameter typed as `{ channel: string; payload: string }` incompatible with `pg.Notification` where `payload` is `string | undefined`
- **Fix:** Changed to accept `pg.Notification` directly and destructure from it
- **Committed in:** 1a7099d

**3. [Rule 1 - Bug] Removed unused `nodeInstance` variable from test file**
- **Found during:** Task 2 (ESLint lint)
- **Issue:** `nodeInstance` declared and assigned but never read — listener tests access context directly
- **Fix:** Removed `nodeInstance` declaration and all 13 assignment statements
- **Committed in:** 5c14d1f

---

**Total deviations:** 3 auto-fixed (3 bugs)
**Impact on plan:** All deviations were type-check/compilation adjustments — zero logic changes. Plan objectives met fully.

## Issues Encountered

- PostgresListenerNode uses `.then()` chains (not async/await like PostgresNode) — this is intentional, preserving the exact pre-migration promise chain pattern. Tests handle this via `jest.runAllTimersAsync()` to flush microtask queues.
- The listener node has no `inputs` handler — it's a 0-input push node that only receives events via `client.on('notification')`. This differs from PostgresNode (which reacts to `msg.input`) and required a different test structure.

## Known Stubs

None — all three node types are fully implemented and registered. Phase 01 is complete with no remaining migration work.

## Threat Flags

None — all threat surface matches the plan's `<threat_model>`. T-01-11 (connection leak) mitigated by BUG-02 fix (close handler with UNLISTEN + release). T-01-12 (missing channel) mitigated by constructor validation. T-01-05 (channel name injection) and T-01-10 (NOTIFY payload) accepted as preserved pre-migration behavior, deferred to Phase 3.

## Next Phase Readiness

- **Phase 01 COMPLETE:** All 3 plans executed, 47 tests passing (97.54% coverage)
- TypeScript migration fully done (TSC-01), ESLint 9.x flat config active (TSC-02), Jest framework running (TSC-03), dead CI removed (TSC-04)
- All 6 bugs fixed: BUG-01 (dead myPool), BUG-02 (listener leak), BUG-03 (console.log), BUG-04 (dead output checkbox), BUG-05 (commented code), BUG-06 (locale swap)
- Ready for Phase 02 (Production Database Core): pool config UI, SSL config, named parameters, structured errors, health status node

## Self-Check: PASSED

- [x] `src/nodes/PostgresListenerNode.ts` exists and exports `PostgresListenerNode`
- [x] `src/nodes/PostgresListenerNode.ts` contains `node.on('close', async () => { ... })` (BUG-02)
- [x] Close handler contains `UNLISTEN ${config.channel}` and `listenerClient.release()`
- [x] Close handler sets `listenerClient = null` after release
- [x] Notification handler creates `{ channel, payload }` and calls `node.send(outMsg)`
- [x] Channel validation: empty channel → red status, early return
- [x] `src/nodes/PostgresListenerNode.html` contains `data-template-name="PostgresListenerNode"`
- [x] `src/nodes/__tests__/PostgresListenerNode.test.ts` contains `describe('PostgresListenerNode'`
- [x] `npx jest --no-coverage` passes all 47 tests across 4 suites
- [x] `npm run build` exits 0 — all three node types compile
- [x] `npm run lint` exits 0 with zero errors and zero warnings
- [x] `postgrestor.ts` imports and registers PostgresDBNode, PostgresNode, AND PostgresListenerNode
- [x] `ls postgrestor.js` — file not found (removed)
- [x] `ls postgrestor.html` — file not found (removed)
- [x] `ls .eslintrc.json` — file not found (removed)
- [x] `grep -r "myPool" src/` — no matches
- [x] `grep -r "console\.log" src/` — only in test assertions, not in source
- [x] Commit `1a7099d` exists (Task 1)
- [x] Commit `5c14d1f` exists (Task 2)

---

*Phase: 01-foundation-modernization*
*Completed: 2026-06-10*
