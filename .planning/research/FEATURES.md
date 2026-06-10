# Feature Research

**Domain:** Node-RED PostgreSQL contrib node (production-grade database integration)
**Researched:** 2026-06-10
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete. Nodes without these feel like toys, not tools.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Connection pooling with configurable limits | Every production DB node pools connections; hitting `max_connections` on PostgreSQL is a crash-scenario | LOW | Have: `pg.Pool` already in use. Need: UI exposure for max/idleTimeout/connectionTimeout. `node-red-contrib-postgres-variable` exposes these. |
| Named parameter binding (`msg.params = {name: value}`) | Users coming from MySQL node (`:name` syntax) and node-postgres-named expect this. Positional `$1` is fine for devs but Node-RED users write SQL in a UI field — named is ergonomic | MEDIUM | Have: positional `$1` with `msg.params` array. Gap: no `{name: value}` object binding. Both `re-postgres` and `postgres-variable` support named params. |
| SSL/TLS with full configurability | Managed DBs (RDS, Azure, Supabase, DigitalOcean) require specific SSL modes, CA certs, and sometimes client certs. A boolean on/off toggle is not production-ready | MEDIUM | Have: boolean SSL toggle. Gap: missing `sslmode`, CA cert path, client cert path. `postgres-variable` already has all of this. |
| Query timeout with clean cancellation | Long-running queries block the pool. Users assume "it will timeout." Without it, a bad query leaves the node hanging silently | MEDIUM | `pg` supports `statement_timeout` at connection level and `query_timeout` at query level. Node-RED nodes MUST clean up `AbortController` on close. |
| Connection from `DATABASE_URL` or env vars | Standard pattern for 12-factor apps. Every competitor (re-postgres, postgres-variable) supports this. Deployments via Docker, Kubernetes, Heroku all pass connection strings | LOW | `pg.Pool({ connectionString })` handles this natively. Just needs UI field + parsing. |
| Structured error messages | Node-RED flows depend on `msg.error` for routing. A plain string forces users to string-match. Structured errors with `code`, `detail`, `constraint` let flows branch on error type | LOW | Have: `throwErrors` toggle sends basic error. Gap: `msg.error` is not enriched with PostgreSQL error fields (`code`, `detail`, `constraint`, `table`, `schema`, `where`). |
| Clean pool shutdown on Node-RED redeploy | Unexpected behavior when flows are redeployed while queries are in-flight. Users expect graceful shutdown | LOW | Must handle `pool.end()` on Node-RED `close` event. Currently missing proper lifecycle. |
| Pool health/status visibility | Users need to know if the database is reachable, pool is healthy, and how many connections are active. A runtime status indicator is the minimum | LOW-MEDIUM | No competitor has a health node. Runtime status on the config node (`active/idle/waiting/error`) is sufficient for MVP. |
| i18n support (English minimum) | Node-RED is international. Missing translations = feels unpolished. English is the minimum, but the infrastructure must exist | LOW | Have: en-US locale. Infrastructure (`locales/`) already in place. |

### Differentiators (Competitive Advantage)

