# Pitfalls Research

**Domain:** Node-RED PostgreSQL contrib node with transactions, streaming, TypeScript, and testing
**Researched:** 2026-06-10
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Pool-Wide Query for Transactions Instead of Single Client

**What goes wrong:**
Using `pool.query()` for multi-statement transactions silently breaks PostgreSQL's transaction isolation. PostgreSQL binds a transaction to a single client connection — `pool.query()` may return a different pooled client for each call. If a `BEGIN` is issued on one client and the subsequent `COMMIT`/`ROLLBACK` lands on a different client, the database is left in an inconsistent state. Worse, the first client returns to the pool with an open transaction, corrupting future queries on that connection.

**Why it happens:**
Developers coming from ORM-based patterns or who default to `pool.query()` convenience method assume the pool transparently handles transaction boundaries. The `pg` library is intentionally low-level — it does not wrap transaction semantics. The official docs explicitly warn: "You must use the same client instance for all statements within a transaction." Yet the existing codebase uses `pool.connect()` → `client.query()` for single queries, creating a pattern that looks correct but cannot be extended to transactions without restructuring.

**How to avoid:**
Create a dedicated transaction node type (`PostgresTransactionNode`) that calls `pool.connect()` once, holds the client reference, and executes an array of query objects on that single client. Always wrap in `try { BEGIN ... COMMIT } catch { ROLLBACK } finally { client.release() }`. Never expose `pool.query()` as a transaction API. If the node receives sequential `msg` messages (e.g., one per query step), the transaction state must be held in flow context and the same client reused across messages.

**Warning signs:**
- A transaction node that calls `pool.query()` or `node.config.pgPool.query()` instead of `pool.connect()`
- `BEGIN`, `COMMIT`, or `ROLLBACK` appearing in Mustache templates rather than hardcoded in the node logic
- No `finally { client.release() }` block — if a ROLLBACK or COMMIT throws, the client leaks
- Using `client.query('COMMIT')` without checking `getTransactionStatus()` first (client may already be in error state `'E'`)

**Phase to address:**
Transaction feature phase. Must be designed *before* any query node refactoring touches connection management.

---

### Pitfall 2: Streaming/Cursor Connection Leak — Client Never Released

**What goes wrong:**
`pg-cursor` / `pg-query-stream` requires a dedicated client connection. The stream emits rows asynchronously; the client can only be released when the stream fires its `'end'` or `'error'` event. If the Node-RED flow is redeployed, the `close` handler fires, the cursor/stream is abandoned, but the client stays checked out. This is structurally identical to the existing listener connection leak (CONCERNS.md §Listener Connection Never Released) — but for streaming the consequences are worse because each large query ties up a pooled connection for the duration of the result set transmission, potentially saturating the pool and deadlocking all other queries.

**Why it happens:**
Node-RED's redeploy lifecycle (`node.on('close', ...)`) fires asynchronously. If the close handler doesn't explicitly cancel the cursor/stream and release the client, the connection remains allocated. The `pg` library has no automatic stream cancellation on client release — `client.release()` while a stream is active is undefined behavior (the stream may continue to emit or may silently fail).

**How to avoid:**
1. Track all active streams/cursors in an instance-level array.
2. In the `close` handler, iterate the array and call `cursor.close()` or `stream.destroy()` with an explicit callback that releases the client.
3. Always connect a `stream.on('error')` handler — network drops during streaming leave the client in an indeterminate state.
4. Set a per-query `statement_timeout` (`SET LOCAL statement_timeout = ...`) before the cursor query to prevent indefinitely hung queries.
5. Consider a separate pool with `max: 1` for streaming connections so a hung stream doesn't exhaust the main query pool.

**Warning signs:**
- `pool.connect()` for streaming but `client.release()` only on `'end'` with no `'error'` or `'close'` handler
- No `node.on('close', ...)` handler that cancels active streams
- Cursor/stream stored in a local variable (not on `this`) — invisible to close handler
- Streaming node uses the same pool as regular queries with no isolation

