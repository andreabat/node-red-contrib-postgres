# Architecture Research

**Domain:** Node-RED PostgreSQL contrib node (database integration)
**Researched:** 2026-06-10
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            NODE-RED RUNTIME                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌───────────────────┐   │
│  │  PostgresDBNode  │    │   PostgresNode   │    │PostgresListenerNode│  │
│  │  (Config Node)   │◄───│   (Query Node)   │    │   (Listen Node)   │   │
│  │                  │    │                  │    │                   │   │
│  │  pg.Pool ────────┼────┤  Mustache render │    │ client.on('notif')│   │
│  │  health checks   │    │  query execution  │    │ LISTEN channel    │   │
│  │  pool metrics    │    │  send(msg)        │    │ send(msg)         │   │
│  │  close handler   │    │  close handler    │    │ close handler     │   │
│  └────────┬─────────┘    └────────┬─────────┘    └────────┬──────────┘   │
│           │                       │                        │             │
├───────────┴───────────────────────┴────────────────────────┴─────────────┤
│                          PostgreSQL Server                                │
│  ┌──────────────┐   ┌───────────────┐   ┌────────────────────────────┐   │
│  │  Connection  │   │  Query        │   │  LISTEN/NOTIFY             │   │
│  │  Pool        │   │  Engine       │   │  Subsystem                 │   │
│  └──────────────┘   └───────────────┘   └────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

### Component Boundaries (TypeScript Migration)

