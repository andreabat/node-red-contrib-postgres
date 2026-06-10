<!-- refreshed: 2026-06-10 -->
# Architecture

**Analysis Date:** 2026-06-10

## System Overview

```text
┌──────────────────────────────────────────────────────────────────┐
│                     Node-RED Runtime (RED)                        │
│  Provides: createNode, registerType, getNode, context API         │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────────────┐  ┌────────────────┐  ┌───────────────┐ │
│  │   PostgresDBNode     │  │  PostgresNode  │  │PostgresListen-│ │
│  │  (config node)       │  │  (query node)  │  │erNode (push)  │ │
│  │  `postgrestor.js:26` │  │ `postgrestor.j │  │`postgrestor.j │ │
│  │                      │  │  s:79`         │  │s:141`         │ │
│  │  - Manages pg.Pool   │  │  - Executes    │  │  - LISTEN/    │ │
│  │  - Credential store  │  │    SQL queries │  │    NOTIFY     │ │
│  │  - Connection params │  │  - Mustache    │  │  - Real-time  │ │
│  │  - Pool settings     │  │    templating  │  │    push msgs  │ │
│  └──────────┬───────────┘  └───────┬────────┘  └───────┬───────┘ │
│             │                      │                    │          │
│             │   RED.nodes.getNode  │                    │          │
│             ▼                      ▼                    ▼          │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    pg.Pool (from `pg` npm)                   │ │
│  │  Connection pooling, query execution, NOTIFY subscription   │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                            │
│  Stores credentials, handles queries, emits NOTIFY events        │
└──────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| `PostgresDBNode` | Configuration node — creates and owns `pg.Pool` with connection/pool settings and credentials. Shared by query/listener nodes. | `postgrestor.js:26-69` |
| `PostgresNode` | Flow node — accepts `msg` input, renders SQL via Mustache, executes query via pool, returns results on `msg.payload`. Supports parameterized queries via `msg.params`. | `postgrestor.js:79-137` |
| `PostgresListenerNode` | Flow node (0 inputs) — subscribes to a PostgreSQL channel via `LISTEN`, forwards `NOTIFY` payloads as `msg` outputs. Always-on, event-driven. | `postgrestor.js:141-181` |
| `getField()` | Utility — resolves a typed input value from context (flow/global) or casts to num/bool. Used to dereference config node fields. | `postgrestor.js:6-24` |

## Pattern Overview

**Overall:** Node-RED custom node plugin — flat monolithic pattern

**Key Characteristics:**
- Single JavaScript file registers all runtime node types with the RED object
- Single HTML file defines all editor-side node type templates and registration
- Configuration node (`PostgresDBNode`) acts as shared connection-pool resource
- Flow nodes (`PostgresNode`, `PostgresListenerNode`) reference the config node via `RED.nodes.getNode()`
- Uses Node-RED's typedInput system to allow config values from flow/global context or env vars
- No module splitting, no internal dependency graph beyond `pg` and `mustache` npm packages

## Layers

**Runtime layer:**
- Purpose: Execute queries and manage DB connections inside the Node-RED server process
- Location: `postgrestor.js`
- Contains: All three node type constructors, `getField()` helper
- Depends on: `pg` (Pool, Client), `mustache` (template rendering), Node-RED RED API
- Used by: Node-RED runtime — invoked when flows containing these nodes are deployed

**Editor layer:**
- Purpose: Define the visual configuration UI shown in the Node-RED editor
- Location: `postgrestor.html`
- Contains: Three `<script type="text/x-red" data-template-name="...">` blocks (templates) and three `<script type="text/javascript">` blocks (editor registration)
- Depends on: Node-RED editor API (`RED.nodes.registerType`, `RED.tabs`, `RED.editor`, jQuery)
- Used by: Node-RED browser editor — loaded when user opens the flow editor

**Localization layer:**
- Purpose: i18n strings and editor help text
- Location: `locales/en-US/`
- Contains: `postgrestor.json` (label/placeholder/tab/title strings), `postgrestor.html` (help panel content)
- Depends on: Node-RED i18n framework (`data-i18n` attributes)
- Used by: Node-RED editor — looked up by locale when rendering UI

**Asset layer:**
- Purpose: Node icons displayed in the Node-RED palette
- Location: `icons/`
- Contains: `sql.png` (PostgresNode), `listen.png` (PostgresListenerNode), `postgres.png` (PostgresDBNode)
- Used by: Node-RED editor — referenced in node registration via `icon` property

## Data Flow

### Primary Request Path (PostgresNode — query execution)

1. Node-RED runtime delivers a `msg` to `PostgresNode` via the `input` event handler (`postgrestor.js:84`)
2. SQL query template is rendered with Mustache using `{ msg }` context (`postgrestor.js:85`)
3. `asyncQuery()` async function acquires a client from the shared `pg.Pool` (`postgrestor.js:91`)
4. `client.query(query, msg.params || [])` executes the SQL with optional parameterized values (`postgrestor.js:93`)
5. Result is assigned to `msg.payload`; node status set to green with row count (`postgrestor.js:93-98`)
6. On error: node status set to red; if `throwErrors` is set, `node.error()` is called with the msg (halting flow); otherwise error string is placed on `msg.error` and node continues (`postgrestor.js:99-113`)
7. Client is released back to pool in `finally` block, then `node.send(msg)` fires (`postgrestor.js:114-124`)

### Real-time Push Path (PostgresListenerNode — NOTIFY event)

1. On deployment, `PostgresListenerNode` creates a persistent client from the pool (`postgrestor.js:160`)
2. Client executes `LISTEN <channel>` on the database (`postgrestor.js:171`)
3. Client registers a `notification` event handler (`postgrestor.js:161`)
4. When PostgreSQL emits a `NOTIFY` on the channel, the handler fires and `node.send({ channel, payload })` pushes a new `msg` out (`postgrestor.js:164-165`)
5. This node has `inputs: 0` — it only produces output messages, never receives them

### Configuration Resolution Path (getField helper)

1. For each config field, a `*FieldType` property stores the typedInput type (e.g., `"flow"`, `"global"`, `"num"`, `"bool"`, `"str"`)
2. At pool creation time, `getField(node, kind, value)` resolves the runtime value (`postgrestor.js:57-68`)
3. Switch on `kind`: `"flow"` reads from flow context, `"global"` reads from global context, `"num"` parses int, `"bool"` parses JSON boolean, default returns string as-is (`postgrestor.js:7-23`)

## Key Abstractions

**pg.Pool (connection pool):**
- Purpose: Manages a set of reusable PostgreSQL client connections. Owned by `PostgresDBNode`, referenced by flow nodes.
- Created at: `postgrestor.js:57-68` with user, password, host, port, database, ssl, max, min, idleTimeoutMillis, connectionTimeoutMillis
- Pattern: Singleton-per-config-node — shared via `RED.nodes.getNode()` cross-reference

**Node-RED config node pattern:**
- Purpose: Separate configuration from execution. `PostgresDBNode` (category: "config") stores credentials and pool settings. Flow nodes reference it by ID.
- Registration: `postgrestor.js:71` via `RED.nodes.registerType('PostgresDBNode', PostgresDBNode, { credentials })`
- Lookup: `postgrestor.js:83` / `postgrestor.js:144` via `RED.nodes.getNode(config.PostgresDBNode)`

**Mustache template rendering:**
- Purpose: Inject `msg` fields into SQL query strings before execution. Supports `{{ msg.fieldName }}` syntax.
- Location: `postgrestor.js:85` — `mustache.render(config.query, { msg })`

**Parameterized query execution:**
- Purpose: Pass values separately from the SQL string (via `$1`, `$2`, etc.) to prevent SQL injection
- Location: `postgrestor.js:93` — `client.query(query, msg.params || [])`

## Entry Points

**Runtime entry:**
- Location: `postgrestor.js:1`
- Triggers: Node-RED loads the plugin module via `require()` as specified in `package.json` → `"node-red": { "nodes": { "postgres": "postgrestor.js" } }`
- Responsibilities: Export a function that registers all three node types with the RED runtime object

**Editor entry:**
- Location: `postgrestor.html`
- Triggers: Node-RED editor loads the HTML file when user opens the flow editor
- Responsibilities: Define visual templates and editor-side registration for all node types (including typedInput setup, tabbed config UI, ACE SQL editor)

**Deployment (per-node initialization):**
- `PostgresDBNode(n)` — Called when a config node is deployed; creates the pg.Pool
- `PostgresNode(config)` — Called when a query node is deployed; wires input handler and close handler
- `PostgresListenerNode(config)` — Called when a listener node is deployed; connects and starts LISTEN

## Architectural Constraints

- **Threading:** Node.js single-threaded event loop. All DB operations are async via `pg`'s promise/async API. No worker threads.
- **Global state:** `myPool` variable declared at module scope (`postgrestor.js:77`) but never assigned (always `false`). A dead-code vestige. The real pool is scoped to each `PostgresDBNode` instance as `this.pgPool`.
- **Circular imports:** None — single-file module with no internal require() to itself.
- **Connection lifecycle:** No explicit pool draining on shutdown. The `PostgresNode` has a `close` handler that only clears status (`postgrestor.js:132-134`). `PostgresListenerNode` has no close handler — the listener client is never explicitly released, relying on Node.js process teardown.

## Anti-Patterns

### Dead Global Variable

**What happens:** `let myPool = false;` is declared at line 77 of `postgrestor.js` but never written to or read in any code path. It is a leftover from a previous implementation approach.
**Why it's wrong:** Confuses readers about whether there's module-level pool state. Could lead a maintainer to inadvertently depend on it.
**Do this instead:** Remove the `myPool` variable entirely. The pool is correctly managed per `PostgresDBNode` instance via `this.pgPool` and accessed via `RED.nodes.getNode()`.

### Missing Listener Teardown

**What happens:** `PostgresListenerNode` acquires a persistent client from the pool on deployment but has no `close` event handler to release it. The connection is held until the Node.js process exits.
**Why it's wrong:** If the flow is redeployed or the node is removed without a full restart, the client connection leaks. The pool may exhaust available connections over repeated redeployments.
**Do this instead:** Store the client reference on the node object and implement an `on('close', ...)` handler that calls `client.release()` (similar to how `PostgresNode` releases clients after each query).

### Console.log Debug Statements

**What happens:** `console.log` calls exist at `postgrestor.js:55`, `90`, `92`, `118` for connection/config debugging. These bypass Node-RED's logging infrastructure.
**Why it's wrong:** They pollute the stdout of the Node-RED process and cannot be filtered or silenced via Node-RED's log level settings. They will appear even in production.
**Do this instead:** Use `node.log()` or `node.warn()` for all logging, which integrates with Node-RED's logging framework and respects log levels.

## Error Handling

**Strategy:** Best-effort with graceful degradation — errors are caught, logged, and optionally propagated.

**Patterns:**
- `try/catch` around async query execution with `finally` for client release (`postgrestor.js:89-125`)
- Dual error mode on `PostgresNode`: when `config.throwErrors` is true, `node.error(err, msg)` halts the flow and sets `msg = null`; when false, `node.error(err)` logs only and attaches `msg.error` so downstream nodes can handle it (`postgrestor.js:107-113`)
- `.catch()` on the outer async call for any errors escaping the try/catch (`postgrestor.js:127-129`)
- `PostgresListenerNode` handles channel-not-configured with red status return (`postgrestor.js:145-152`), and has individual `.catch()` handlers for connect errors and LISTEN setup errors
- `getField()` has no error handling — invalid field types fall through to the default branch returning the raw value, which may produce unexpected pool config values

## Cross-Cutting Concerns

**Logging:** Mixed approach — uses `node.log()` for some messages, `console.log()` for debug output, `node.error()` for errors. No structured logging format.
**Validation:** Minimal — `PostgresListenerNode` validates that `config.channel` is non-empty (`postgrestor.js:145`). No validation of pool parameters, connection strings, or query syntax at the node level.
**Authentication:** Credentials (user/password) stored in Node-RED's encrypted credential store via registered credential types (`postgrestor.js:72-75`). The HTML editor registration also registers `credentials: { user: { type: 'text' }, password: { type: 'password' } }` at `postgrestor.html:287-290`.

---

*Architecture analysis: 2026-06-10*