**Phase to address:**
Streaming/cursor phase. Also impacts the connection management refactoring phase — isolated pool design must be decided early.

---

### Pitfall 3: TypeScript Migration Breaking the RED Global Object Typing

**What goes wrong:**
Node-RED contrib nodes receive a global `RED` object injected by the runtime via `module.exports = function(RED) { ... }`. This object is not typed — there is no `@types/node-red` for the full contrib node API. Developers migrating to TypeScript typically create a `globals.d.ts` with `declare const RED: any` or skip typing entirely for the `RED` parameter, losing type safety in the most critical integration surface. Worse, if they type `RED` too narrowly (e.g., only `RED.nodes.createNode`), future API calls like `RED.tabs.create`, `RED.editor.createEditor`, or `RED.settings` will fail at compile time.

**Why it happens:**
The Node-RED runtime does not ship official TypeScript declarations for the contrib node API. The `@types/node-red` package exists for the runtime internals but covers different APIs than the contrib node surface. TypeScript migration guides for generic Node.js packages don't account for this injected-dependency pattern.

**How to avoid:**
1. Create a dedicated `src/types/node-red.d.ts` module that declares the exact RED API surface used (createNode, registerType, nodes.getNode, log/warn/error, status, tabs, editor).
2. Keep the top-level export as `module.exports = function(RED: NodeRedRuntime) { ... }` — do NOT use ESM `export default` (Node-RED loads via `require()`).
3. The HTML template (`postgrestor.html`) must remain separate — TypeScript cannot type-check the embedded editor-side `<script>` blocks.
4. Compile to a single `postgrestor.js` output (Node-RED's `node-red.nodes` section in `package.json` expects one file per node set).
5. Use `tsc --declaration` to generate `.d.ts` files for internal reuse, but exclude them from the `node-red.nodes` mapping.

**Warning signs:**
- `RED` parameter typed as `any` — defeats the purpose of TypeScript
- `import` / `export default` in the compiled JS output — breaks Node-RED's `require()`-based loading
- Separate `.js` and `.d.ts` files mapped in `node-red.nodes` — can cause duplicate node registration
- HTML file referencing TypeScript — Node-RED editor interprets JS directly, not TS

**Phase to address:**
TypeScript migration phase (Core Modernization). Should be the very first phase since all subsequent feature work depends on the TS type foundation.

---

### Pitfall 4: Testing Against a Real Database Without Proper Fixture Isolation

**What goes wrong:**
Jest tests that connect to a real PostgreSQL instance without proper setup/teardown isolation produce non-deterministic results. Tests pass locally with a specific data state but fail in CI (when CI arrives). Transaction-rollback-based isolation (wrapping each test in `BEGIN`/`ROLLBACK`) doesn't work with Node-RED's test helper because the helper manages its own flow lifecycle and the pg pool clients are opaque to the test runner. Shared mutable state between tests — particularly with `LISTEN/NOTIFY` — produces the worst kind of flaky tests: those that pass 90% of the time.

**Why it happens:**
`node-red-node-test-helper` loads the actual node code into a real Node-RED runtime. There's no built-in mechanism to inject mock pools or intercept `pg.Pool` constructor calls. The `helper.load()` callback fires after node construction, by which point the `new Pool(...)` has already executed. Mocking `pg` at the module level requires Jest's `jest.mock('pg')` which can interfere with the test helper's internal module resolution.

**How to avoid:**
1. Use Docker-based PostgreSQL (e.g., `@testcontainers/postgresql`) for integration tests — each test suite gets a fresh, isolated database with schema migrations applied.
2. For unit tests that don't need a real database, restructure node code to accept a `poolFactory` dependency parameter (defaulting to `pg.Pool`) so tests can inject a mock.
3. Test the listener node with a dedicated helper that sends real `NOTIFY` via a separate client and awaits the output helper node.
4. Never share a database/schema across test suites. Use `createDatabase()` and `dropDatabase()` at the suite level.
5. Add a `jest.setup.ts` that sets `JEST_WORKER_ID` so each parallel worker targets a different DB port/name.
6. The test helper's `afterEach(() => { helper.unload() })` is essential — missing it leaves Node-RED flows and pool clients alive between tests.

**Warning signs:**
- Tests that pass individually but fail when run as a suite
- `jest.mock('pg')` combined with `helper.load()` — module mocking and Node-RED runtime clash
- No `afterEach`/`afterAll` calling `helper.unload()` and `pool.end()`
- Hardcoded database name/port in tests

**Phase to address:**
Testing infrastructure phase (paired with Core Modernization). Must be established before any feature testing.

---

### Pitfall 5: Listener Node Reconnection Without State Machine

**What goes wrong:**
Adding auto-reconnect to the `PostgresListenerNode` without a proper state machine produces reconnection storms. If the database is briefly unavailable (network blip, restart), every listener node instance simultaneously enters exponential backoff. If the initial backoff is too short and all listeners share the same retry schedule, they hammer the database in lockstep, potentially triggering connection flood rejection. Worse, during the reconnect window, `NOTIFY` events generated by the database are lost because PostgreSQL's `LISTEN/NOTIFY` has no delivery guarantee for disconnected clients.

**Why it happens:**
Exponential backoff is correct in isolation, but multiple instances of the same node type don't coordinate. Node-RED doesn't provide a shared state bus for nodes. The instinct to "just add `setTimeout` with increasing delay" ignores that PostgreSQL `LISTEN` must be re-established from scratch on a new connection, and any events fired between `client.on('error')` and the next successful `LISTEN` are lost forever.

**How to avoid:**
1. Implement a finite state machine: `CONNECTING → LISTENING → DISCONNECTED → RECONNECTING → LISTENING`.
2. Add jitter to the backoff (`delay * (0.5 + Math.random() * 0.5)`) so instances don't retry in lockstep.
3. On reconnect, emit a special `msg` with `{ event: 'reconnected', channel, missedEventsPossible: true }` so the downstream flow knows data may be missing.
4. Expose the connection state via `node.status()` (green dot for connected, yellow ring for reconnecting, red ring for failed after max retries).
5. Set `client.on('error', ...)` on the listener client — the `pg` pool only emits errors on *idle* clients. A listener client is never idle, so it must handle its own error events.
6. Channel name sanitization belongs in the *editor* validation (`oneditprepare`) and *runtime* validation (check against PostgreSQL identifier rules) before `LISTEN` is called.

**Warning signs:**
- Reconnect logic that doesn't include the `LISTEN` command in the retry path
- No `maxRetries` cap — infinite retry loops consume resources indefinitely
- `NOTIFY` payloads not re-requestable (PostgreSQL `NOTIFY` is fire-and-forget)
- Node status remains green during reconnect attempts

**Phase to address:**
Listener reliability phase. Also touches the connection management phase for the dedicated listener pool design.

---

### Pitfall 6: `msg = null` Pattern Breaking Node-RED Message Chains

**What goes wrong:**
When `throwErrors` is `true`, the existing `PostgresNode` sets `msg = null` and then calls `node.send(msg)`. The downstream node receives `null` — not `undefined`, not `{ error: ... }`, but literal `null`. If the downstream node accesses `msg.payload`, it throws `TypeError: Cannot read properties of null`. This error is swallowed by Node-RED's internal error handling (it appears in the debug sidebar but doesn't crash the flow), so operators may never know their flow silently dropped a message.