```
src/
├── index.ts                   # Module entry, registers all 3 node types with RED
├── nodes/
│   ├── postgres-config.ts     # PostgresDBNode: pool lifecycle, health, metrics
│   ├── postgres-query.ts      # PostgresNode: query/transaction/stream execution
│   └── postgres-listener.ts   # PostgresListenerNode: LISTEN/NOTIFY with auto-reconnect
├── lib/
│   ├── pool-manager.ts        # Pool creation, config, close/drain, health checks
│   ├── query-executor.ts      # Single query, transaction block, stream cursor
│   ├── type-mapper.ts         # Custom pg type parsers (numeric, jsonb, timestamptz)
│   ├── retry-handler.ts       # Exponential backoff, transient error classification
│   ├── template-renderer.ts   # Mustache rendering with SQL injection guardrails
│   ├── channel-sanitizer.ts   # PostgreSQL identifier validation for LISTEN
│   └── logger.ts              # Structured logging: node.log(), node.warn(), node.error()
├── shared/
│   ├── types.ts               # All TypeScript interfaces and type definitions
│   ├── constants.ts           # Error codes, OID mappings, pool defaults
│   └── utils.ts               # getField (typed), safe JSON parse, input validation
└── html/
    ├── postgres-config.html   # Config node editor UI (tabs: connection, security, pool)
    ├── postgres-query.html    # Query node editor UI (SQL editor, query config)
    └── postgres-listener.html # Listener node editor UI (channel, parse options)
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|---------------|------------------------|
| `PostgresDBNode` (config) | Owns `pg.Pool` lifecycle; exposes pool metadata; handles credentials; registers `close` to drain pool | `RED.nodes.createNode`; creates `new Pool(config)`; `this.on('close', () => pool.end())`; emits health status via `node.status()` |
| `PostgresNode` (query) | Receives `msg`, renders Mustache template, executes query (or transaction, or stream), sends result downstream | `this.on('input', ...)`; acquires client; manages `BEGIN/COMMIT/ROLLBACK` for transactions; handles cursor for streaming; `node.send(msg)` in finally |
| `PostgresListenerNode` | Permanently acquires one client; issues `LISTEN channel`; forwards notifications as messages; auto-reconnects on drop | `pool.connect()` in constructor; `client.on('notification', ...)`; `node.on('close', () => UNLISTEN + release)`; reconnect loop with backoff |
| `pool-manager.ts` | Pool config assembly, `pool.on('error')` handler, health check (periodic `SELECT 1`), pool metrics (`totalCount/idleCount/waitingCount`) | Pure module consumed by `PostgresDBNode`; exports `createPool(config)` and `getPoolMetrics(pool)` |
| `query-executor.ts` | Single query via `pool.query()`; transaction via `pool.connect() + BEGIN/COMMIT/ROLLBACK`; streaming via `pg-cursor` with batched `node.send()` | Exports `executeQuery()`, `executeTransaction()`, `executeStream()` — all async functions taking pool reference |
| `type-mapper.ts` | Registers custom `pg.types.setTypeParser()` for `numeric`→number, `timestamptz`→ISO string, `jsonb` optional parse; toggle-controlled | Called once at module init; exports `applyTypeMappings(config)` |
| `retry-handler.ts` | Classifies errors as transient (40001, 40P01, 53300, 57P01, 08006) vs permanent; implements exponential backoff with jitter; configurable max retries and max delay | Exports `withRetry(fn, options)` wrapper; used by query-executor and pool-manager |
| `template-renderer.ts` | Wraps Mustache with safety: SQL injection pattern detection, `msg.params`-only mode toggle, logging sanitized queries | Exports `renderQuery(template, msg, options)`; returns `{ query: string, warnings: string[] }` |

## Recommended Project Structure

```
src/
├── index.ts                          # Module entry: register all 3 types with RED
├── nodes/
│   ├── postgres-config.ts            # PostgresDBNode: ~80 lines
│   ├── postgres-query.ts             # PostgresNode: ~120 lines
│   └── postgres-listener.ts          # PostgresListenerNode: ~140 lines
├── lib/
│   ├── pool-manager.ts               # Pool lifecycle, events, health: ~100 lines
│   ├── query-executor.ts             # Query/transaction/stream dispatch: ~180 lines
│   ├── type-mapper.ts                # Type parsers, toggle logic: ~80 lines
│   ├── retry-handler.ts              # Backoff, error classification: ~70 lines
│   ├── template-renderer.ts          # Mustache + safety: ~60 lines
│   ├── channel-sanitizer.ts          # PG identifier validation: ~30 lines
│   └── logger.ts                     # Structured logging wrapper: ~40 lines
├── shared/
│   ├── types.ts                      # All interfaces: ~120 lines
│   ├── constants.ts                  # Error codes, OIDs, defaults: ~50 lines
│   └── utils.ts                      # getField, validators, safeParse: ~60 lines
├── html/
│   ├── postgres-config.html          # Config UI: ~250 lines
│   ├── postgres-query.html           # Query UI: ~150 lines
│   └── postgres-listener.html        # Listener UI: ~80 lines
└── locales/
    └── en-US/
        └── postgrestor.json          # i18n strings
