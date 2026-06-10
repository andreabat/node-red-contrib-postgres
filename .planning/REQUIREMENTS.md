# Requirements: node-red-contrib-postgrestor Revival

**Defined:** 2026-06-10
**Core Value:** Reliable, production-ready PostgreSQL access from Node-RED flows — with transactions, streaming, and real-time push that doesn't silently fail.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Core Modernization

- [ ] **TSC-01**: Codebase migrated from JavaScript to TypeScript, compiled via `tsc` with ES2022 target and CommonJS modules
- [ ] **TSC-02**: ESLint upgraded to 9.x flat config with typescript-eslint 8.x
- [ ] **TSC-03**: Jest test framework installed with ts-jest, meaningful test coverage for all node types and library modules
- [ ] **TSC-04**: Dead `azure-pipelines.yml` removed from repository

### Bug Fixes & Cleanup

- [ ] **BUG-01**: Dead `myPool` module-level variable removed from `postgrestor.js`
- [ ] **BUG-02**: Listener connection leak fixed — close handler releases persistent client on node removal/redeploy
- [ ] **BUG-03**: All `console.log` calls replaced with `node.log()` / `node.warn()` for Node-RED log integration
- [ ] **BUG-04**: Dead `output` config checkbox either wired to conditionally call `node.send(msg)` or removed from HTML template
- [ ] **BUG-05**: Commented-out code blocks cleaned from `postgrestor.html` templates and defaults
- [ ] **BUG-06**: Locale placeholder swap (min/max) fixed in `locales/en-US/postgrestor.json`

### Connection & Pooling

- [ ] **POOL-01**: Pool configuration (max connections, idleTimeoutMillis, connectionTimeoutMillis, statement_timeout) exposable in Node-RED editor UI via typed inputs
- [ ] **POOL-02**: Health-check / status node displays pool state (active, idle, waiting connections) in the node's runtime status
- [ ] **POOL-03**: SSL/TLS fully configurable — sslmode (disable, require, verify-ca, verify-full), CA certificate, client certificate, client key
- [ ] **POOL-04**: Connection from `DATABASE_URL` environment variable, in addition to individual host/port/database fields

### Query & Data

- [ ] **QUERY-01**: Named parameters supported — `msg.params` as object `{name: value}` mapped to `$1`, `$2`, etc. in the query string
- [ ] **QUERY-02**: Structured `msg.error` output with `code`, `detail`, `constraint`, `table` fields from PostgreSQL error object
- [ ] **QUERY-03**: Per-node query timeout with clean cancellation via `statement_timeout` or AbortController
- [ ] **QUERY-04**: SQL editor in node config with CodeMirror SQL syntax highlighting

### Transactions

- [ ] **TXN-01**: Multi-step transactions via array-of-queries on `msg.payload` — each entry `{query, params, output}` executed atomically on the same client connection
- [ ] **TXN-02**: Full BEGIN/COMMIT/ROLLBACK lifecycle — auto-ROLLBACK on any query failure, client released in `finally`

### LISTEN/NOTIFY

- [ ] **LISTEN-01**: Listener auto-reconnect on connection drop with jittered exponential backoff, stopping only on explicit node close
- [ ] **LISTEN-02**: Channel name sanitized to prevent SQL injection via `pg-format` identifier escaping or equivalent
- [ ] **LISTEN-03**: NOTIFY payload auto-parsed as JSON when valid, with fallback to raw string

### Streaming & Bulk

- [ ] **STREAM-01**: Cursor mode for large result sets via `pg-cursor` — batched row emission with sequential `node.send()` calls and completion signal
- [ ] **STREAM-02**: COPY support via `pg-copy-streams` for high-performance CSV import/export

### Reliability

- [ ] **REL-01**: Retry with exponential backoff on transient errors (connection reset, deadlock 40P01, serialization failure 40001)
- [ ] **REL-02**: Reusable named prepared statements for high-frequency repeated queries, with cache invalidation on pool client release
- [ ] **REL-03**: Automatic type mapping — `numeric` → number, `jsonb` optional parse, `timestamptz` → ISO string — with per-node toggle

## v2 Requirements

Deferred to future release.

(None — all features included in v1 scope)

## Out of Scope

| Feature | Reason |
|---------|--------|
| GitHub Actions CI | Deferred — add after v1 stabilization |
| Database backends beyond PostgreSQL | PostgreSQL-only by design |
| Dedicated transaction node type | Array-of-queries pattern on existing PostgresNode is simpler and equally powerful |
| Separate listener pool | Single pool sufficient for v1; can add `listenerMax` option later if needed |
| Streaming via pg-query-stream | `pg-cursor` approach maps better to Node-RED message model |
| SAVEPOINT support in transactions | Out of scope for v1 |
| `pg-format` for general SQL escaping | Only used for channel name sanitization in LISTEN/NOTIFY |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TSC-01 | Phase 1 | Pending |
| TSC-02 | Phase 1 | Pending |
| TSC-03 | Phase 1 | Pending |
| TSC-04 | Phase 1 | Pending |
| BUG-01 | Phase 2 | Pending |
| BUG-02 | Phase 2 | Pending |
| BUG-03 | Phase 2 | Pending |
| BUG-04 | Phase 2 | Pending |
| BUG-05 | Phase 2 | Pending |
| BUG-06 | Phase 2 | Pending |
| POOL-01 | Phase 3 | Pending |
| POOL-02 | Phase 3 | Pending |
| POOL-03 | Phase 3 | Pending |
| POOL-04 | Phase 3 | Pending |
| QUERY-01 | Phase 4 | Pending |
| QUERY-02 | Phase 4 | Pending |
| QUERY-03 | Phase 4 | Pending |
| QUERY-04 | Phase 4 | Pending |
| LISTEN-01 | Phase 5 | Pending |
| LISTEN-02 | Phase 5 | Pending |
| LISTEN-03 | Phase 5 | Pending |
| TXN-01 | Phase 6 | Pending |
| TXN-02 | Phase 6 | Pending |
| STREAM-01 | Phase 7 | Pending |
| STREAM-02 | Phase 7 | Pending |
| REL-01 | Phase 8 | Pending |
| REL-02 | Phase 8 | Pending |
| REL-03 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-10*
*Last updated: 2026-06-10 after initial definition*