**Why it happens:**
The `pg` library and Node-RED both have error-handling patterns that don't compose well. `node.error(msg, err)` in Node-RED triggers Catch nodes, but the existing code calls `node.error(errorMessage, msg)` and *then* sets `msg = null`. This creates a "message was handled but also null" paradox. The `finally` block unconditionally sends `msg` — there's no check for whether the message was already routed via the error path.

**How to avoid:**
1. Never set `msg = null`. Instead, set `msg.error = { message, code, detail, constraint, table }` and let the downstream node decide how to handle errors.
2. Use Node-RED's two-output pattern: output 1 for success (`msg.payload = result`), output 2 for errors (`msg.error = structuredError`). This lets users wire Catch nodes or error-handling nodes explicitly.
3. Always preserve the original `msg` object (spread into a new object if mutation is a concern) — downstream nodes may rely on accumulated properties.
4. Structured errors: the `pg` library returns `err.code` (`'23505'` for unique violation, `'40P01'` for deadlock, etc.), `err.detail`, `err.constraint`, `err.table`. Expose all of these on `msg.error`.

**Warning signs:**
- `msg = null; node.send(msg)` — the canonical anti-pattern
- `finally` block that unconditionally sends without checking error state
- `node.error()` and `node.send()` called on the same `msg` in the same handler
- Error message string without PostgreSQL error code, detail, or constraint metadata

