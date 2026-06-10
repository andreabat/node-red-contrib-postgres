# node-red-contrib-postgrestor Revival

## What This Is

A production-grade Node-RED contrib node for PostgreSQL providing three node types: PostgresDBNode (configurable pg.Pool connections with SSL, health monitoring, DATABASE_URL), PostgresNode (SQL queries with Mustache templating, named parameters, structured errors, transactions, cursor streaming, COPY, retry), and PostgresListenerNode (real-time LISTEN/NOTIFY with auto-reconnect and JSON parsing). Fully migrated to TypeScript with 137 tests and zero regressions.

## Core Value

Reliable, production-ready PostgreSQL access from Node-RED flows — with transactions, streaming, and real-time push that doesn't silently fail.

## Requirements

### Validated

- ✓ PostgreSQL connection pooling via `pg.Pool` — v1.0
- ✓ SQL query execution with Mustache template rendering — v1.0
- ✓ LISTEN/NOTIFY real-time push messaging — v1.0
- ✓ Per-node parameterized queries via `msg.params` — v1.0
- ✓ Configurable pool settings (max, min, idleTimeout, connectionTimeout) — v1.0
- ✓ SSL connection support (sslmode dropdown, CA cert, client cert/key) — v1.0
- ✓ Node-RED credential storage for username/password — v1.0
- ✓ Typed input fields (str, num, bool, flow, global, env) — v1.0
- ✓ i18n support (en-US) — v1.0
- ✓ Error handling with throwErrors toggle — v1.0
- ✓ TypeScript migration (strict:true, ES2022, CommonJS) — v1.0
- ✓ ESLint 9.x flat config — v1.0
- ✓ Jest + ts-jest test framework (137 tests) — v1.0
- ✓ 6 bugs fixed (BUG-01 through BUG-06) — v1.0
- ✓ Pool health badge (active/idle/waiting/total) — v1.0
- ✓ DATABASE_URL connection support — v1.0
- ✓ Named parameter binding (Object.keys insertion order) — v1.0
- ✓ Structured error objects (code, detail, constraint, table, etc.) — v1.0
- ✓ Per-node SET statement_timeout with finally-block reset — v1.0
- ✓ SQL editor with ACE syntax highlighting and autocomplete — v1.0
- ✓ Type mapping: NUMERIC→number, TIMESTAMPTZ→ISO, JSONB→object — v1.0
- ✓ Transparent MD5-hashed prepared statement auto-naming — v1.0
- ✓ Multi-step transactions (BEGIN/COMMIT/ROLLBACK) — v1.0
- ✓ Listener auto-reconnect with jittered exponential backoff — v1.0
- ✓ Channel sanitization via pg-format %I — v1.0
- ✓ NOTIFY JSON auto-parse with raw string fallback — v1.0
- ✓ Cursor streaming via DECLARE/FETCH — v1.0
- ✓ COPY CSV import/export via pg-copy-streams + pipeline() — v1.0
- ✓ Retry on transient errors (40P01, 40001, connection resets) with jittered backoff — v1.0

### Active

*(No active requirements — v1.0 shipped. Run /gsd-new-milestone to define next milestone.)*

### Out of Scope

- GitHub Actions CI — deferred; add later
- New database backends (only PostgreSQL)

## Context

- **Shipped:** v1.0 MVP — 3 phases, 9 plans, 25 tasks, 137 tests
- **Codebase:** ~2,500 LOC TypeScript, fully strict mode, zero JavaScript source files
- **Dependencies:** pg ^8.16.2, mustache ^4.2.0, pg-format ^1.0.4, pg-copy-streams ^7.0.0
- **Test coverage:** 7 test suites, 137 tests, 0 failures
- **Build:** `tsc` clean exit 0, dist/ produced
- **Key files:** src/nodes/PostgresNode.ts (transaction + cursor + COPY + retry), src/nodes/PostgresListenerNode.ts (listenLoop), src/nodes/PostgresDBNode.ts (pool + sslmode + health), src/lib/types.ts (all interfaces)

## Constraints

- **Runtime:** Node.js >= 18.0.0, Node-RED >= 3.0.0
- **Database:** PostgreSQL only
- **TypeScript:** Full migration complete (strict: true, ES2022, CommonJS)
- **ESLint:** 9.x flat config
- **Testing:** Jest + ts-jest
- **CI:** None currently

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript migration | Modernization, type safety, better DX | ✓ Good |
| ESLint 9.x flat config | Maintained, modern, replaces deprecated 6.8.0 | ✓ Good |
| Jest for testing | Most popular Node.js test framework, ts-jest support | ✓ Good |
| No CI for now | Remove dead Azure pipeline; add GitHub Actions in future | — Pending |
| Full modernization | User chose full revival with new features | ✓ Good |
| DECLARE/FETCH instead of pg-cursor | Human checkpoint rejected pg-cursor (SUS flag) | ✓ Good |
| pg-format %I for channel sanitization | Prevents SQL injection in LISTEN/UNLISTEN | ✓ Good |
| D-02 first output:true wins | Transaction semantics: first output:true entry's rows in msg.payload | ✓ Good |
| D-10 retry exclusion | Cursor and COPY paths bypass retry (early return) | ✓ Good |
| D-08 jittered exponential backoff | 500ms base, 30s max, 2x multiplier, full jitter | ✓ Good |

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
*Last updated: 2026-06-10 after v1.0 milestone*
