# node-red-contrib-postgrestor Revival

## What This Is

A Node-RED contrib node providing production-grade PostgreSQL integration. Three node types: a config node managing `pg.Pool` connections, a query node executing SQL with Mustache templating, and a listener node for real-time `LISTEN/NOTIFY` push. Currently functional but unmaintained — zero tests, dead CI, accumulated tech debt, and missing critical production features (transactions, streaming, auto-reconnect).

## Core Value

Reliable, production-ready PostgreSQL access from Node-RED flows — with transactions, streaming, and real-time push that doesn't silently fail.

## Requirements

### Validated

- ✓ PostgreSQL connection pooling via `pg.Pool` — existing
- ✓ SQL query execution with Mustache template rendering — existing
- ✓ LISTEN/NOTIFY real-time push messaging — existing
- ✓ Per-node parameterized queries via `msg.params` — existing
- ✓ Configurable pool settings (max, min, idleTimeout, connectionTimeout) — existing
- ✓ SSL connection support (boolean toggle) — existing
- ✓ Node-RED credential storage for username/password — existing
- ✓ Typed input fields (str, num, bool, flow, global, env) — existing
- ✓ i18n support (en-US) — existing
- ✓ Error handling with throwErrors toggle — existing

### Active

**Core Modernization:**
- [ ] TypeScript migration from JavaScript
- [ ] ESLint 9.x flat config (upgrade from 6.8.0)
- [ ] Jest test framework with meaningful test coverage
- [ ] Remove dead `azure-pipelines.yml`

**Bug Fixes & Cleanup:**
- [ ] Remove dead `myPool` module-level variable
- [ ] Fix listener connection leak (add close handler with client release)
- [ ] Replace `console.log` calls with `node.log()` / `node.warn()`
- [ ] Remove or wire the dead `output` config checkbox in PostgresNode HTML
- [ ] Clean up commented-out code in `postgrestor.html` templates
- [ ] Fix locale placeholder swap (min/max)

**Connection & Pooling:**
- [ ] Configurable pool exposed in UI: max connections, idle/connection timeout, statement_timeout
- [ ] Health-check/status node showing pool state (active/idle/waiting) in runtime status
- [ ] SSL/TLS fully configurable: sslmode, CA cert, client cert (for RDS/Azure/Supabase managed DBs)
- [ ] Connection from `DATABASE_URL` or env vars, in addition to individual fields

**Query & Data:**
- [ ] Multi-step transactions — transaction node or array-of-queries on same connection (BEGIN/COMMIT/ROLLBACK)
- [ ] Named parameters beyond positional `$1` — map `msg.params` object `{name: value}` and bind
- [ ] Streaming/cursor mode for large result sets (`pg-cursor`/`pg-query-stream`), emitting row batches
- [ ] COPY support (`pg-copy-streams`) for high-performance CSV import/export
- [ ] Automatic type mapping: `numeric` → number, `jsonb` optional parse, `timestamptz` → ISO, with toggle

**Reliability:**
- [ ] Retry with exponential backoff on transient errors (connection reset, deadlock 40P01, serialization failure 40001)
- [ ] Per-node query timeout with clean cancellation
- [ ] Reusable prepared statements for high-frequency repeated queries

**LISTEN/NOTIFY:**
- [ ] Auto-reconnect on listener connection drop
- [ ] Channel name sanitization to close SQL injection vulnerability (mentioned in README)
- [ ] Auto-parse NOTIFY payload as JSON when possible

**DX / Quality:**
- [ ] SQL editor with syntax highlighting (CodeMirror SQL mode, already in Node-RED)
- [ ] Structured `msg.error` with `code`, `detail`, `constraint`, `table` fields instead of plain string

### Out of Scope

- GitHub Actions CI — deferred; remove Azure pipeline for now, add CI later
- New database backends (only PostgreSQL)

## Context

- **Current state:** The codebase is a single-file JavaScript Node-RED contrib node (`postgrestor.js` 182 lines, `postgrestor.html` 441 lines). It works but is unmaintained.
- **Dependencies:** `pg` ^8.16.2, `mustache` ^4.2.0, `eslint` 6.8.0, `eslint-config-google` 0.14.0
- **Licensing:** GNU AGPL v3 — published as `@topcs/node-red-contrib-postgres`
- **Known issues** documented in `.planning/codebase/CONCERNS.md` — zero tests, dead myPool variable, listener connection leak, outdated ESLint/CI, commented-out HTML code, dead output config, locale swap bug
- **User's top priorities:** transactions, streaming/cursor mode, auto-reconnect listener

## Constraints

- **Runtime:** Node.js >= 18.0.0, Node-RED >= 3.0.0
- **Database:** PostgreSQL only — no multi-database abstraction planned
- **TypeScript:** Full migration (no gradual `.js` + `.d.ts` hybrid)
- **ESLint:** 9.x flat config (not 8.x legacy)
- **Testing:** Jest with ts-jest
- **CI:** None for now — remove Azure pipeline, add GitHub Actions later

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript migration | Modernization, type safety, better DX | — Pending |
| ESLint 9.x flat config | Maintained, modern, replaces deprecated 6.8.0 | — Pending |
| Jest for testing | Most popular Node.js test framework, ts-jest support | — Pending |
| No CI for now | Remove dead Azure pipeline; add GitHub Actions in future | — Pending |
| Full modernization | User chose full revival with new features | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-10 after initialization*
