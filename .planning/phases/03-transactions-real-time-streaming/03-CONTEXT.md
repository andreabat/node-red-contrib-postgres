# Phase 3: Transactions, Real-time & Streaming - Context

**Gathered:** 2026-06-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 adds four advanced PostgreSQL capabilities to the existing PostgresNode and PostgresListenerNode — atomic multi-step transactions via config toggle on PostgresNode, auto-reconnecting LISTEN/NOTIFY with exponential backoff on PostgresListenerNode, cursor-based streaming with batched row emission, and COPY-based CSV import/export — all backed by self-healing retry on transient errors. Everything extends the Phase 2 foundation and requires no new runtime dependencies (pg-cursor and pg-copy-streams ship with the pg package).

**Scope:** TXN-01, TXN-02 (transactions), LISTEN-01, LISTEN-02, LISTEN-03 (listener reconnect, sanitization, JSON parsing), STREAM-01, STREAM-02 (cursor streaming, COPY), REL-01 (retry).
**Out of scope:** SAVEPOINT support, dedicated transaction node type, separate listener pool, pg-query-stream (use pg-cursor).
</domain>

<decisions>
## Implementation Decisions

### Transaction API
- **D-01:** Transaction mode is opt-in via a config toggle on PostgresNode (`transactionMode`). When ON and `msg.payload` is an array, the node executes all queries atomically within a single client connection. When OFF, `msg.payload` is treated as a single query string (backward compatible).
- **D-02:** Each entry in the transaction array is `{query: string, params: object, output: boolean}`. `query` supports Mustache templating and named parameter binding (same as single-query mode). `params` is optional — uses named parameter binding when provided. `output: true` means that query's result rows go to `msg.payload`. The first query with `output: true` wins (subsequent `output: true` queries are ignored for output purposes).
- **D-03:** On any query failure: auto-ROLLBACK, `msg.error` gets the structured error object (same format as Phase 2 QUERY-02), `msg.payload` stays empty (no partial results), node status shows "Query execution failed". Client is released in `finally` block regardless.

### Streaming & COPY
- **D-04:** Both cursor streaming and COPY are implemented. Cursor mode for large SELECT result sets; COPY for bulk CSV import (COPY FROM) and export (COPY TO). Both operate on PostgresNode — no new node type.
- **D-05:** Cursor mode is a per-node config toggle (`cursorMode`). When enabled and a SELECT query is detected, the node uses a PostgreSQL cursor (`DECLARE`/`FETCH`) to stream results in batches. Non-SELECT queries ignore the toggle.
- **D-06:** Cursor output emits each batch as a sequential message: `{payload: [row1, row2, ...], batch: {index: 0, rows: 100, total: N}}`. The final batch is `{payload: [], complete: true, total: N}`. Total row count is included on the first batch when available.

### Listener Reconnection
- **D-07:** Listener auto-reconnects on client `error` and `end` events. Reconnection stops only on explicit node `close` (redeploy or node removal) — never gives up.
- **D-08:** Exponential backoff: base 500ms, max 30s, multiplier 2x, with full jitter (`delay = min(30000, 500 * 2^attempt) * Math.random()`). Each attempt updates the node badge.
- **D-09:** Node badge shows connection state: green "listening on {channel}" / yellow "reconnecting (attempt N)" / red "disconnected". State is visible at a glance in the flow editor.

### Retry Strategy
- **D-10:** Retry applies to PostgresNode queries and transactions. Not applied to COPY operations or cursor streaming (these have their own error handling).
- **D-11:** Retry is a per-node toggle (`retryEnabled`) with configurable fields: max retries (default 3), base delay in ms (default 100).
- **D-12:** Transient errors retried: deadlock (40P01), serialization failure (40001), and connection errors (connection reset, refused, terminated). All other errors propagate immediately.
- **D-13:** Retry backoff: base 100ms, max 5s, multiplier 2x, full jitter. After max retries exhausted, error propagates as if retry was disabled.

### the Agent's Discretion
The following gray areas were not discussed — the agent has full flexibility to decide the best approach:

- **Batch size default** — Default cursor batch size (e.g., 100 rows). Whether batch size is a configurable typedInput field or a fixed constant.
- **COPY data flow** — How CSV data enters (msg.payload as string vs. file path vs. buffer) and exits (msg.payload vs. separate file). CSV delimiter/header options (config fields or message properties).
- **Channel sanitization (LISTEN-02)** — Use `pg-format` `%I` for identifier escaping as specified in REQUIREMENTS.md out-of-scope notes. Integration approach (bundled vs. new dependency).
- **NOTIFY JSON parsing (LISTEN-03)** — On-by-default or opt-in toggle. Whether parsed JSON replaces `payload` or goes to a separate `parsedPayload` field. Fallback behavior on invalid JSON.
- **COPY mode trigger** — How COPY vs. cursor is selected when both are available. Separate toggle or auto-detection from SQL content.
- **Retry config fields** — Which typedInput types (num/str/flow/global/env) for max retries and base delay. Whether backoff parameters beyond base delay are configurable or fixed constants.
- **Transaction output semantics** — Edge case: what happens when no query has `output: true` (empty payload? last query result?). Edge case: what about queries that return no rows.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning & Requirements
- `.planning/ROADMAP.md` — Phase 3 goal, success criteria (5 items), MVP mode, requirement-to-phase mapping
- `.planning/REQUIREMENTS.md` — Full definitions for TXN-01/TXN-02, LISTEN-01/LISTEN-02/LISTEN-03, STREAM-01/STREAM-02, REL-01
- `.planning/PROJECT.md` — Project constraints (Node >= 18, Node-RED >= 3, TypeScript strict, AGPL v3), key decisions