Features that set the product apart. No current Node-RED PostgreSQL competitor has these. They are the reason users choose this node over alternatives.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Multi-step transactions (BEGIN/COMMIT/ROLLBACK) | **The #1 missing feature.** Users building data pipelines need atomic multi-statement operations. Example: deduct inventory + create order + log audit — all or nothing. This is the killer feature that justifies the revival | HIGH | Node-postgres requires manually managing `BEGIN/COMMIT/ROLLBACK` on a single checked-out client. Must NOT use `pool.query()`. Design: either a dedicated transaction node that wraps sub-nodes, or an array-of-queries approach on the existing query node. The array approach (`msg.payload = [{query, params}, ...]`) is simpler to implement and fits Node-RED's message-passing model better. |
| Streaming/cursor mode for large result sets | Big data in Node-RED is common (IoT sensor dumps, log processing, analytics). Loading 500K rows into memory crashes Node.js. Cursor mode emits rows in configurable batches | HIGH | Requires `pg-cursor` (separate npm package). Must use a checked-out client (not `pool.query()`). Batches emitted as sequential messages on the output. Node-RED needs a special "streaming" output mode that sends one message per batch with a pagination marker. |
| LISTEN/NOTIFY with auto-reconnect, channel sanitization, JSON parsing | Real-time push from DB without polling. Unique to this node. Unlike `pg_notify`, this works across connections. Production blocker: listener connections silently drop and never reconnect | MEDIUM | Have: basic LISTEN/NOTIFY. Gap: auto-reconnect on connection drop (critical), channel name sanitization (SQL injection vector in README), auto-parse JSON payload. Listener should expose a `msg.channel` and `msg.payload` (parsed). |
| Retry with exponential backoff on transient errors | PostgreSQL throws retriable errors: `40P01` (deadlock), `40001` (serialization failure), `57P01` (admin shutdown), connection resets. Without retry, flows fail on transient blips | HIGH | Must classify errors as retriable vs non-retriable. Configurable: max retries, base delay, max delay, backoff multiplier. Must not retry constraint violations (`23505`, `23503`) or syntax errors (`42601`). `pg` has no built-in retry — implement as middleware around query execution. |
| COPY support for high-performance CSV import/export | Bulk data loading at wire speed. pg-copy-streams is 10-100x faster than INSERT statements for bulk loads. Industrial/IoT use cases need this | HIGH | Requires `pg-copy-streams` (separate npm package). COPY FROM: accept CSV/TSV from file or upstream node, pipe to PostgreSQL. COPY TO: stream table data to downstream node or file. Must use checked-out client, runs inside an implicit transaction. |
| Prepared statements for high-frequency repeated queries | IoT/telemetry scenarios where the same INSERT runs thousands of times per second. Prepared statements skip parsing overhead | MEDIUM | `pg` supports named prepared statements via `client.query({name, text, values})`. Query node should have a "Use prepared statement" toggle with optional statement name. Important: prepared statements are per-client, not per-pool — store in config node with WeakMap keyed by pool. |
| SQL editor with syntax highlighting in node config | Writing SQL in a plain `<textarea>` is error-prone. Node-RED ships with CodeMirror. Enabling SQL mode is a checkbox away | LOW | Node-RED bundles CodeMirror with SQL syntax mode (`text/x-sql`). Add `uiCodeMirror` attribute to the query field in the HTML template. `node-red-contrib-postgres-variable` does NOT have this. |
| Automatic type mapping (`numeric→number`, `jsonb→parsed`, `timestamptz→ISO`) | PostgreSQL returns `numeric` as string (precision), `jsonb` as string (needs JSON.parse), `timestamptz` as Date (needs ISO). Users shouldn't boilerplate this in function nodes | MEDIUM | `pg-types` `setTypeParser()` allows custom parsers. Register per-pool. Make optional via toggle: "Auto-parse types" checkbox. Note: `numeric` as `number` loses precision for very large numbers — document the tradeoff. |
| Named output ports (success/failure/stream) | Node-RED best practice for DB nodes is multiple output ports: top = query results, bottom = errors/streaming. This avoids flow-level error filtering | MEDIUM | Node-RED supports multiple outputs. Top port: `msg.payload = rows` on success. Second port: `msg.payload = error` on failure. Third port (optional): row-by-row or batch streaming. |
| Pool health/status node | A dedicated node showing pool metrics in the Node-RED status bar: `connected [5 active / 2 idle / 0 waiting]`. Clickable for detailed stats. Production operators need this | MEDIUM | Separate node type (`postgrestor-status`). Uses `pool.totalCount`, `pool.idleCount`, `pool.waitingCount`. Updates periodically or on `connect`/`acquire`/`remove` events. |

### Anti-Features (Do NOT Build)