**Phase to address:**
Error handling refactoring phase (part of Bug Fixes & Cleanup). Must be addressed before adding structured error output.

---

### Pitfall 7: Credentials TypedInput Half-Implementation Causing Silent Falls

**What goes wrong:**
The config node's HTML defines `userFieldType` and `passwordFieldType` in the commented-out defaults (lines 182–195), and the JS reads `n.userFieldType` in the pool constructor (lines 47–49, 58–59). But the typedInput for user/password is commented out (lines 246–265), and the format is `input type="text"` in the main template (lines 62, 71), not a typedInput widget. Result: `n.userFieldType` is `undefined`, which hits `getField`'s `default` case, returning the raw credentials value. This happens to work, but adding SSL object config or `DATABASE_URL` support on top of this will break the same way — half-implemented field types that silently degrade to raw values.

**Why it happens:**
Node-RED node development involves three files (`.js`, `.html`, `locales/...json`) that must stay in sync. Partial migration between patterns (typedInput vs plain input, commented-out code, dead defaults) is the natural result of iterative development without tests. Each layer that reads a field must agree on the expected type.

**How to avoid:**
1. Decide on a single pattern for credentials: either full typedInput (env/flow/global support for user/password) or plain text (credentials stored in Node-RED's encrypted credential store only).
2. If plain text: delete all `userFieldType`/`passwordFieldType` references from both JS and HTML defaults. Remove the `getField` calls for credentials.
3. If typedInput: implement the full typedInput widget, add `userFieldType`/`passwordFieldType` to defaults (uncommented), and add `'env'` and `'flow'` types (useful for `DATABASE_URL`-style config).
4. Add input validation in `oneditprepare` — if a field has `fieldType: 'num'`, validate the input is a number before saving.

**Warning signs:**
- Commented-out typedInput blocks in HTML alongside active plain text inputs
- `fieldType` variables read in JS but not set in HTML defaults
- No input validation in `oneditprepare` — invalid values pass silently to `getField`
- `console.log` of config values in constructor (debug leftovers)

**Phase to address:**
Bug Fixes & Cleanup phase. Also part of the SSL/DATABASE_URL config enhancement phase.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `parseInt(value)` without `isNaN` check in `getField` | One-liner numeric coercion | `NaN` values propagate to `pg.Pool` constructor — connection failures with cryptic errors | Never. Must guard with `isNaN()` + fallback default |
| `JSON.parse(value)` without try-catch for boolean fields | One-liner boolean coercion | Unhandled exception if flow/global contains non-JSON value | Never. Must try-catch or use string comparison |
| `console.log` instead of `node.log()` | Cuts a dependency on Node-RED's log API | Query text (potentially containing PII) in stdout/stderr, visible in container logs | Only for local development; must be replaced before PR |
| Single `pg.Pool` for all node types (query + listener + streaming) | Less code, simpler config | Listener permanently consumes one connection; streaming can saturate remaining pool | Only for very low-throughput flows (1-2 listener nodes, infrequent queries) |
| Mustache template engine for SQL construction | Flexibility, dynamic table/column names | SQL injection by default — users can embed raw `msg` properties in query text | Never for production. Parameterized-only mode must be available as toggle |
| No `pool.end()` in config node `close` handler | Zero lines of cleanup code | Open connections on Node-RED shutdown → PostgreSQL server-side connection leaks | Never for production |
| `pool.query()` for single queries (current pattern) | Simpler than manual client checkout/release | Cannot extend to transactions or streaming without full restructure | Acceptable for query-only node; must add dedicated transaction/streaming nodes |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `pg.Pool` with `node.on('close')` | Forgetting to call `pool.end()` in the config node's close handler, or calling it without awaiting | `node.on('close', async (done) => { await this.pgPool.end(); done(); })` with the async callback pattern |
| `pg-cursor` / `pg-query-stream` | Releasing the client before the stream emits `'end'` — data loss and pool corruption | Only release in `stream.on('end', () => client.release())` and `stream.on('error', (err) => { stream.destroy(); client.release(); })` |
| `node-red-node-test-helper` | Asserting inside event handlers without try-catch → swallowed exceptions → test timeouts | Wrap every assertion in try-catch, pass error to `done(err)` |
| `LISTEN/NOTIFY` channel names | No validation or sanitization → SQL injection via channel name string interpolation | Validate against `/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/` (PostgreSQL identifier rules); use parameterized `LISTEN` when pg supports it |
| `pg` SSL configuration | Passing `ssl: true` (boolean) when PostgreSQL requires `ssl: { rejectUnauthorized: false }` or custom CA certs | Support `ssl` as boolean, string (CA path), or object (`{ rejectUnauthorized, ca, cert, key }`) |
| Multiple Node-RED nodes sharing one config node | Assuming config node constructor runs before query nodes access `pgPool` — race condition on deploy | Config node is created synchronously; `pgPool` is available immediately. But query nodes should guard `node.config?.pgPool` for robustness |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Listener connections consuming pool capacity | `pool.query()` hangs (timeout waiting for available client) after adding listener nodes | Separate pool for listeners (dedicated `max` based on expected channel count) or pool exhaustion warning via `pool.totalCount` / `pool.waitingCount` | When `listenerCount > pool.max - activeQueryCount` |
| No `statement_timeout` on queries | A single slow query blocks a pool slot; Node-RED UI shows green but no messages flow | Set `statement_timeout` via `SET LOCAL statement_timeout = '${config.queryTimeout || '30s'}'` before each query | First long-running query on a small pool |
| Unbounded row accumulation in streaming | Memory grows linearly with result set size; OOM if user forgets to set `LIMIT` on streaming query | Emit rows in configurable batch sizes (e.g., 1000 rows per `msg`); add `maxRows` safety cap | Result sets > 100K rows |
| Prepared statements on short-lived clients | Prepared statement re-parsed on every new pool client → no performance benefit, slightly worse due to parse overhead | Only use `{ name: '...' }` pattern for queries that execute many times on the same client (e.g., inside a transaction or dedicated pooled connection) | When query frequency > 10/sec per client |
| Repeated `pool.connect()` / `client.release()` in tight loops | Connection checkout overhead (20-30ms per handshake) dominates query time for sub-millisecond queries | Use `pool.query()` for single queries; reserve `pool.connect()` for transactions and streaming | When query latency < connection checkout latency |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Mustache template without SQL injection guard | Users write `SELECT * FROM users WHERE name = '{{ msg.name }}'` → `msg.name = "' OR '1'='1"` → full table exposure | Add config toggle `disableTemplating`; validate rendered query for unquoted template expansions; prominently warn in node help text |
| Full query text in `node.status()` or `this.error()` | Error messages include the query string → sensitive data visible in Node-RED editor UI and debug sidebar | Truncate status text to generic message; log full error via `node.debug()` (suppressed in production); never include query parameters in status |
| Channel name in `LISTEN` via string interpolation | `client.query(`LISTEN ${config.channel}`)` with unsanitized channel → SQL injection | Validate channel name against PostgreSQL identifier regex before use; quote with `pg-format`'s `%I` if dynamic |
| `ssl: false` as only option | Forces users to disable SSL for self-signed/internal CA PostgreSQL instances → traffic in cleartext | Support full SSL config object: `{ rejectUnauthorized, ca, cert, key }`; expose in typedInput |
| `msg.params` position mismatch | Array length doesn't match `$N` count in query → PostgreSQL `bind message supplies N parameters, but prepared statement requires M` error | Validate `msg.params.length` against placeholder count in rendered query before execution; log warning on mismatch |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Dead `output` checkbox that does nothing | User toggles it expecting to suppress output → messages still sent → confusion | Either wire it (respect toggle in `node.send`) or remove it entirely |
| `throwErrors: true` sends `msg = null` | Downstream nodes crash on `msg.payload` access → flow silently breaks | Split into two outputs: success (1) and error (2); never send null |
| Locale placeholder min/max swapped | UI shows max:1, min:10 → users misconfigure pool → connection storms or exhaustion | Swap placeholder values immediately (1-line fix) |
| No connection health status | Config node always shows "active" → operators don't know pool is exhausted until queries fail | Show pool metrics in node status: `active/idle/waiting/total` |
| SQL editor without query validation | Users type invalid SQL → runtime error on deploy with cryptic PostgreSQL message | Add `EXPLAIN` or basic syntax check on save (Node-RED editor side) |
| No timeout feedback | Long-running query → node appears hung with no indication → user force-restarts flow | Show "running (15s)" in status; emit timeout error on downstream |

## "Looks Done But Isn't" Checklist

- [ ] **Transactions:** Often missing rollback on COMMIT failure — verify `try { ROLLBACK }` runs after a failed COMMIT too
- [ ] **Streaming:** Often missing `stream.on('error')` handler — verify error path releases client and cleans up
- [ ] **Listener reconnect:** Often missing `UNLISTEN` on old connection before reconnecting — verify old channel subscriptions are cleaned up
- [ ] **TypeScript:** Often missing `RED` type declarations for node-specific APIs (tabs, editor) — verify all used APIs are typed
- [ ] **Tests:** Often missing `helper.unload()` in `afterEach` — verify teardown runs even on test failure
- [ ] **Pool close:** Often missing async `pool.end()` in config node close handler — verify close handler awaits pool drain
- [ ] **SSL config:** Often only boolean toggle — verify SSL object (custom CA) works for RDS/Azure/Supabase
- [ ] **Error structure:** Often sends plain string error — verify `msg.error` includes `code`, `detail`, `constraint`, `table`
- [ ] **Channel sanitization:** Often only regex validation — verify channel name is validated both in editor (`oneditprepare`) and runtime
- [ ] **Statement timeout:** Often hardcoded or absent — verify per-node configurable timeout with clean cancellation

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Pool-wide transaction queries | HIGH — requires architectural change from `pool.query()` to single-client pattern | Refactor transaction node to use `pool.connect()`; add try-catch-rollback pattern; update all tests |
| Streaming client leak | MEDIUM — spot fix in close handler | Add `node.on('close')` handler that tracks and cancels active streams; add pool-isolation for streaming |
| TypeScript RED typing gaps | MEDIUM — iterative typing refinement | Maintain `src/types/node-red.d.ts` as a living declaration; add missing APIs as they're used |
| No test fixture isolation | MEDIUM — requires Docker or testcontainers | Add `@testcontainers/postgresql`; create test setup/teardown helpers; migrate existing tests |
| Listener reconnection storms | HIGH — touches connection lifecycle, state machine, pool isolation, and NOTIFY semantics | Implement state machine with jitter; separate listener pool; add missed-event notification message |
| `msg = null` pattern | LOW — localized fix in error path | Refactor `finally` block to conditionally send; add structured error; add two-output pattern |
| Credentials half-implementation | LOW — delete dead code or complete implementation | Choose one pattern (plain text or typedInput); delete unused code path from both JS and HTML |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Pool-wide transaction queries | Transaction feature phase | Integration test: `BEGIN → INSERT → COMMIT` on single client; verify `getTransactionStatus()` returns `'I'` after |
| Streaming client leak | Streaming/cursor phase | Test: simulate Node-RED redeploy mid-stream; verify `pool.totalCount` returns to baseline after close |
| TypeScript RED typing gaps | TypeScript migration (Core Modernization) | TypeScript compilation with `strict: true` — no `any` casts on `RED` parameter |
| No test fixture isolation | Testing infrastructure phase | All tests pass with `--runInBand` and `--runInBand=false` (parallel execution) |
| Listener reconnection storms | Listener reliability phase | Chaos test: kill PostgreSQL, restore; verify all listeners reconnect with staggered timing; no duplicate `LISTEN` |
| `msg = null` pattern | Bug Fixes & Cleanup phase | Test: downstream node after error; verify `msg.error.code` is populated, `msg.payload` preserved |
| Credentials half-implementation | Bug Fixes & Cleanup phase | Manual: open node config dialog; verify SSL field supports typedInput types; verify credentials read correctly |
| Mustache SQL injection | Security hardening phase (or Query & Data phase) | Security test: inject `' OR '1'='1` via `msg` property; verify parameterized mode rejects or escapes |
| Pool never drained on close | Connection & Pooling phase | Test: deploy → redeploy; verify `pool.totalCount === 0` after close handler completes |
| Dead `output` checkbox | Bug Fixes & Cleanup phase | Manual: toggle output checkbox; verify messages are/aren't sent accordingly; or verify checkbox removed |

## Sources

- **node-postgres official docs (transactions):** https://node-postgres.com/features/transactions — Explicit warning: "You must use the same client instance for all statements within a transaction"
- **node-postgres official docs (pooling):** https://node-postgres.com/features/pooling — "You must always return the client to the pool if you successfully check it out"
- **node-postgres FAQ:** https://github.com/brianc/node-postgres/wiki/FAQ — "Open transactions are not automatically handled when a connection is returned to the pool"
- **node-postgres pg-query-stream README:** https://github.com/brianc/node-postgres/blob/master/packages/pg-query-stream/README.md — Client release must happen on `stream.on('end', ...)`
- **node-postgres pg-cursor API:** https://node-postgres.com/apis/cursor — Cursor requires dedicated client; `cursor.read(N)` pattern
- **Node-RED Creating Nodes (JavaScript file):** https://nodered.org/docs/creating-nodes/node-js — Close handler pattern, timeout behavior (15s), `removed` parameter
- **Node-RED Creating Nodes (config nodes):** https://nodered.org/docs/creating-nodes/config-nodes — Config node lifecycle, shared connection pattern, close handler required
- **Node-RED Node Status:** https://nodered.org/docs/creating-nodes/status — Status API surface (fill, shape, text)
- **node-red-node-test-helper README:** https://github.com/node-red/node-red-node-test-helper — `helper.load()`, `helper.unload()`, spy patterns, gotcha: exceptions in event handlers must be caught and passed to `done()`
- **Node-RED First Node:** https://nodered.org/docs/creating-nodes/first-node — Unit testing section with `node-red-node-test-helper` example; wrap assertions in try-catch
- **Existing codebase analysis:** `.planning/codebase/CONCERNS.md` — 23 documented concerns including connection leaks, NaN propagation, SQL injection vector, dead config properties
- **Source file analysis:** `postgrestor.js` (182 lines), `postgrestor.html` (441 lines) — direct inspection of all existing pitfalls

---

*Pitfalls research for: node-red-contrib-postgrestor (Node-RED PostgreSQL contrib node)*
*Researched: 2026-06-10*
