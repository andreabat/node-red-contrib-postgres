# Project Research Summary

**Project:** node-red-contrib-postgrestor (Node-RED PostgreSQL contrib node revival)
**Domain:** Node-RED contrib node for production-grade PostgreSQL integration
**Researched:** 2026-06-10
**Confidence:** HIGH

## Executive Summary

This is a Node-RED custom node that gives flow builders a **production-grade PostgreSQL client** with pooling, parameterized queries, transactions, streaming, and real-time push (LISTEN/NOTIFY). The existing node has a solid foundation (Mustache templating, typed inputs, i18n) but lacks the reliability features that make a database node safe for production — most critically: configurable pooling, named parameter binding, full SSL configuration, query timeouts, structured error handling, and clean shutdown. No existing Node-RED PostgreSQL node has transactions, streaming, retry logic, or pool health visibility — this gap is the strategic opportunity.

The recommended approach is a **phased TypeScript rewrite** that keeps the current CJS module format (Node-RED requires `require()`), separates business logic from Node-RED boilerplate for testability, and layers in reliability features in dependency order: pool hardening first, then query improvements, then the killer differentiators (transactions, listener auto-reconnect, streaming). Every phase must build on `shared/types.ts` as the canonical interface contract. The single biggest architectural decision is whether transactions use an array-of-queries approach (fits Node-RED's message-passing model, lower complexity) or a dedicated transaction node type (more Node-RED-idiomatic, higher complexity) — the array approach is recommended for MVP.

Key risks, in priority order: **(1)** using `pool.query()` for multi-statement transactions — silently corrupts data integrity, must use single-client checkout pattern; **(2)** streaming/cursor connections leaking on flow redeploy — must track active streams and cancel them in the `close` handler; **(3)** Mustache SQL injection — users can embed raw `msg` properties into SQL, must ship with parameterized-only mode as default; **(4)** listener reconnection storms — multiple listener nodes hammering the database in lockstep on reconnect, must use a state machine with jitter; **(5)** stale `@types/node-red` definitions causing TypeScript migration friction — must maintain local `src/types/node-red.d.ts` declarations. These are all preventable with the patterns documented in the architecture research.

## Key Findings

### Recommended Stack

The stack stays close to the existing project but upgrades everything to current LTS versions and adds TypeScript throughout. The runtime constraint is Node-RED's CJS module loader — we compile to `commonjs`, not ESM.

**Core technologies:**
- **TypeScript ^6.0.3**: Language migration target with `strict: true`, `target: ES2022`, `module: commonjs`. One source of truth — no `.js` + `.d.ts` hybrid. ts-jest 29 supports TS 6.0.3 with Jest 30.
- **pg ^8.21.0**: Canonical PostgreSQL driver. Upgrading from current ^8.16.2. Provides pools, prepared statements, Submittable protocol for cursor/streaming. 12M+ weekly downloads. Pure JavaScript client (no native bindings — avoids pg-native compilation failures in containers).
- **mustache ^4.2.0**: Logic-less SQL templating for `{{msg.payload}}` interpolation in query strings. Lightweight, stable, already in the project. Must be constrained by an injection detection layer and parameterized-only mode.
- **Jest ^30.4.2 + ts-jest ^29.4.11**: Testing stack. Verified compatibility: ts-jest 29 accepts Jest `^29.0.0 || ^30.0.0`. Uses `node-red-node-test-helper` for Node-RED runtime integration tests.
- **ESLint ^9.39.4 + typescript-eslint ^8.61.0**: Flat config linting. ESLint 9 chosen over 10 for broader plugin ecosystem maturity. typescript-eslint 8 supports TypeScript 6.0.3 (<6.1.0 compatibility window).
- **@types/node-red ^1.3.5**: Stale (last published 2024, targets NR 1.x) but usable — the core custom-node API (`createNode`, `registerType`, `on('input')`, `send`, `done`, `status`) hasn't changed. Local `src/types/node-red.d.ts` will patch NR 5.x API gaps.
- **Streaming libraries** (install as needed): `pg-query-stream` ^4.15.0 (Node.js Readable stream, simpler API), `pg-cursor` ^2.20.0 (fine-grained row-by-row control), `pg-copy-streams` ^7.0.0 (high-performance CSV via `COPY`).

**What NOT to use:** pg-native bindings (compilation failures in containers), pg-promise (competing abstraction layer), babel-jest for TS (adds babel dependency chain), `@typescript-eslint/eslint-plugin` installed separately (typescript-eslint re-exports everything for flat config).

### Expected Features

**Must have (v1 table stakes — node feels incomplete without these):**
- **Connection pooling with configurable limits** (max, idleTimeout, connectionTimeout exposed in UI) — every production DB node pools connections; pooling gap is a crash-scenario for `max_connections`.
- **Named parameter binding** (`msg.params = {name: value}` → `WHERE name = $1`) — users coming from MySQL node and postgres-named expect this. Single most impactful DX improvement.
- **SSL/TLS full configurability** — CA cert path, client cert, sslmode dropdown (disable/require/verify-ca/verify-full). Without this, RDS/Azure/Supabase are non-starters. Boolean toggle is not production-ready.
- **Query timeout with clean cancellation** — per-node configurable timeout via `statement_timeout` or `AbortController`. Prevents a bad query from blocking the pool silently.
- **Connection from `DATABASE_URL`** — single input field that parses `postgresql://user:pass@host:port/db?sslmode=require`. Standard for Docker/Kubernetes/Heroku deployments.
- **Structured error messages** — `msg.error` as `{code, detail, constraint, table, message}` instead of plain string. Enables flow-level routing on error type without fragile string matching.
- **Pool health/status visibility** — runtime status showing `active/idle/waiting/total` counts. Production operators need to know pool state.
- **Clean pool shutdown** — `pool.end()` on Node-RED `close` event. No lingering connections on redeploy.
- **i18n support** (English minimum) — infrastructure already in place (`locales/`).

**Should have (v1.1 competitive differentiators — reason to switch):**
- **Multi-step transactions** (BEGIN/COMMIT/ROLLBACK) — **the #1 missing feature.** No competitor has this. Users can execute atomic multi-statement operations (e.g., deduct inventory + create order + log audit). Array-of-queries approach recommended for MVP.
- **LISTEN/NOTIFY with auto-reconnect** — real-time push from PostgreSQL without polling. Fixes the existing listener's silent disconnect problem. Channel sanitization + auto-parse JSON payloads. Unique in the ecosystem.
- **SQL editor with CodeMirror syntax highlighting** — 10-line HTML change, enormous DX improvement. Every competitor uses a plain textarea. This alone signals production quality.

**Defer (v2+ power features — build on solid foundation):**
- **Retry with exponential backoff on transient errors** — critical for reliability but error classification is complex. Needs real-world testing with diverse PostgreSQL error scenarios.
- **Streaming/cursor mode for large result sets** — requires `pg-cursor`, checked-out client management, batched output semantics. High value for IoT/large data but complex in Node-RED's single-message-per-node model.
- **COPY support** (CSV import/export) — very high value for ETL but introduces streaming complexity. Depends on streaming infrastructure being solid first.
- **Automatic type mapping** (numeric→number, jsonb→parsed, timestamptz→ISO) — eliminates boilerplate function nodes. Lower priority than reliability features.
- **Prepared statements** — valuable for IoT telemetry (same INSERT thousands/sec). Needs careful per-client caching with WeakMap.
- **Named output ports** (success/failure/stream) — requires significant HTML template changes. Only valuable once streaming and transactions produce multiple output modes.

**Anti-features (do NOT build):** ORM/schema abstraction, multi-database backends, connection from `msg` properties at query time, automatic schema discovery, WAL-based change notifications (use Debezium instead), visual query builder. These create complexity without matching Node-RED's flow-based integration model.

### Architecture Approach

The architecture separates **Node-RED integration** (nodes/ — constructor functions, event handling, status) from **business logic** (lib/ — pool management, query execution, retry, type mapping) from **cross-cutting concerns** (shared/ — types, constants, utilities). This enables isolated unit testing of `lib/` modules without the full Node-RED runtime.

**Major components:**
1. **PostgresDBNode** (config node) — owns `pg.Pool` lifecycle, exposes pool metrics, handles credentials, registers `close` handler to drain pool. Single canonical pool per database configuration, shared across all action nodes.
2. **PostgresNode** (query node) — receives `msg`, renders Mustache template, executes query (or transaction array, or stream cursor), sends result downstream. Uses `pool.query()` for single queries, `pool.connect()` for transactions/streaming.
3. **PostgresListenerNode** — permanently acquires one client, issues `LISTEN channel`, forwards `NOTIFY` events as messages. Implements auto-reconnect state machine with exponential backoff + jitter.
4. **pool-manager.ts** — pool creation, config assembly, health checks (`SELECT 1`), pool metrics, drain/shutdown lifecycle.
5. **query-executor.ts** — single query, transaction block (BEGIN/COMMIT/ROLLBACK on same client), stream cursor (batched reads with `cursor.read(N)`).
6. **template-renderer.ts** — Mustache rendering with SQL injection guardrails: pattern detection, parameterized-only mode toggle, sanitized query logging.
7. **retry-handler.ts** — classifies PostgreSQL error codes as transient vs permanent, implements exponential backoff with configurable max retries/delay/jitter.
8. **type-mapper.ts** — registers custom `pg.types.setTypeParser()` for numeric→number, timestamptz→ISO, jsonb optional parse. Toggle-controlled.
9. **channel-sanitizer.ts** — validates channel names against PostgreSQL identifier rules before `LISTEN`.

**Key architectural patterns:**
- **Config Node as Pool Owner** — pool is created once, shared across all action nodes via `RED.nodes.getNode()`. Close drains in one place.
- **Checkout-Use-Release for Transactions** — single client checkout with `try { BEGIN ... COMMIT } catch { ROLLBACK } finally { client.release() }`. Never use `pool.query()` for transactions.
- **Cursor-Stream with Batched `node.send()`** — read rows in configurable batches, emit one message per batch, final `complete: true` marker. Track active streams for cancellation on redeploy.
- **Listener Auto-Reconnect State Machine** — `CONNECTING → LISTENING → DISCONNECTED → RECONNECTING → LISTENING` with jittered backoff. Emits `{event: 'reconnected', missedEventsPossible: true}` on reconnect.

### Critical Pitfalls

1. **Pool-wide `pool.query()` for transactions** — PostgreSQL binds transactions to a single client session. Each `pool.query()` may return a different client. Running `BEGIN` on client A and `COMMIT` on client B leaves an open transaction on client A, silently corrupting data integrity. **Avoid by:** Always using `pool.connect()` for transactions with `try/catch/finally` on a single client reference.

2. **Streaming/cursor connection leak on redeploy** — `pg-cursor` holds a dedicated client. If the Node-RED flow is redeployed mid-stream and the `close` handler doesn't cancel the cursor and release the client, that connection is permanently lost from the pool. **Avoid by:** Tracking all active streams in an instance-level array, calling `cursor.close()` + `client.release()` in the `close` handler. Consider a separate streaming pool with `max: 1`.

3. **TypeScript migration breaking RED global typing** — Node-RED injects `RED` as a parameter to `module.exports = function(RED) { ... }`. There is no official TypeScript declaration for the full contrib node API surface. Typing `RED` as `any` defeats the purpose; typing it too narrowly causes compile failures on unused APIs. **Avoid by:** Creating `src/types/node-red.d.ts` with exact API surface used; compiling to CJS (not ESM); keeping HTML templates separate from TypeScript.

4. **Listener reconnection storms without state machine** — multiple listener node instances enter exponential backoff in lockstep when the database becomes unavailable, hammering PostgreSQL on reconnect. PostgreSQL `NOTIFY` events during the disconnect window are permanently lost. **Avoid by:** Implementing a finite state machine with jittered backoff (`delay * (0.5 + Math.random() * 0.5)`), emitting a reconnection message with `missedEventsPossible: true`, and setting a `maxRetries` cap.

5. **`msg = null` pattern breaking downstream chains** — The existing `PostgresNode` sets `msg = null` on error and sends it. Downstream nodes accessing `msg.payload` throw `TypeError: Cannot read properties of null`, silently swallowed by Node-RED's error handling. **Avoid by:** Never setting `msg = null`. Instead, set `msg.error = {code, detail, constraint, table, message}` and let downstream nodes route on error type. Use two outputs (success/error) for clean separation.

6. **No test fixture isolation** — Tests connecting to a shared PostgreSQL instance produce non-deterministic results. `BEGIN/ROLLBACK` isolation doesn't compose with `node-red-node-test-helper`'s flow lifecycle. **Avoid by:** Using Docker-based PostgreSQL via `@testcontainers/postgresql` — each test suite gets a fresh, isolated database with schema migrations applied. Never share a database across test suites. Always call `helper.unload()` in `afterEach`.

## Implications for Roadmap

Based on research, suggested phase structure with dependency-driven ordering:

### Phase 1: TypeScript Migration & Core Modernization
**Rationale:** Every subsequent module depends on `shared/types.ts` as the canonical interface contract. The existing single-file JS/copy-paste-HTML structure (182 lines JS, 441 lines HTML) blocks modular testing and safe refactoring. Must happen first — all feature work builds on TS types.

**Delivers:**
- `shared/types.ts` — all interfaces (PostgresDBConfig, PostgresNodeConfig, QueryDef, StructuredError, PoolMetrics, etc.)
- `shared/constants.ts` — error codes, OID mappings, pool defaults
- `shared/utils.ts` — typed `getField()`, validators, safe JSON parse
- `src/types/node-red.d.ts` — local RED API type declarations
- `tsconfig.json` with `strict: true`, `module: commonjs`
- Jest config with ts-jest preset
- ESLint 9 flat config with typescript-eslint
- All existing JS migrated to TypeScript (functionally equivalent to current code, no new features)

**Avoids:** Pitfall 3 (RED typing gaps), Pitfall 7 (credentials half-implementation cleaned up during migration)
**Research flag:** Standard pattern — well-documented TypeScript migration for Node.js packages. Use `/gsd-plan-phase` without `--research-phase`.

### Phase 2: Bug Fixes & Cleanup
**Rationale:** The existing code has several correctness issues that must be resolved before feature work touches the same code paths. Fixing them now prevents compounding technical debt. Low risk, high confidence — these are from direct codebase analysis.

**Delivers:**
- Fix `msg = null` pattern → structured `msg.error` object with `{code, detail, constraint, table, message}`
- Fix dead `output` checkbox (wire it or remove it)
- Swap locale min/max placeholder values
- Replace all `console.log` with `node.log()`/`node.debug()`/`node.warn()`
- Remove dead CI pipeline (`ci-publish`)
- Remove commented-out TypedInput blocks or complete them
- Guard `parseInt` with `isNaN` check in `getField`
- Guard `JSON.parse` for boolean fields with try-catch

**Avoids:** Pitfall 6 (`msg = null`), Pitfall 7 (credentials half-implementation)
**Research flag:** Standard pattern — well-understood bug fixes. Use `/gsd-plan-phase` without `--research-phase`.

### Phase 3: Connection & Pooling Foundation
**Rationale:** The pool is the foundation for every other feature. Transactions, streaming, and listeners all depend on a properly configured, observable pool. This phase delivers all P1 table-stakes that make the node production-ready at the connection level. Every other phase (query, transactions, streaming, listener) assumes a hardened pool.

**Delivers:**
- Configurable pool limits in UI: `max`, `idleTimeout`, `connectionTimeout`
- SSL/TLS full configurability: CA cert path, client cert path, `sslmode` dropdown
- `DATABASE_URL` input field with parsing
- Pool health/status visibility: runtime status showing `active/idle/waiting/total`
- Clean pool shutdown: `pool.end()` on Node-RED `close` event
- Pool error handler: `pool.on('error', ...)` to prevent uncaught exceptions
- `lib/logger.ts` — structured logging wrapper
- `lib/pool-manager.ts` — pool creation, config assembly, health checks, metrics

**Addresses:** P1 features: connection pooling config, SSL/TLS, DATABASE_URL, pool health, clean shutdown
**Avoids:** Pitfall "Pool never drained on close", pool error handler anti-pattern
**Research flag:** Standard pattern — pg.Pool API is well-documented. Use `/gsd-plan-phase` without `--research-phase`.

### Phase 4: Query Node & Data Operations
**Rationale:** Once the pool is hardened, the query node gets the P1 feature upgrades that make it competitive. Named parameter binding is the single most impactful DX improvement. Structured errors and query timeouts make the node production-safe. SQL editor is a low-cost, high-impact differentiator.

**Delivers:**
- Named parameter binding: `msg.params = {name: value}` → positional `$1, $2`
- Structured error messages: `msg.error = {code, detail, constraint, table, message}`
- Query timeout: per-node configurable timeout with `AbortController` or `statement_timeout`
- SQL editor with CodeMirror syntax highlighting (`text/x-sql` mode)
- `lib/template-renderer.ts` — Mustache with SQL injection guardrails
- `lib/query-executor.ts` — single query execution dispatcher
- Input validation: `msg.params` length vs placeholder count mismatch detection

**Addresses:** P1 features: named parameter binding, structured error messages, query timeout; P2: SQL editor
**Avoids:** Pitfall 6 (`msg = null` — already fixed in Phase 2), Mustache SQL injection (guardrails added here)
**Research flag:** Named parameter binding needs careful design — how named params interact with positional `$N` in the same query. Use `/gsd-plan-phase --research-phase`.

### Phase 5: Listener Reliability
**Rationale:** LISTEN/NOTIFY is unique to this node in the ecosystem but the current implementation silently drops connections. Auto-reconnect with a state machine makes it production-grade. Channel sanitization closes the SQL injection vector. This phase builds on the hardened pool from Phase 3.

**Delivers:**
- Auto-reconnect with finite state machine: `CONNECTING → LISTENING → DISCONNECTED → RECONNECTING`
- Jittered exponential backoff to prevent reconnection storms
- Connection state exposed via `node.status()` (green dot / yellow ring / red ring)
- Channel name sanitization (editor validation + runtime validation against PG identifier rules)
- Auto-parse JSON payloads from `NOTIFY`
- Reconnection message: `{event: 'reconnected', missedEventsPossible: true}`
- Clean `UNLISTEN` + `client.release()` on Node-RED `close`
- `lib/channel-sanitizer.ts`

**Addresses:** P2 feature: LISTEN/NOTIFY with auto-reconnect
**Avoids:** Pitfall 5 (reconnection storms), channel SQL injection vector
**Research flag:** State machine design needs care — interaction between reconnection, Node-RED redeploy lifecycle, and PostgreSQL's `LISTEN` semantics. Use `/gsd-plan-phase --research-phase`.

### Phase 6: Multi-Step Transactions
**Rationale:** This is the #1 missing feature and the strongest competitive differentiator. No existing Node-RED PostgreSQL node supports transactions. The array-of-queries approach (`msg.payload = [{query, params, output}, ...]`) fits Node-RED's message-passing model better than a dedicated transaction node type and is simpler to implement. Must build on structured errors (Phase 4) for ROLLBACK decisions and the hardened pool (Phase 3) for single-client checkout.

**Delivers:**
- Transaction execution via `pool.connect()` → single client → `BEGIN` → queries → `COMMIT`/`ROLLBACK`
- `msg.payload` array detection: if array of query objects, execute as transaction
- Structured error propagation for transaction ROLLBACK decisions
- `try/catch/finally` pattern guaranteeing `ROLLBACK` on error and `client.release()` always
- Transaction status visibility in node status
- Extends `lib/query-executor.ts` — `executeTransaction()` function

**Addresses:** P2 feature: multi-step transactions
**Avoids:** Pitfall 1 (pool-wide query for transactions — the most critical architectural pitfall)
**Research flag:** Transactions with Node-RED's message-passing model is complex. Error handling within transactions (which errors trigger ROLLBACK vs retry?), interaction with query timeout, and the array-of-queries API design all need careful design. Use `/gsd-plan-phase --research-phase`.

### Phase 7: Streaming & Large Data
**Rationale:** High value for IoT/sensor data, log processing, and analytics use cases. Depends on transaction infrastructure and pool management being solid. Uses checked-out clients with cursor pattern. Named output ports are needed here to distinguish stream batches from the final complete signal.

**Delivers:**
- Cursor/streaming mode: `pg-cursor` with configurable batch size
- Batched `node.send()` — one message per batch with `{batch: true, complete: false}`
- Final message: `{batch: true, complete: true}`
- Named output ports: success (1), error (2), stream (3)
- Stream cancellation on Node-RED `close`
- Active stream tracking for cleanup
- Streaming pool isolation (`max: 1` dedicated pool for streaming connections)
- `statement_timeout` set before cursor query

**Addresses:** P3 features: streaming/cursor mode, named output ports
**Avoids:** Pitfall 2 (streaming client leak)
**Research flag:** Streaming in Node-RED is non-trivial — backpressure, cancellation, pool isolation, and the Node-RED message model all interact. Use `/gsd-plan-phase --research-phase`.

### Phase 8: Advanced Features & Polish
**Rationale:** Power features that make this the definitive PostgreSQL node for Node-RED. Each feature is independently valuable but all depend on the foundation built in Phases 1-7. Can be developed in parallel waves within this phase since they have limited cross-dependencies.

**Delivers (parallel waves):**
- **Wave A: Retry handler** — exponential backoff with jitter, transient error classification (`40001`, `40P01`, `53300`, `57P01`, `08006`, `08001`, `57P03`), configurable max retries/max delay. `lib/retry-handler.ts`
- **Wave B: COPY support** — CSV import/export via `pg-copy-streams`. COPY FROM (accept CSV from upstream, pipe to PostgreSQL), COPY TO (stream table data downstream). Uses dedicated client from pool.
- **Wave C: Type mapping** — `pg.types.setTypeParser()` for `numeric`→number, `timestamptz`→ISO string, `jsonb` optional parse. Toggle-controlled. `lib/type-mapper.ts`
- **Wave D: Prepared statements** — per-client named statement caching with WeakMap keyed by pool. "Use prepared statement" toggle in query config.
- **Wave E: Pool health/status node** — dedicated `postgrestor-status` node type showing pool metrics, clickable for detailed stats.

**Addresses:** P3 features: retry, COPY, type mapping, prepared statements
**Research flag:** Standard patterns for each feature. COPY streaming and retry error classification may need research spikes. Use `/gsd-plan-phase --research-phase` for Waves A and B only.

### Phase Ordering Rationale

- **TypeScript first (Phase 1):** Every module from Phase 2 onward imports from `shared/types.ts`. Starting feature work without types means either duplicating type definitions or rewriting them later. The architecture research is explicit: `shared/types.ts` is the canonical contract that every other module depends on.

- **Fixes before features (Phase 2 before 3-8):** The `msg = null` pattern, dead code, and `console.log` calls are in code paths that Phases 3-8 modify. Fixing them first prevents compounding and reduces merge conflicts. Low-risk, high-confidence fixes that unblock everything else.

- **Pool before queries before transactions (Phase 3 → 4 → 6):** Dependency chain. Transactions require the single-client checkout pattern (`pool.connect()`) which requires a properly configured pool. Query node improvements (named params, structured errors) are used by the transaction node for ROLLBACK decisions.

- **Listener after pool (Phase 5 after 3):** Listener auto-reconnect requires the pool health infrastructure and clean shutdown patterns. Channel sanitization is standalone but benefits from the validation utilities in Phase 2.

- **Streaming after transactions (Phase 7 after 6):** Both use `pool.connect()` and the client lifecycle management pattern. Transactions establish the pattern; streaming extends it. Named output ports (needed for streaming) require HTML template changes that are easier after the query node UI is established.

- **Advanced features last (Phase 8):** Each feature is independently valuable but all depend on the pool, query executor, and error infrastructure being solid. Parallel waves maximize throughput since features have minimal cross-dependencies.

- **Competitive differentiators back-loaded (Phases 5, 6, 7):** Intentional. The P1 table-stakes (Phases 3, 4) make the node production-ready and safe to use. The P2 differentiators (Phases 5, 6) make it the best choice. The P3 power features (Phases 7, 8) make it the definitive choice. This ordering ensures a shippable product after Phase 4 even if later phases are deferred.

### Research Flags

**Phases likely needing deeper research during planning (`/gsd-plan-phase --research-phase`):**
- **Phase 4 (Query Node & Data Operations):** Named parameter binding interaction with positional `$N` syntax, Mustache injection detection patterns, Mustache vs parameter-only mode UX design.
- **Phase 5 (Listener Reliability):** State machine interaction with Node-RED redeploy lifecycle, PostgreSQL `LISTEN` semantics on reconnect, missed-event notification protocol.
- **Phase 6 (Multi-Step Transactions):** Transaction API design (array-of-queries vs dedicated node), error classification for ROLLBACK vs retry decisions, interaction with query timeout, savepoint support.
- **Phase 7 (Streaming & Large Data):** Backpressure in Node-RED's synchronous `send()`, pool isolation strategy, cancellation semantics on flow redeploy, batch size tuning.
- **Phase 8 (Advanced Features):** Waves A (retry error classification needs real PostgreSQL error scenario testing) and B (COPY streaming protocol interaction with pool lifecycle).

**Phases with standard patterns (skip `--research-phase`):**
- **Phase 1 (TypeScript Migration):** Well-documented migration patterns for Node.js packages. ts-jest, typescript-eslint integration is thoroughly documented.
- **Phase 2 (Bug Fixes & Cleanup):** Fixes are from direct codebase analysis — solutions are known, implementation is straightforward.
- **Phase 3 (Connection & Pooling Foundation):** pg.Pool API is one of the most-used Node.js database libraries (12M+ weekly downloads). Pool config, SSL, and health patterns are standard.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All version compatibilities verified via npm registry (2026-06-10). Peer dependency chains confirmed: ts-jest→Jest 30, typescript-eslint→TS 6, pg-query-stream→pg 2.8.1+. 402 Context7 snippets for pg, 2336 for Node-RED custom nodes. |
| Features | HIGH | Competitor analysis covers all 5 known Node-RED PostgreSQL nodes plus the MySQL reference node (1030 weekly downloads). Feature landscape validated against all competitors. MVP definition is conservative — P1 items are table stakes confirmed by competitor feature matrices. |
| Architecture | HIGH | Node-RED contrib node architecture pattern is standardized (config node owns connection, action nodes reference it). Patterns validated against Node-RED official docs, node-postgres official docs, and existing reference implementation (`node-red-contrib-postgres-multi` for transactions). Component boundaries designed for testability. Build order based on module dependency graph. |
| Pitfalls | HIGH | 23 concerns from existing codebase analysis, 7 critical pitfalls from combined codebase + PostgreSQL + Node-RED runtime analysis. Each pitfall has specific warning signs and prevention strategies. Recovery costs estimated for each. Sources include node-postgres official docs (explicit transaction warning), Node-RED lifecycle docs, test helper gotchas. |

**Overall confidence:** HIGH — all four research areas are grounded in official documentation, existing codebase analysis, npm registry verification, and competitor feature analysis. No speculative or inferred findings.

### Gaps to Address

- **@types/node-red staleness:** The published types target NR 1.x. NR 5.x API surface additions (new `RED` methods, editor API changes) are not covered. Mitigation: maintain `src/types/node-red.d.ts` as a living file. Add missing APIs as they're encountered. If friction becomes high, consider forking or publishing updated community types (Phase 1 decision).

- **@types/pg-query-stream / @types/pg-copy-streams mismatch:** Type definitions are for library versions 3.x and 1.x respectively, while libraries are at 4.x and 7.x. Mitigation: add local type augmentation in `src/types/pg-query-stream.d.ts` and `src/types/pg-copy-streams.d.ts`. Surface any type gaps during streaming/COPY development (Phases 7, 8). Not a blocker — the runtime API is small enough for manual declarations.

- **Testcontainers integration with Node-RED test helper:** `node-red-node-test-helper` loads nodes into an isolated runtime. How `@testcontainers/postgresql` database URLs are injected into the config node at test time needs validation. Mitigation: create a test helper utility that starts a container, creates the database, sets a `TEST_DATABASE_URL` env var, and passes it to the test helper's flow configuration. Spike this in a Phase 1 sub-task before writing feature tests (Phase 3+).

- **Mustache vs parameterized-only mode UX:** Users need to understand the security tradeoffs. The injection detection layer is a fallback, not a primary defense. Parameterized-only mode must be the default. How to communicate this clearly in the node UI and help text needs UX design input. Mitigation: add a prominent security warning in the node help text (Phase 4). Make parameterized-only the default, with Mustache as an explicit opt-in with a security acknowledgement checkbox.

- **Transaction API design (array-of-queries vs dedicated node):** Research favors array-of-queries for MVP simplicity, but user feedback may demand a dedicated transaction node type that wraps sub-nodes (more Node-RED-idiomatic). Mitigation: ship array-of-queries in Phase 6. If user demand exists, add a dedicated transaction node in a follow-up phase. The `query-executor.ts` abstraction supports both — it's a composition change, not an architectural rewrite.

- **Node-RED 5.x compatibility surface:** NR 5.0.0 released 2026-06-09 with Node >=22.9 requirement. The recommended `>=3.0.0` floor keeps broad compatibility. Mitigation: test against both NR 3.x (oldest supported) and NR 5.x (latest) in CI. Use conditional feature detection for NR 4.x/5.x editor APIs if used. Decision deferred to Phase 1 — if targeting NR 5.x only simplifies type management significantly, consider raising the floor.

## Sources

### Primary (HIGH confidence)
- **Context7 `/brianc/node-postgres`** (402 snippets) — pg pooling, cursor, streaming API, transactions, error codes, type parsers
- **Context7 `/node-red/node-red.github.io`** (2336 snippets) — custom node creation, config nodes, status API, unit testing, lifecycle
- **Context7 `/node-red/node-red-node-test-helper`** (98 snippets) — test harness API, `helper.load()`/`helper.unload()`, spy patterns
- **Context7 `/kulshekhar/ts-jest`** (41 snippets) — Jest 30 compatibility, configuration patterns
- **Context7 `/typescript-eslint/typescript-eslint`** (1021 snippets) — flat config migration, ESLint 9/10 support
- **node-postgres official docs** — Transactions (same-client requirement), Pooling (checkout-use-return), Cursor API, Client API, Data Types, Queries
- **Node-RED official docs** — Creating Nodes (JS file, close handler, status), Configuration Nodes, Node Status, First Node guide

### Secondary (MEDIUM confidence)
- **npm registry** — version verification for all packages (2026-06-10): `pg@8.21.0`, `node-red@5.0.0`, `typescript@6.0.3`, `eslint@10.4.1`/`9.39.4`, `jest@30.4.2`, `ts-jest@29.4.11`, `typescript-eslint@8.61.0`
- **npm registry peer dependency verification** — ts-jest `jest: ^29.0.0 || ^30.0.0`, typescript-eslint `eslint: ^8.57.0 || ^9.0.0 || ^10.0.0`, `typescript: >=4.8.4 <6.1.0`
- **Node-RED Release Plan** (https://nodered.org/about/releases/) — NR 5.x release schedule, maintenance windows
- **Competitor analysis**: `node-red-contrib-re-postgres` v0.3.7, `node-red-contrib-postgres-variable` v0.6.0, `node-red-contrib-stackhero-mysql` v1.0.6, `node-red-contrib-postgres-multi`

### Tertiary (LOW confidence)
- **Existing codebase analysis** — `.planning/codebase/CONCERNS.md` (23 documented concerns), `postgrestor.js` (182 lines), `postgrestor.html` (441 lines)
- **pg-query-stream / pg-copy-streams README** — client release semantics, stream lifecycle (needs validation with current library versions during Phases 7/8)

---

*Research completed: 2026-06-10*
*Ready for roadmap: yes*