```

### Structure Rationale

- **`src/index.ts`**: Single entry point; registration is a side effect. Keeps `package.json` `"node-red": { "nodes": { "postgres": "dist/index.js" } }` clean.
- **`src/nodes/`**: One file per node type. Each file is the Node-RED constructor function. Node files use `lib/` modules for business logic. This is the standard Node-RED contrib node pattern — `nodes/` maps 1:1 to `RED.nodes.registerType()` calls.
- **`src/lib/`**: Pure TypeScript modules with no Node-RED runtime dependency. Separating pool management, query execution, retry logic, and type mapping from the node constructors makes them testable in isolation. A unit test can import `retry-handler.ts` without needing the full Node-RED runtime.
- **`src/shared/`**: Cross-cutting concerns consumed by both `nodes/` and `lib/`. `types.ts` is the canonical source of truth for all interfaces. `constants.ts` centralizes magic values. `utils.ts` holds the `getField()` function (ported from the current single-file code) and input validation utilities.
- **`src/html/`**: Editor-side templates. Kept separate from `nodes/` because they are not included in the JavaScript bundle — Node-RED loads them as static HTML fragments. One HTML file per node type keeps editor initialization independent.
- **`src/locales/`**: i18n strings. Currently only `en-US`, but the directory structure supports additional languages.

## Architectural Patterns

### Pattern 1: Config Node as Pool Owner

**What:** The config node (`PostgresDBNode`) creates and owns the `pg.Pool` instance. All action nodes reference it via `RED.nodes.getNode(config.PostgresDBNode)`. The pool is never duplicated — a single pool services all queries and listeners sharing the same database configuration.

**When to use:** Always — this is the standard Node-RED pattern for shared connections (used by MQTT, MySQL, all database nodes). Config nodes are globally scoped by default, meaning one pool per database configuration, shared across all flows.

**Trade-offs:**
- Pro: One pool per database, natural connection reuse, DRY configuration
- Pro: Close/drain happens in one place; no scattered cleanup
- Con: All listeners share the same pool as queries; heavy listener usage can starve query connections. Mitigation: expose separate `max` setting, or consider a dedicated listener pool in Phase 3.

**Example:**
```typescript
// postgres-config.ts — Config node owns the pool
function PostgresDBNode(this: PostgresDBNode, config: PostgresDBConfig) {
  RED.nodes.createNode(this, config);
  this.pool = poolManager.createPool(config);

  this.pool.on('error', (err: Error, client: PoolClient) => {
    this.error(`Pool error on idle client: ${err.message}`);
  });

  this.on('close', (removed: boolean, done: () => void) => {
    this.pool.end().then(() => {
      this.log('Pool drained and closed');
      done();
    });
  });
}

