# Milestones

## v1.0 MVP (Shipped: 2026-06-10)

**Phases completed:** 3 phases, 9 plans, 25 tasks

**Key accomplishments:**

- TypeScript + ESLint 9.x + Jest toolchain bootstrap, shared types, typed getField utility with input-guard fixes, PostgresDBNode migration with split HTML template, barrel entry, and bug fixes (BUG-05, BUG-06, TSC-04).
- PostgresNode (query execution node) migrated to TypeScript with BUG-01 (dead myPool removed), BUG-03 (all console.log→node.debug/node.log), BUG-04 (dead output checkbox removed). 17 tests pass covering success, dual-path errors, Mustache rendering, client release, and lifecycle.
- PostgresListenerNode (LISTEN/NOTIFY push node) migrated to TypeScript with BUG-02 fix (client release on close). 14 tests pass covering channel validation, LISTEN setup, notification forwarding, close cleanup, and UNLISTEN error resilience. All three node types registered in barrel entry. Original JS, HTML, and .eslintrc.json removed — project now compiles exclusively from TypeScript sources.
- PostgresDBNode config upgraded with sslmode dropdown, DATABASE_URL parsing, pool health polling, encrypted cert credentials, and legacy SSL auto-migration
- Named parameter binding via Object.keys insertion order, duck-type pg error extraction with 13 fields, and per-node SET statement_timeout with finally-block reset — all integrated into PostgresNode input handler
- Enhanced ACE editor with PostgreSQL syntax highlighting and auto-completion, opt-in pg type mapping (NUMERIC→number, TIMESTAMPTZ→ISO, JSONB→object), and transparent MD5-hashed prepared statement auto-naming per query
- PostgresNode atomic multi-step transaction support via Transaction Mode toggle with BEGIN/COMMIT/ROLLBACK and 12 tests
- Listener auto-reconnects with jittered backoff, channel sanitized via pg-format, NOTIFY JSON auto-parsed — 21 tests
- SELECT streaming via DECLARE/FETCH, CSV import/export via COPY protocol, transient error retry with jittered backoff — 137 total tests

---