Features that seem good but create problems. Documented here to prevent scope creep.

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| ORM/Schema abstraction over PostgreSQL | Users coming from web frameworks want "query by model" | Node-RED is a flow-based integration tool, not an application framework. ORMs add layers of abstraction that hide SQL from users who need it. Debugging becomes harder because the actual SQL is generated, not authored | Expose raw SQL with excellent templating (Mustache) and parameterized queries. Add a "query builder" helper node later if demand exists, but keep it as a helper that outputs SQL strings |
| Multi-database backends (MySQL, SQLite, MSSQL) | "Why can't it talk to all databases?" | Each database has different SQL dialects, connection semantics, error codes, and wire protocols. Attempting abstraction creates a lowest-common-denominator product that's mediocre for all databases. The `pg` library is PostgreSQL-only for good reason | Stay PostgreSQL-only. If users need MySQL, they install a MySQL node. This is already decided in PROJECT.md Out of Scope |
| Connection from `msg` properties at query time | "Why can't I decide the database at query time based on msg.dbName?" | This creates a new connection on every message, bypassing the pool entirely. Users will accidentally create connection storms that crash PostgreSQL. The entire point of pooling is amortizing connection cost | Keep connection config at the config-node level (one pool per config). If users need multiple databases, they instantiate multiple config nodes and switch between them with a `postgrestor-switch` node or by using different query nodes |
| Automatic schema discovery and migration | "Why can't the node inspect my database and auto-generate queries?" | Schema discovery requires additional queries on every deployment, adds complexity for a feature that's wrong most of the time. Migrations are a deployment concern, not a runtime concern | Users write their own SQL. This is an integration node, not a database admin tool |
| Real-time table change notifications (WAL-based) | "Can you emit messages when any row in table X changes?" | PostgreSQL logical replication (WAL) requires `wal_level = logical`, replication slots, and decoding plugins. This is extremely fragile, has operational complexity, and ties the node to specific PostgreSQL versions. `pg_recvlogical` is not the same as `LISTEN/NOTIFY` | LISTEN/NOTIFY is the correct real-time mechanism for application-level events. If users need WAL-based CDC, they should use Debezium, not a Node-RED node |
| Graphical query builder (drag-and-drop SQL) | "Why can't I build SELECT queries visually?" | Node-RED users who need PostgreSQL are SQL-literate. A visual query builder produces worse SQL than hand-written queries and can't express joins, CTEs, window functions, or subqueries | Trust users to write SQL. Provide an excellent SQL editor (syntax highlighting, auto-indent), not a visual builder |

## Feature Dependencies

```
Multi-step transactions
    └──requires──> Structured error messages (for ROLLBACK decisions)
    └──requires──> Query timeout (prevents hung transactions)
    └──enhances──> Retry on transient errors (retry entire transaction atomically)

Streaming/cursor mode
    └──requires──> Named output ports (separate output for stream batches)
    └──enhances──> Automatic type mapping (parse rows inline during streaming)

LISTEN/NOTIFY auto-reconnect
    └──requires──> Pool health/status visibility (to surface reconnection state)
    └──requires──> Structured error messages (to propagate connection errors)

COPY support
    └──requires──> Streaming/cursor mode (COPY is inherently streaming)
    └──conflicts──> Retry on transient errors (COPY streams can't be retried mid-stream)

Retry with exponential backoff
    └──requires──> Query timeout (failed queries must time out before retry)
    └──requires──> Structured error messages (to classify retriable errors)

Prepared statements
    └──enhances──> Parameterized queries (builds on same binding mechanism)
    └──requires──> Pool health/status visibility (statements are per-client, pool cycled clients lose them)

Named parameter binding
    └──requires──> Parameterized queries (builds on existing $1/$2 mechanism)
    └──enhances──> Mustache templating (users may want both — named binding for params, Mustache for dynamic SQL structure)

SSL/TLS full configurability
    └──requires──> Connection from DATABASE_URL (env var contains SSL params in query string)

Automatic type mapping
    └──requires──> Named output ports (parsed vs raw should go to different ports or be toggleable)
```

### Dependency Notes

- **Multi-step transactions requires Structured error messages:** ROLLBACK decisions depend on knowing _why_ a statement failed. A serialization failure (`40001`) means retry the transaction; a constraint violation (`23505`) means fail fast.
- **COPY support conflicts with Retry:** COPY is a streaming protocol — once data is flowing into PostgreSQL, you can't roll back and retry individual rows. The entire COPY succeeds or fails. Retry must happen at the COPY level (re-send the whole stream).
- **Streaming/cursor mode requires Named output ports:** Streaming emits multiple messages per single input. A single output port can't distinguish "here's a batch" from "here's the final batch." Need a dedicated streaming output or a `msg.complete` marker.
- **Prepared statements require Pool health visibility:** Prepared statements live on a specific client connection. When the pool cycles clients (idle timeout, max lifetime), the statement is lost. Users need visibility into whether their prepared statement is still cached.
- **Named parameter binding enhances Mustache templating:** They serve different purposes. Named binding handles safe value substitution (`WHERE id = :userId`). Mustache handles dynamic query structure (`SELECT {{columns}} FROM {{table}}`). Both should coexist — not one replacing the other.

## MVP Definition

### Launch With (v1 — Production Readiness Baseline)

