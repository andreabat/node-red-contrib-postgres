---
phase: 02-production-database-core
plan: 02
subsystem: database
tags: [postgresql, named-params, error-handling, statement-timeout, pg]

# Dependency graph
requires:
  - phase: 02-01
    provides: PostgresNodeConfig fields (useNamedParams, queryTimeout, queryTimeoutFieldType), StructuredError interface
provides:
  - Named parameter binding via msg.params object → positional $N mapping
  - Structured error objects with code/detail/constraint/table from pg DatabaseError
  - Per-node query timeout via SET statement_timeout with clean reset
affects:
  - 02-03 (type mapping, prepared statements — builds on same PostgresNode handler)
  - 03-01 (transactions)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Duck-type check ('code' in err && 'detail' in err) instead of instanceof for pg error detection
    - Insertion-order mapping: Object.keys(msg.params) maps to $1, $2 by position
    - statement_timeout reset in finally before client.release() to prevent timeout leakage

key-files:
  created:
    - src/lib/params.ts — extractNamedParams + bindNamedParams for named parameter binding
    - src/lib/errorFormatter.ts — formatError with duck-type pg DatabaseError extraction
    - src/lib/__tests__/params.test.ts — 8 tests for param extraction and binding
    - src/lib/__tests__/errorFormatter.test.ts — 8 tests for structured error formatting
  modified:
    - src/nodes/PostgresNode.ts — integrates named params, structured errors, query timeout
    - src/nodes/PostgresNode.html — useNamedParams checkbox + queryTimeout typedInput
    - src/nodes/__tests__/PostgresNode.test.ts — 12 new tests + 4 updated error tests

key-decisions:
  - "Duck-type check ('code' in err && 'detail' in err) instead of instanceof DatabaseError for zero import coupling with pg-protocol internals"
  - "Named parameter mapping: Object.keys(msg.params) insertion order determines $1, $2 binding; array params pass through unchanged for backward compatibility"
  - "Default query timeout: 0 (no limit) — users opt in via per-node queryTimeout field"
  - "statement_timeout reset to 0 in finally BEFORE client.release() — prevents timeout leakage across pooled client reuse"
  - "SET statement_timeout failure (e.g., permission denied) logs warning and proceeds with query — does not block execution"

patterns-established:
  - "TDD execution pattern: RED (failing test commit) → GREEN (implementation commit) → REFACTOR (cleanup commit) for each feature"
  - "Pure function utilities in src/lib/ with matching __tests__/ directory, JSDoc comments, named exports"
  - "PostgresNode test mocking: jest.mock for pg, mustache, params, errorFormatter; mockClient controls query/release behavior"

requirements-completed: [QUERY-01, QUERY-02, QUERY-03]

# Metrics
duration: 11min
completed: 2026-06-10
---

# Phase 02 Plan 02: Named Parameters, Structured Errors, and Query Timeout Summary

**Named parameter binding via Object.keys insertion order, duck-type pg error extraction with 13 fields, and per-node SET statement_timeout with finally-block reset — all integrated into PostgresNode input handler**

## Performance

- **Duration:** 11 min
- **Started:** 2026-06-10T14:15:18Z
- **Completed:** 2026-06-10T14:26:05Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- **QUERY-01: Named parameter binding** — `msg.params = {name: "Alice", id: 42}` maps to `$1="Alice", $2=42` via Object.keys insertion order; array params pass through unchanged for backward compatibility
- **QUERY-02: Structured error handling** — pg DatabaseError produces `msg.error` with `code`, `detail`, `constraint`, `table` and 9 other fields via duck-type detection (no pg-protocol import coupling)
- **QUERY-03: Per-node query timeout** — `SET statement_timeout = Nms` before query, reset to 0 in finally before `client.release()`; timeout code 57014 formatted as "Query timeout after Nms"
- **All existing behavior preserved** — Mustache rendering runs before named params, dual-path error handling (throwErrors toggle) fully intact, existing tests updated to expect structured error objects

## Task Commits

Each task was committed atomically:

1. **Task 1: params.ts library** — `69d9110` (test), `cc142bc` (feat) — extractNamedParams with regex/dedup/sort, bindNamedParams with insertion-order mapping
2. **Task 2: errorFormatter.ts library** — `850c95d` (test), `5ee0c0d` (feat) — formatError with duck-type pg detection, fallback for Error/plain objects/primitives
3. **Task 3: PostgresNode integration** — `dbb56b0` (test), `3bd08a8` (feat) — full integration with 32 tests passing (20 existing + 12 new)
4. **Lint fix** — `7d5dda0` (style) — unused import, trailing commas, unused param