### Codebase Analysis
- `.planning/codebase/ARCHITECTURE.md` — Three node types, pg.Pool lifecycle, query execution flow, error handling, listener pattern with BUG-02 fix
- `.planning/codebase/STACK.md` — Dependencies (pg ^8.16.2 includes pg-cursor and pg-copy-streams), Node-RED runtime contract
- `.planning/codebase/INTEGRATIONS.md` — pg.Pool connection params, LISTEN/NOTIFY pattern, credential storage
- `.planning/codebase/CONCERNS.md` — Listener fragility (no reconnection), missing query timeout (already fixed in Phase 2), SQL injection risk, pool exhaustion risk

### Prior Phases
- `.planning/phases/02-production-database-core/02-CONTEXT.md` — Phase 2 decisions (SSH UX, prepared statements lifecycle, scope boundary excluding Phase 3 features)
- `.planning/phases/01-foundation-modernization/01-CONTEXT.md` — Module structure, HTML split, TypeScript conventions, test strategy

### Source Files (post-Phase-2)
- `src/nodes/PostgresNode.ts` — Query node: Mustache rendering, named parameter binding, statement_timeout, prepared statements (hashQuery), type mapping (buildQueryTypes), error formatting (formatError)
- `src/nodes/PostgresListenerNode.ts` — Listener node: pg.Pool client acquisition, LISTEN/NOTIFY handling, close handler with UNLISTEN+release (BUG-02 fix). No reconnection logic.
- `src/nodes/PostgresDBNode.ts` — Config node: pg.Pool creation, credential management, pool config, DATABASE_URL integration
- `src/lib/params.ts` — Named parameter binding (bindNamedParams)
- `src/lib/errorFormatter.ts` — Structured error extraction from pg errors (formatError)
- `src/lib/types.ts` — TypeScript types for all node configs
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **pg.Pool connection management** — PostgresDBNode creates pool; PostgresNode and PostgresListenerNode acquire clients via `node.config.pgPool.connect()`. Transaction mode follows the same pattern — acquire one client, run all queries on it, release in finally.
- **Named parameter binding** — `bindNamedParams(query, params)` in `src/lib/params.ts` already maps objects to `$1,$2,...` positional params. Works for each transaction query entry.
- **Structured error formatting** — `formatError()` in `src/lib/errorFormatter.ts` extracts code/detail/constraint/table from pg errors. Used on transaction rollback failures and retry-exhausted errors.
- **Prepared statements** — `hashQuery(text)` auto-generates `ps_` prefixed names. Transactions can use prepared statements per-query (each query in the array is individually hashed).
- **pg-cursor** — Ships with `pg` ^8.x as `pg-cursor`. Provides `Cursor` class with `read(rows, callback)` for batched fetching. Used for STREAM-01 cursor streaming.
- **pg-copy-streams** — Ships with `pg` ^8.x as `pg-copy-streams`. Provides `from()` and `to()` stream factories for COPY FROM/TO. Used for STREAM-02 CSV import/export.

### Established Patterns
- **Config toggle pattern** — Phase 2 introduced `useNamedParams`, `parseJsonb`, `mapTypes` toggles on PostgresNode. Phase 3 adds `transactionMode`, `cursorMode`, `retryEnabled` using the same pattern.
- **TypedInput system** — Config fields use `<input type="hidden" id="node-input-{field}FieldType">` for runtime type resolution via getField. Retry config fields (max retries, base delay) follow this pattern.
- **Error handling** — Dual path (throwErrors true/false), try/catch/finally with client release, node.status for visual feedback. Transaction mode must guarantee client release in all paths.
- **Node badge pattern** — Phase 2 added pool health badge on PostgresDBNode. Listener reconnection badge follows the same `node.status({fill, shape, text})` pattern.
- **i18n framework** — `data-i18n` attributes in HTML, locale strings in `locales/en-US/postgrestor.json`. All new editor fields must be i18n'd.

### Integration Points
- **PostgresNode input handler** (`src/nodes/PostgresNode.ts:26`) — Current single-query flow. Transaction mode wraps this in BEGIN/COMMIT/ROLLBACK when config toggle is on and msg.payload is an array. Retry wraps the query execution in a retry loop.
- **PostgresNode config panel** (`src/nodes/PostgresNode.html`) — Add toggles: transaction mode, cursor mode, retry enabled, cursor batch size, max retries, base delay.
- **PostgresListenerNode constructor** (`src/nodes/PostgresListenerNode.ts:5`) — Current setup: connect → LISTEN → handle notifications. Reconnection wraps the connect+LISTEN sequence in a retry loop triggered by client error/end events.
- **PostgresDBNode config panel** (`src/nodes/PostgresDBNode.html`) — No changes needed. Transaction and cursor use the existing pool. Retry is per-query-node.
</code_context>

<specifics>
## Specific Ideas

No specific references or examples provided during discussion — open to standard approaches.
</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.
</deferred>

---

*Phase: 03-transactions-real-time-streaming*
*Context gathered: 2026-06-10*