Minimum viable product — what's needed for the node to be taken seriously in production.

- [ ] **Connection pooling with configurable limits** — The pool already exists; expose `max`, `idleTimeout`, `connectionTimeout` in the UI. This is a 2-hour change that unlocks all other features.
- [ ] **Named parameter binding** — Users should not have to count `$1, $2, $3` positions. `msg.params = {name: 'Andrea', age: 42}` → `WHERE name = $1 AND age = $2`. Single most impactful DX improvement.
- [ ] **SSL/TLS with full configurability** — CA cert, client cert, `sslmode` dropdown (disable, require, verify-ca, verify-full). Without this, managed PostgreSQL in RDS/Azure/Supabase is a non-starter.
- [ ] **Query timeout with clean cancellation** — Per-node configurable timeout (ms). Uses `statement_timeout` or `AbortController`. Prevents a bad query from silently blocking the pool forever.
- [ ] **Connection from `DATABASE_URL`** — Single input field that parses `postgresql://user:pass@host:port/db?sslmode=require`. Standard deployment pattern.
- [ ] **Structured error messages** — `msg.error` becomes an object with `{code, detail, constraint, table, message}` instead of a plain string. Enables flow-level error routing without fragile string matching.
- [ ] **Pool health/status visibility** — Config node shows runtime status: `pool: 5 active / 2 idle / 0 waiting`. Updates on connect/disconnect events.
- [ ] **Clean pool shutdown** — `pool.end()` on Node-RED `close` event. No more lingering connections on redeploy.

### Add After Validation (v1.1 — Competitive Features)

Features to add once core reliability is proven. These are the features that make users switch from competitors.

- [ ] **Multi-step transactions** — Highest-value differentiator. Start with the array-of-queries approach (`msg.payload = [{query, params}, ...]`) since it fits Node-RED's message-passing model without needing a special transaction node type. Add a dedicated transaction node later if demand warrants.
- [ ] **LISTEN/NOTIFY with auto-reconnect** — Listeners that survive connection drops. Channel sanitization to close the SQL injection vector. Auto-parse JSON payloads. This is unique to this node in the ecosystem.
- [ ] **SQL editor with CodeMirror highlighting** — 10-line HTML change. Enormous DX improvement. Every competitor writes SQL in a plain textarea. This alone signals production quality.

### Future Consideration (v2+ — Power Features)

Features to defer until the core is stable and has users.

- [ ] **Retry with exponential backoff** — Critical for reliability but complex to get right. Error classification is the hard part. Needs real-world testing with diverse PostgreSQL error scenarios.
- [ ] **Streaming/cursor mode** — Requires `pg-cursor` dependency, checked-out client management, and batched output semantics. High value for IoT/large data but complex to implement correctly in Node-RED's single-message-per-node model.
- [ ] **COPY support** — Very high value for bulk data scenarios but introduces streaming complexity. Depends on streaming infrastructure being solid first.
- [ ] **Automatic type mapping** — Nice-to-have that eliminates boilerplate function nodes. Lower priority than reliability and correctness features.
- [ ] **Prepared statements** — Valuable for high-frequency insert scenarios (IoT telemetry). Needs careful per-client caching strategy. Lower priority than transactions and streaming.
- [ ] **Named output ports** — Requires significant HTML template changes. Only valuable once streaming and transactions produce multiple output modes.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Connection pooling config UI | HIGH | LOW | **P1** |
| Named parameter binding | HIGH | MEDIUM | **P1** |
| SSL/TLS full config | HIGH | MEDIUM | **P1** |
| Query timeout | HIGH | MEDIUM | **P1** |
| DATABASE_URL connection | HIGH | LOW | **P1** |
| Structured error messages | HIGH | LOW | **P1** |
| Pool health/status | MEDIUM | LOW | **P1** |
| Clean pool shutdown | MEDIUM | LOW | **P1** |
| Multi-step transactions | HIGH | HIGH | **P2** |
| LISTEN/NOTIFY auto-reconnect | HIGH | MEDIUM | **P2** |
| SQL editor with highlighting | MEDIUM | LOW | **P2** |
| Retry with exponential backoff | HIGH | HIGH | **P3** |
| Streaming/cursor mode | HIGH | HIGH | **P3** |
| COPY support | MEDIUM | HIGH | **P3** |
| Automatic type mapping | MEDIUM | MEDIUM | **P3** |
| Prepared statements | MEDIUM | MEDIUM | **P3** |
| Named output ports | MEDIUM | MEDIUM | **P3** |

