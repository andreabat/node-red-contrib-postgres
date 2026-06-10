---
phase: 02-production-database-core
plan: 03
subsystem: database
tags: [postgres, pg, type-mapping, prepared-statements, ace-editor, sql]

# Dependency graph
requires:
  - phase: 02-02
    provides: "Named params (bindNamedParams), structured errors (formatError), query timeout (SET statement_timeout)"
provides:
  - "ACE editor with SQL syntax highlighting, line numbers, auto-completion, bracket matching"
  - "Type mapping library: pg.types.setTypeParser for NUMERIC → number, INT8 → number, TIMESTAMPTZ → ISO 8601"
  - "Per-node type mapping toggles: mapNumeric, mapTimestamptz, parseJsonb (opt-in, off by default)"
  - "Auto-generated prepared statement names via MD5 hash (ps_XXXXXXXX) per D-04/D-05/D-06"
  - "buildQueryTypes() per-query opt-out config with disableAll/disableJsonb modes"
affects: [03-transactions-streaming-push]

# Tech tracking
tech-stack:
  added:
    - "crypto (Node.js built-in) — MD5 hashing for prepared statement names"
  patterns:
    - "module-level hashQuery helper for prepared statement naming"
    - "pg.types.setTypeParser global registration at pool creation, per-query opt-out via types config"
    - "ACE editor options object for enhanced SQL editing (showLineNumbers, wrap, autocomplete)"

key-files:
  created:
    - src/lib/__tests__/typeMapping.test.ts
  modified:
    - src/lib/typeMapping.ts
    - src/nodes/PostgresNode.ts
    - src/nodes/PostgresNode.html
    - src/nodes/__tests__/PostgresNode.test.ts

key-decisions:
  - "MD5 hash truncated to 8 hex chars for prepared statement names (ps_XXXXXXXX) — max 11 chars, well within PostgreSQL 63-byte limit"
  - "Type mapping opt-in per node (off by default) — no breaking change for existing flows"
  - "JSONB toggle defaults to ON (parseJsonb: true) — matches pg's existing default behavior"
  - "ACE editor enhanced with auto-completion (enableBasicAutocompletion, enableLiveAutocompletion) — no CodeMirror migration needed"

patterns-established:
  - "Pattern: registerTypeParsers() called at pool creation (PostgresDBNode), buildQueryTypes() called per-query (PostgresNode)"
  - "Pattern: TDD library module (typeMapping.ts) with 9 unit tests covering mock-based parser verification and config builder modes"
  - "Pattern: HTML template extension — type mapping section with i18n labels + checkbox defaults in defaults block + state init in oneditprepare"

requirements-completed: [QUERY-04, REL-02, REL-03]

# Metrics
duration: 8min
completed: 2026-06-10
---

# Phase 02 Plan 03: ACE SQL Editor, Type Mapping, and Prepared Statements Summary

**Enhanced ACE editor with PostgreSQL syntax highlighting and auto-completion, opt-in pg type mapping (NUMERIC→number, TIMESTAMPTZ→ISO, JSONB→object), and transparent MD5-hashed prepared statement auto-naming per query**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-10T14:33:52Z
- **Completed:** 2026-06-10T14:42:43Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- ACE editor upgraded with line numbers, word wrap, bracket matching, and live SQL auto-completion (QUERY-04)
- Type mapping library (typeMapping.ts) registers pg.types.setTypeParser for NUMERIC, INT8, TIMESTAMPTZ; buildQueryTypes() builds per-query opt-out config with disableAll and disableJsonb modes
- Prepared statements auto-generated via MD5 hash (`ps_XXXXXXXX`) per D-04 — transparent to users, automatically cached per client connection (D-05), invalidated on pool recreation (D-06)
- Type mapping toggles (mapNumeric, mapTimestamptz, parseJsonb) added to PostgresNode config panel — all off by default except parseJsonb (matches pg default)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create typeMapping.ts library (TDD)** — `4af1028` (test), `1543e82` (feat)
2. **Task 2: Enhance ACE editor + type mapping toggles** — `f6f8a95` (feat)
3. **Task 3: Integrate prepared statements + type mapping (TDD)** — `87713cf` (test), `a846ea9` (feat)
4. **Lint fixes** — `0c396f2` (refactor)

