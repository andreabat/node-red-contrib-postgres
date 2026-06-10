# Roadmap: node-red-contrib-postgrestor Revival

## Overview

Reviving a functional but unmaintained Node-RED PostgreSQL contrib node into a production-grade integration with TypeScript, transactions, streaming, and real-time push. The journey moves from modernization and cleanup (Phase 1) through production-grade connections and queries (Phase 2) to advanced operations — transactions, LISTEN/NOTIFY auto-reconnect, streaming, and self-healing retry (Phase 3).

## Phases

- [x] **Phase 1: Foundation & Modernization** — TypeScript migration, tooling upgrade, bug fixes, and codebase cleanup
- [ ] **Phase 2: Production Database Core** — Configurable pools, SSL, named parameters, structured errors, query timeout, SQL editor, type mapping, prepared statements
- [ ] **Phase 3: Transactions, Real-time & Streaming** — Atomic multi-step transactions, LISTEN/NOTIFY with auto-reconnect, cursor streaming, COPY support, and retry with exponential backoff

## Phase Details

### Phase 1: Foundation & Modernization

**Goal**: Developers have a clean, type-safe, fully-tested codebase as the foundation for all feature work — with all existing functionality preserved without regression.
**Mode**: mvp
**Depends on**: Nothing (first phase)
**Requirements**: TSC-01, TSC-02, TSC-03, TSC-04, BUG-01, BUG-02, BUG-03, BUG-04, BUG-05, BUG-06
**Success Criteria** (what must be TRUE):

  1. Project builds cleanly via `tsc` with `strict: true`, `target: ES2022`, `module: commonjs`, producing a loadable Node-RED contrib node
  2. `npm test` runs the full Jest + ts-jest suite with meaningful coverage across all node types and library modules — all tests passing
  3. `npm run lint` passes with ESLint 9.x flat config and typescript-eslint 8.x — zero errors, zero warnings
  4. All existing functionality (pooled queries, Mustache templating, LISTEN/NOTIFY, typed inputs, i18n) works identically to pre-migration — no behavioral regressions
  5. Repository is clean: no dead `azure-pipelines.yml`, no `myPool` module-level variable, all `console.log` calls replaced with Node-RED logging, dead `output` checkbox resolved, commented-out HTML code removed, locale placeholder swap fixed

**Plans**: 3 plans in 3 waves
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — TypeScript tooling scaffold, ESLint 9.x flat config, Jest setup, shared types, getField utility with tests, PostgresDBNode migration with HTML template, barrel entry, BUG-05/BUG-06 fixes, remove azure-pipelines.yml

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — PostgresNode query node migration with HTML template, BUG-01/BUG-03/BUG-04 fixes, PostgresNode tests (success, error paths, client release), barrel entry expansion

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — PostgresListenerNode migration with HTML template, BUG-02 fix (close handler with UNLISTEN+release), listener tests, barrel entry completion, remove original JS/HTML/eslintrc files

### Phase 2: Production Database Core

**Goal**: Developers can configure production-grade PostgreSQL connections and execute queries with named parameters, structured errors, per-node timeouts, type mapping, prepared statements, and a syntax-highlighted SQL editor — all backed by observable pool health.
**Mode**: mvp
**Depends on**: Phase 1
**Requirements**: POOL-01, POOL-02, POOL-03, POOL-04, QUERY-01, QUERY-02, QUERY-03, QUERY-04, REL-02, REL-03
**Success Criteria** (what must be TRUE):

  1. Developer can configure pool limits (max, idleTimeout, connectionTimeout) and full SSL (sslmode dropdown, CA cert, client cert/key) from the Node-RED editor UI, with pool health status (active/idle/waiting/total) visible in the node's runtime badge
  2. Developer can connect using a `DATABASE_URL` environment variable as an alternative to individual host/port/database/credentials fields
  3. Developer passes `msg.params = {name: 'value'}` and the node binds them as positional `$1`, `$2`, etc. — on failure, `msg.error` contains structured fields (`code`, `detail`, `constraint`, `table`, `message`)
  4. Developer can set a per-node query timeout that cleanly cancels queries; the SQL editor provides CodeMirror syntax highlighting in the node config panel
  5. Query results auto-map PostgreSQL types: `numeric` → number, `timestamptz` → ISO string, `jsonb` optional parse (per-node toggle); high-frequency queries can use named prepared statements with automatic cache management

**Plans**: 3 plans in 3 waves

**Wave 1**
- [ ] 02-01-PLAN.md — PostgresDBNode config: sslmode dropdown with progressive cert disclosure (D-01/D-02/D-03), DATABASE_URL connection (POOL-04), pool health badge (POOL-02), enhanced pool config UI (POOL-01)

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 02-02-PLAN.md — PostgresNode query execution: named parameter binding from msg.params object (QUERY-01), structured error objects with code/detail/constraint/table (QUERY-02), per-node query timeout via SET statement_timeout (QUERY-03)

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 02-03-PLAN.md — PostgresNode editor + performance: ACE editor with SQL syntax highlighting/line numbers/autocomplete (QUERY-04), auto type mapping NUMERIC→number, TIMESTAMPTZ→ISO, JSONB→object (REL-03), transparent prepared statements with MD5 hash naming (REL-02, D-04/D-05/D-06)

**UI hint**: yes

### Phase 3: Transactions, Real-time & Streaming

**Goal**: Developers can execute atomic multi-step transactions, receive real-time PostgreSQL notifications with automatic reconnection, stream large result sets via cursors, perform high-performance CSV import/export, and rely on self-healing retry for transient errors.
**Mode**: mvp
**Depends on**: Phase 2
**Requirements**: TXN-01, TXN-02, LISTEN-01, LISTEN-02, LISTEN-03, STREAM-01, STREAM-02, REL-01
**Success Criteria** (what must be TRUE):

  1. Developer sends `msg.payload` as an array of `{query, params, output}` objects and the node executes them atomically in a single transaction (BEGIN → all queries → COMMIT), rolling back automatically on any query failure with `client.release()` guaranteed
  2. LISTEN/NOTIFY nodes auto-reconnect on connection drop with jittered exponential backoff, showing connection state (connected/reconnecting/disconnected) in the runtime badge, and never requiring manual restart after transient outages
  3. NOTIFY payloads are automatically parsed as JSON when valid (with raw string fallback); channel names are sanitized to prevent SQL injection
  4. Developer can enable cursor mode to stream large result sets in configurable row batches — each batch emitted as a sequential message with a final `complete: true` signal — and use COPY for high-performance CSV import/export, with proper client release on node close
  5. Transient PostgreSQL errors (deadlock 40P01, serialization failure 40001, connection resets, etc.) automatically retry with configurable exponential backoff + jitter, up to a configurable max retry count

**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Modernization | 3/3 | Complete | 2026-06-10 |
| 2. Production Database Core | 0/3 | Planned | - |
| 3. Transactions, Real-time & Streaming | 0/TBD | Not started | - |