**Priority key:**
- **P1:** Must have for launch — node feels incomplete without these
- **P2:** Should have, add immediately after validation — competitive differentiators
- **P3:** Nice to have, future consideration — power features for advanced users

## Competitor Feature Analysis

| Feature | re-postgres (maxboar) | postgres-variable (lotockii) | stackhero-mysql (reference) | Our Target |
|---------|----------------------|------------------------------|-----------------------------|------------|
| Connection pooling | ✓ (basic) | ✓ (configurable) | ✓ (configurable) | ✓ **FULL** (UI-exposed limits) |
| Parameterized queries | ✓ (named `$prop`) | ✓ (named via node-postgres-named) | ✓ (named + positional + bulk) | ✓ **FULL** (named + positional + Mustache) |
| SSL/TLS config | ✗ | ✓ (CA cert, sslmode) | ✓ (TLS checkbox) | ✓ **FULL** (CA cert, client cert, sslmode) |
| DATABASE_URL | ✗ | ✗ | ✗ | ✓ |
| LISTEN/NOTIFY | ✗ | ✗ | N/A (MySQL) | ✓ **UNIQUE** |
| Multi-step transactions | ✗ | ✗ | ✗ | ✓ **UNIQUE** (no competitor has this) |
| Streaming/cursor | ✗ | ✗ | ✗ | ✓ **UNIQUE** |
| COPY import/export | ✗ | ✗ | ✗ | ✓ **UNIQUE** |
| Retry on transient errors | ✗ | ✗ | ✗ | ✓ **UNIQUE** |
| Prepared statements | ✗ | ✗ | ✗ | ✓ **UNIQUE** |
| SQL editor highlighting | ✗ | ✗ | ✗ | ✓ **UNIQUE** |
| Type auto-mapping | ✗ | ✗ | ✗ | ✓ **UNIQUE** |
| Pool health/status | ✗ | ✗ | ✗ | ✓ **UNIQUE** |
| i18n | ✗ | ✗ | ✗ | ✓ (en-US) |
| "One message per row" mode | ✓ | ✗ | ✗ | ✓ (via streaming) |
| Context-based config | ✗ | ✓ (flow/global/env) | ✗ | ✓ (via Mustache + typed inputs) |

**Key takeaway:** No competitor has transactions, streaming, COPY, retry, prepared statements, or any reliability pattern. All competitors are basic query executors with pooling. This node can be the **definitive** production PostgreSQL node for Node-RED by shipping the P1 table stakes and the P2 differentiators.

## Sources

- [node-postgres official documentation](https://node-postgres.com/) — Transactions require same client instance; Cursor API for streaming; Pool events for health monitoring
- [pg-copy-streams npm page](https://www.npmjs.com/package/pg-copy-streams) v7.0.0 — COPY FROM/TO as Node.js streams; runs inside transactions; 471K weekly downloads
- [node-red-contrib-re-postgres npm page](https://www.npmjs.com/package/node-red-contrib-re-postgres) v0.3.7 — Basic query node; named params via `$propertyName`; connection string config; 330 weekly downloads
- [node-red-contrib-postgres-variable GitHub](https://github.com/lotockii/node-red-contrib-postgres-variable) v0.6.0 — Dynamic config from flow/global/env; SSL with CA cert; named params via node-postgres-named; 4 stars
- [node-red-contrib-stackhero-mysql npm page](https://www.npmjs.com/package/node-red-contrib-stackhero-mysql) v1.0.6 — Most popular Node-RED DB node (1030 weekly downloads); TLS encryption; named/positional/bulk params; reference for Node-RED DB node API design
- [@topcs/node-red-contrib-postgres GitHub](https://github.com/andreabat/node-red-contrib-postgrestor) v1.0.3 — Our current node; Mustache templating + LISTEN/NOTIFY + typed inputs + i18n; basis for this feature research
- [PostgreSQL Error Codes](https://www.postgresql.org/docs/current/errcodes-appendix.html) — Classification of retriable errors: Class 40 (transaction rollback), Class 57 (operator intervention), Class 08 (connection exception)

---
*Feature research for: node-red-contrib-postgrestor (PostgreSQL Node-RED contrib node)*
*Researched: 2026-06-10*