**Plan metadata:** (pending)

_Note: TDD tasks (1, 3) have test → feat commits_

## Files Created/Modified

- `src/lib/typeMapping.ts` — registerTypeParsers() and buildQueryTypes() for pg type mapping (replaced stub from plan 02-01)
- `src/lib/__tests__/typeMapping.test.ts` — 9 tests covering setTypeParser verification and config builder modes
- `src/nodes/PostgresNode.html` — ACE editor enhanced options + type mapping checkbox section with i18n labels
- `src/nodes/PostgresNode.ts` — hashQuery() helper, { name, text, values, types } query config, disableAll/disableJsonb logic
- `src/nodes/__tests__/PostgresNode.test.ts` — 9 new tests for prepared statement naming, type mapping integration, token registration; 32 existing tests updated to object-config assertions

## Decisions Made

- Used `import * as pg from 'pg'` for consistency with PostgresDBNode.ts (PATTERNS.md convention)
- MD5 hash truncated to 8 hex chars — 4B namespace, no collision risk for single-node query sets (T-02-11 accepted)
- `parseJsonb` defaults to `true` — pg already parses JSONB by default, toggle controls override
- `registerTypeParsers` not called from PostgresNode — called at pool creation time in PostgresDBNode (plan 02-01)
- Trailing commas removed per ESLint `comma-dangle: never` rule

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated 6 existing test assertions to match new object-config query signature**
- **Found during:** Task 3 (GREEN phase)
- **Issue:** Existing tests asserted `client.query('SELECT 1', [])` — implementation changed to `client.query({ name, text, values, types })`
- **Fix:** Updated assertions to use `expect.objectContaining({ text, values })` pattern; updated query timeout filter from string check to object check
- **Files modified:** src/nodes/__tests__/PostgresNode.test.ts
- **Verification:** All 41 tests pass (32 existing + 9 new)
- **Committed in:** 87713cf (part of RED commit), a846ea9 (GREEN commit)

**2. [Rule 1 - Bug] ESLint trailing comma and unused parameter errors**
- **Found during:** Plan verification
- **Issue:** `comma-dangle: never` rule violated in typeMapping.ts (lines 50, 59) and PostgresNode.ts (line 65); `_oid`/`_format` unused params flagged
- **Fix:** Removed trailing commas; simplified getTypeParser to omit unused params
- **Files modified:** src/lib/typeMapping.ts, src/nodes/PostgresNode.ts
- **Verification:** ESLint clean, tsc passes, all 50 tests pass
- **Committed in:** 0c396f2 (refactor)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bug/compatibility fixes)
**Impact on plan:** Both auto-fixes essential for passing CI gates. No scope creep.

## Issues Encountered

- `TypeFormat` type not exported from `pg` top-level — used `as any` cast for `getTypeParser` format parameter
- Existing tests used `(query, params)` call signature — updated to object-config `{ name, text, values, types }` pattern

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: accept | src/lib/typeMapping.ts | T-02-10: Global pg.types.setTypeParser affects all pools in Node-RED process — accepted per RESEARCH.md A4, with per-node opt-out via buildQueryTypes |
| threat_flag: accept | src/nodes/PostgresNode.ts | T-02-11: MD5 hash collision risk for prepared statement names — accepted, ~1 in 4B probability, error handler catches "already exists" |

## Next Phase Readiness

- Type mapping library and prepared statement integration complete — ready for plan 02-01 integration (PostgresDBNode calls registerTypeParsers at pool creation)
- No blockers for phase completion

---
*Phase: 02-production-database-core*
*Completed: 2026-06-10*