## Files Created/Modified

- `src/lib/params.ts` — Named parameter extraction and binding (40 lines)
- `src/lib/errorFormatter.ts` — Structured error formatting with duck-type detection (48 lines)
- `src/lib/__tests__/params.test.ts` — 8 tests for extractNamedParams and bindNamedParams
- `src/lib/__tests__/errorFormatter.test.ts` — 8 tests for formatError across pg errors, generics, edge cases
- `src/nodes/PostgresNode.ts` — Input handler extended with named params, structured errors, query timeout (99 lines)
- `src/nodes/PostgresNode.html` — UI: useNamedParams checkbox, queryTimeout typedInput with defaults (112 lines)
- `src/nodes/__tests__/PostgresNode.test.ts` — Extended with 12 new tests + 4 updated error tests (746 lines)

## Decisions Made

- **Duck-type check over instanceof:** `'code' in err && 'detail' in err` avoids importing from pg-protocol internals. Works with any pg driver that exposes DatabaseError fields on the error object.
- **Insertion-order mapping:** Object.keys(msg.params) determines $1/$2 binding order. Users must order object keys to match positional references. Array params pass through unchanged — zero breaking changes for existing flows.
- **Timeout default 0:** No timeout by default (backward compatible). Users opt in per-node.
- **Timeout reset in finally:** ALWAYS reset `statement_timeout = 0` before `client.release()`. If reset fails, log warning but still release client — prevents connection leaks.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Extended formatError fallback for plain objects with message property**
- **Found during:** Task 2 (errorFormatter GREEN phase)
- **Issue:** Plan's fallback `err instanceof Error ? err.message : String(err)` fails for plain objects like `{message: "custom", code: "CUSTOM"}` — String() produces "[object Object]" instead of the message
- **Fix:** Added intermediate check: `if (err && typeof err === 'object' && 'message' in err)` to extract message from error-like plain objects before falling back to String()
- **Files modified:** src/lib/errorFormatter.ts
- **Verification:** Test "should handle object with code but no detail" passes — message is "custom"
- **Committed in:** 5ee0c0d (Task 2 GREEN commit)

**2. [Rule 3 - Blocking] Updated 4 existing PostgresNode tests for structured error objects**
- **Found during:** Task 3 (PostgresNode GREEN phase)
- **Issue:** Existing tests expected string errors (`expect.stringContaining('SQL error')`) but implementation now produces structured error objects (`{message: 'SQL error'}`)
- **Fix:** Updated 4 tests to use `expect.objectContaining({message: ...})` and set mockFormatError return values
- **Files modified:** src/nodes/__tests__/PostgresNode.test.ts
- **Verification:** All 32 tests pass (20 existing + 12 new)
- **Committed in:** 3bd08a8 (Task 3 GREEN commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** Both fixes necessary for correctness and test integrity. No scope creep.

## Issues Encountered

- Acceptance criterion 5 (`grep -c "queryTimeout" src/nodes/PostgresNode.ts ≥ 2`) shows 1 match because the derived variable `timeoutMs` is used in all subsequent logic rather than repeating `config.queryTimeout`. The functionality is complete — criterion is a grep artifact.
- Acceptance criteria 9 and 10 for PostgresNode.html defaults could not be verified via single-line grep because the HTML uses multi-line object notation (`useNamedParams: { value: false }`). Defaults are correctly set.

## Threat Surface Scan

Threat mitigations implemented as planned:
- **T-02-06 (statement_timeout leakage):** Mitigated — reset to 0 in finally, nested try/catch ensures release even if reset fails
- **T-02-08 (SET permission denied):** Mitigated — try/catch around SET, logs warning and proceeds with query

No new threat surfaces introduced beyond what was planned.

## Next Phase Readiness

Ready for Plan 02-03 (type mapping, prepared statements) — the PostgresNode.ts handler is now the integration point for all Phase 2 features. Prepared statement name hashing and type mapping config will slot into the existing try block structure.

---

*Phase: 02-production-database-core*
*Completed: 2026-06-10*

## Self-Check: PASSED

All 7 files created/modified confirmed on disk. All 7 commits verified. 48/48 tests pass. TypeScript compiles (`tsc --noEmit`). ESLint clean.

(`src/lib/__tests__/params.test.ts` was temporarily absent from disk due to a tool write-path issue — restored from commit 69d9110 and verified passing.)