// postgres-query.ts — Action node references the config node
function PostgresNode(this: PostgresNode, config: PostgresNodeConfig) {
  RED.nodes.createNode(this, config);
  const dbConfig = RED.nodes.getNode(config.PostgresDBNode) as PostgresDBNode;

  this.on('input', async (msg: NodeMessage, send: SendFn, done: DoneFn) => {
    try {
      const result = await queryExecutor.executeSingle(dbConfig.pool, config.query, msg);
      send({ ...msg, payload: result });
      done();
    } catch (err) {
      done(err as Error);
    }
  });
}
```

### Pattern 2: Checkout-Use-Release for Transactions

**What:** Transactions require the same client for all statements. The query node checks out a client from the pool with `pool.connect()`, executes `BEGIN`, runs all SQL statements on that client, then `COMMIT` or `ROLLBACK`, and always releases the client in `finally`.

**When to use:** When `msg.payload` contains an array of query objects (transactions) or when a new dedicated "transaction node" type is used. Single queries still use `pool.query()` for simplicity.

**Trade-offs:**
- Pro: Correct transaction semantics — all queries share the same PostgreSQL session.
- Pro: `finally` block guarantees client release, preventing pool exhaustion.
- Con: More verbose than `pool.query()` — must manage client lifecycle explicitly.
- Con: If the release is skipped, the pool leaks. Mitigation: always use `try/finally` pattern; eslint rule `no-unsafe-finally` catches errors.

**Example:**
```typescript
// query-executor.ts
export async function executeTransaction(
  pool: Pool,
  queries: QueryDef[],
  msg: NodeMessage
): Promise<QueryResult[]> {
  const client = await pool.connect();
  const results: QueryResult[] = [];
  try {
    await client.query('BEGIN');
    for (const q of queries) {
      const query = templateRenderer.renderQuery(q.text, msg);
      const res = await client.query(query, q.params || []);
      if (q.output) results.push(res);
    }
    await client.query('COMMIT');
    return results;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

### Pattern 3: Cursor-Stream with Batched `node.send()`

**What:** For large result sets, use `pg-cursor` to read rows in batches (e.g., 100 rows at a time). Each batch triggers a `node.send()` call. The cursor stays on a checked-out client until all rows are consumed or the flow is stopped.

**When to use:** When the user enables "streaming" mode on the query node and the result set may exceed available memory. The node outputs multiple messages, one per batch, on the same output. Use multiple outputs if the node needs to distinguish batches from a final summary message.

**Trade-offs:**
- Pro: Memory-efficient — only `batchSize` rows in memory at once.
- Pro: Backpressure-aware — `node.send()` is synchronous, but batches pace naturally.
- Con: Holds a pool client for the entire duration of the stream. Other queries may wait.
- Con: If the flow stops mid-stream, the cursor and client must be cleaned up. The `close` handler must call `cursor.close()` and `client.release()`.

**Example:**
```typescript
// query-executor.ts
import Cursor from 'pg-cursor';

export async function executeStream(
  pool: Pool,
  query: string,
  params: unknown[],
  send: SendFn,
  msg: NodeMessage
): Promise<void> {
  const client = await pool.connect();
  const cursor = client.query(new Cursor(query, params));
  try {
    let rows = await cursor.read(100); // batch size
    while (rows.length > 0) {
      send({ ...msg, payload: rows, batch: true });
      rows = await cursor.read(100);
    }
    send({ ...msg, payload: [], batch: true, complete: true });
  } finally {
    await cursor.close();
    client.release();
  }
}
```

### Pattern 4: Listener Auto-Reconnect Loop

**What:** The listener node acquires a dedicated client for `LISTEN`. On any error or disconnection (detected via `client.on('error')` or `client.on('end')`), it enters a reconnect loop with exponential backoff. A `node.on('close')` handler runs `UNLISTEN` and `client.release()` before destroying the node.

**When to use:** For the `PostgresListenerNode`. This is the canonical way to handle PostgreSQL `LISTEN/NOTIFY` in Node.js — one connection per listener, with reconnection logic.

**Trade-offs:**
- Pro: Survives network blips, server restarts, and idle timeouts.
- Pro: Status feedback: node status reflects connection state (green=connected, yellow=reconnecting, red=failed).
- Con: Permanent pool slot consumption per listener. Mitigation: document this; consider a separate pool for listeners in future phases.

**Example:**
```typescript
// postgres-listener.ts
async function connectListener(node: PostgresListenerNode, pool: Pool, channel: string) {
  try {
    const client = await pool.connect();
    node.currentClient = client;

    client.on('notification', ({ channel: ch, payload }) => {
      node.send({ payload, channel: ch });
    });

    client.on('error', () => reconnect(node, pool, channel));
    client.on('end', () => reconnect(node, pool, channel));

    await client.query(`LISTEN ${sanitizeChannel(channel)}`);
    node.status({ fill: 'green', shape: 'dot', text: `listening: ${channel}` });
  } catch (err) {
    node.status({ fill: 'red', shape: 'ring', text: 'connection failed' });
    reconnect(node, pool, channel);
  }
}

function reconnect(node: PostgresListenerNode, pool: Pool, channel: string) {
  if (node.closing) return;
  if (node.currentClient) {
    node.currentClient.release(true); // destroy broken client
    node.currentClient = null;
  }
  const delay = Math.min(node.reconnectDelay * 2, 30000);
  node.reconnectDelay = delay;
  node.status({ fill: 'yellow', shape: 'ring', text: `reconnecting ${delay/1000}s` });
  node.reconnectTimer = setTimeout(() => connectListener(node, pool, channel), delay);
}
```

## Data Flow

### Single Query Flow

```
Input msg → PostgresNode
  ├── 1. Render Mustache template: config.query + { msg } → SQL text
  ├── 2. pool.query(sql, msg.params) → pg.Result
  ├── 3. msg.payload = result.rows
  ├── 4. msg.error = { code, detail, constraint, table } (structured on error)
  ├── 5. node.status({ fill, shape, text }) — success/failure
  └── 6. send(msg) → downstream nodes
```

### Transaction Flow

```
Input msg → PostgresNode (detected: msg.payload is array of query objects)
  ├── 1. pool.connect() → client
  ├── 2. client.query('BEGIN')
  ├── 3. For each query in msg.payload:
  │     ├── render template
  │     ├── client.query(sql, params) → result
  │     └── if query.output: collect result
  ├── 4. client.query('COMMIT') — or ROLLBACK on error
  ├── 5. client.release()
  ├── 6. msg.payload = collected results (array)
  └── 7. send(msg) → downstream
```

### Stream/Cursor Flow

```
Input msg → PostgresNode (streaming mode enabled)
  ├── 1. pool.connect() → client
  ├── 2. new Cursor(sql, params) → client.query(cursor)
  ├── 3. Loop:
  │     ├── cursor.read(100) → rows
  │     ├── send({ ...msg, payload: rows, batch: true })
  │     └── repeat until rows.length === 0
  ├── 4. send({ ...msg, payload: [], complete: true }) → final signal
  ├── 5. cursor.close()
  └── 6. client.release()
```

### Listener/Notify Flow

```
Node-RED deploy → PostgresListenerNode
  ├── 1. pool.connect() → client (permanent)
  ├── 2. Sanitize channel name
  ├── 3. client.query('LISTEN channel')
  └── 4. node.status({ fill: 'green', shape: 'dot', text: 'listening: channel' })

PostgreSQL NOTIFY → client.on('notification')
  ├── 1. { channel, payload } received
  ├── 2. (optional) JSON.parse(payload) if detected
  ├── 3. msg = { channel, payload }
  └── 4. send(msg) → downstream

Connection drop → client.on('error') or client.on('end')
  ├── 1. Release broken client
  ├── 2. Set status to yellow (reconnecting)
  ├── 3. Exponential backoff timer
  └── 4. Reconnect (goto step 1)

Node-RED stop/redeploy → node.on('close')
  ├── 1. node.closing = true (block reconnect)
  ├── 2. Clear reconnect timer
  ├── 3. UNLISTEN channel (if client still connected)
  ├── 4. client.release()
  └── 5. done()
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-10 flows / small env | Default pool (max=10) is sufficient. Single pool for queries and listeners works fine. No special tuning needed. |
| 10-50 concurrent flows | Consider separate pool for listeners (`listenerMax` setting) to prevent query starvation. Monitor `pool.waitingCount`. Increase `max` to 20-30. Add `statement_timeout` to prevent runaway queries. |
| 50+ flows / production | Dedicated listener pool (or connection-per-listener with its own pool). Streaming mode becomes essential for large datasets. Pool metrics exposed via status node. `maxLifetimeSeconds` configured to rotate connections through load balancers. Consider `pgBouncer` between Node-RED and PostgreSQL for connection multiplexing at scale. |

### Scaling Priorities

1. **First bottleneck:** Pool exhaustion — too many concurrent requests waiting for connections. Fix: increase `pool.max`, add `waitingCount` monitoring, separate listener pool.
2. **Second bottleneck:** Memory pressure from large result sets. Fix: document and promote streaming/cursor mode for queries returning >10K rows.
3. **Third bottleneck:** Single PostgreSQL server throughput. Fix: read replicas + separate query pools, connection string from `DATABASE_URL`.

## Anti-Patterns

### Anti-Pattern 1: `pool.query()` for Transactions

**What people do:** Call `pool.query('BEGIN')`, then `pool.query('INSERT...')`, then `pool.query('COMMIT')` — or embed `BEGIN/COMMIT` in the Mustache template string.

**Why it's wrong:** Each `pool.query()` may use a different client from the pool. PostgreSQL scopes transactions to a single client session. The `COMMIT` would apply to a different client's empty transaction, leaving the `INSERT` uncommitted (or worse, auto-committed outside the transaction). This silently corrupts data integrity.

**Do this instead:** Always use `pool.connect()` for transactions. Keep all statements on the same client. Wrap in `try/finally` to guarantee `ROLLBACK` on error and `client.release()` on completion.

### Anti-Pattern 2: Forgetting to Release Clients

**What people do:** `pool.connect()` in `try` block, `client.release()` inside `try` after queries. If a query throws, the `release()` is never reached.

**Why it's wrong:** The client leaks. After enough leaks, the pool is exhausted — all future `pool.connect()` calls hang indefinitely. The Node-RED flow becomes unresponsive until the process is restarted.

**Do this instead:** Always `client.release()` in a `finally` block. ESLint rule `@typescript-eslint/no-unsafe-finally` helps. Even better: use a helper function `pool.withClient(async (client) => { ... })` that guarantees release.

### Anti-Pattern 3: No Pool Error Handler

**What people do:** Create `new Pool()` without registering `pool.on('error', ...)`.

**Why it's wrong:** If an idle client in the pool encounters a network error, it emits an `error` event on the pool. With no listener, Node.js treats this as an uncaught exception and may crash the entire Node-RED process.

**Do this instead:** Always register `pool.on('error', (err, client) => { node.error('Pool client error', err); })` in the config node constructor. The pool auto-removes the broken client; the handler just prevents the crash.

### Anti-Pattern 4: SQL Injection via Unchecked Mustache

**What people do:** Allow Mustache to inject raw `msg` properties like `{{msg.payload.name}}` directly into SQL without parameterization.

**Why it's wrong:** This is classic SQL injection. An attacker controlling `msg.payload.name` can inject arbitrary SQL. The current codebase's README admits this risk only for the listener, but the same vulnerability exists for the query node.

**Do this instead:** 
1. Add a prominent security warning in the node help text.
2. Implement `msg.params` as the primary payload interface — parameterized queries are the only safe pattern.
3. Make Mustache rendering configurable (off by default in production mode).
4. Add a pattern-based injection detector that warns on common injection patterns (`' OR`, `--`, `; DROP`).

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| PostgreSQL (any) | `pg.Pool` via TCP/SSL | `DATABASE_URL` or individual fields; SSL config for RDS/Azure/Supabase |
| PostgreSQL error codes | `err.code` inspection | Transient codes: 40001, 40P01, 53300, 57P01, 08006, 08001, 57P03 |
| `pg-cursor` | `Submittable` passed to `client.query()` | Requires `npm install pg-cursor`; returns `Promise<Result>` per `cursor.read(N)` |
| `pg-query-stream` (alternative streaming) | Node.js Readable stream | `npm install pg-query-stream`; event-based: `stream.on('data', row => ...)`. Cursor preferred for Node-RED batch pattern. |
| `pg-copy-streams` (COPY) | `Submittable` via `client.query()` | For CSV import/export; out of scope for this milestone but architecture supports it |
| Mustache | Template engine | Renders `config.query` with `{ msg }` context. Constrained by injection detection layer. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Config node → Action nodes | Direct property access: `node.config.pool` | Config node reference resolved via `RED.nodes.getNode()`. Pool is a public property. |
| Action nodes → Pool | `pool.query()` (single) or `pool.connect()` (transaction/stream/listen) | Pool methods are async; always await. |
| Nodes → Editor UI | `node.status({ fill, shape, text })` | Standard Node-RED status API. Editor subscribes automatically. |
| Nodes → Runtime logging | `node.log()`, `node.warn()`, `node.error()`, `node.trace()`, `node.debug()` | Replaces current `console.log()` calls. `node.error()` also triggers Catch nodes. |
| Query node → Downstream flow | `send(msg)` or `send([msg1, msg2])` for multi-output | Always reuse the incoming `msg` object (spread properties, never replace). |
| Message flow completion | `done()` or `done(err)` | Node-RED 1.0+ pattern. Signals runtime that message handling is finished. |

## Suggested Build Order (Dependencies)

```
Phase 1: Foundation (no downstream)
  ├── shared/types.ts          # All interfaces (depends on nothing)
  ├── shared/constants.ts      # Error codes, OIDs (depends on types.ts)
  └── shared/utils.ts          # getField, validators (depends on types.ts)

Phase 2: Library Modules (depends on Phase 1)
  ├── lib/logger.ts            # Logging wrapper (depends on utils.ts)
  ├── lib/retry-handler.ts     # Backoff logic (depends on constants.ts)
  ├── lib/template-renderer.ts # Mustache + safety (depends on logger.ts)
  ├── lib/channel-sanitizer.ts # PG identifier validation (standalone)
  ├── lib/type-mapper.ts       # pg type parsers (depends on constants.ts)
  └── lib/pool-manager.ts      # Pool lifecycle (depends on logger.ts, retry-handler.ts)

Phase 3: Node Implementations (depends on Phase 2)
  ├── nodes/postgres-config.ts # Config node (depends on pool-manager.ts)
  ├── nodes/postgres-query.ts  # Query node (depends on query-executor.ts, template-renderer.ts)
  └── nodes/postgres-listener.ts # Listener node (depends on pool-manager.ts, channel-sanitizer.ts)

Phase 4: Query Executor (depends on Phase 2)
  └── lib/query-executor.ts    # Single/transaction/stream (depends on pool-manager, template-renderer, retry-handler, type-mapper)

Phase 5: Assembly & HTML (depends on Phase 3, 4)
  ├── index.ts                 # Registration entry point (depends on all nodes/)
  └── html/*.html              # Editor templates (depends on node definitions)
```

**Key insight:** `shared/types.ts` must be written first because every other module depends on it. `lib/` modules can be developed in parallel since they only depend on `shared/`. The `query-executor.ts` is deliberately placed after the node skeletons because it's the most complex module and benefits from the interfaces being stabilized by the node implementations.

## Sources

- [Node-RED: Creating Nodes — JavaScript file](https://nodered.org/docs/creating-nodes/node-js) — Node constructor, `input` listener, `send`/`done` pattern, `close` lifecycle, status API, logging
- [Node-RED: Configuration nodes](https://nodered.org/docs/creating-nodes/config-nodes) — Config node registration, `category: 'config'`, shared connection pattern
- [Node-RED: Node status](https://nodered.org/docs/creating-nodes/status) — `fill`/`shape`/`text` status API
- [node-postgres: Pooling](https://node-postgres.com/features/pooling) — `pool.query()`, `pool.connect()`, checkout-use-return, `pool.end()` shutdown
- [node-postgres: Transactions](https://node-postgres.com/features/transactions) — Same-client requirement, `BEGIN/COMMIT/ROLLBACK` pattern, `client.release()` in `finally`
- [node-postgres: pg.Pool API](https://node-postgres.com/apis/pool) — Pool config, events (`error`, `connect`, `acquire`, `release`), `totalCount`/`idleCount`/`waitingCount`, `onConnect` hook
- [node-postgres: pg.Client API](https://node-postgres.com/apis/client) — `notification` event, `getTransactionStatus()`, `statement_timeout`, `query_timeout`
- [node-postgres: pg.Cursor API](https://node-postgres.com/apis/cursor) — `cursor.read(N)` for batched reads, `cursor.close()`, client management
- [node-postgres: Queries](https://node-postgres.com/features/queries) — Parameterized queries, prepared statements (`name` in QueryConfig), query config object, row mode
- [node-postgres: Data Types](https://node-postgres.com/features/types) — String defaults, uuid/jsonb auto-parse, date/timestamp parsing, custom type parsers
- [pg-query-stream npm](https://www.npmjs.com/package/pg-query-stream) — Alternative streaming: Node.js Readable stream over cursor; pipeable to JSONStream
- [node-red-contrib-postgres-multi](https://flows.nodered.org/node/node-red-contrib-postgres-multi) — Reference implementation: array-of-queries transaction pattern with explicit `BEGIN`/`COMMIT`; `output: true` flag per query

---
*Architecture research for: node-red-contrib-postgrestor — PostgreSQL contrib node revival*
*Researched: 2026-06-10*
