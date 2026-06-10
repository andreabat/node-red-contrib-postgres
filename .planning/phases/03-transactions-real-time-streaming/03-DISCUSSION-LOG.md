# Phase 3: Transactions, Real-time & Streaming - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-10
**Phase:** 03-transactions-real-time-streaming
**Areas discussed:** Transaction API shape, Streaming & COPY output model, Listener reconnection behavior, Retry strategy

---

## Transaction API Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Opt-in via config toggle | Config checkbox on PostgresNode. msg.payload as array triggers transaction mode. Backward compatible. | ✓ |
| Auto-detect from msg.payload type | No toggle — array = transaction, string = single query. Simpler but risky. | |
| Auto-detect with msg.transaction guard | Array + msg.transaction truthy. Extra safety layer. | |

**User's choice:** Opt-in via config toggle (Recommended)

---

| Option | Description | Selected |
|--------|-------------|----------|
| {query, params, output} objects | output:true means result goes to msg.payload. First win. | ✓ |
| {query, params, output: 'first'|'last'|'all'} objects | More output granularity. | |
| Simple {query, params} | Accumulate all results. | |

**User's choice:** {query, params, output} objects (Recommended)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Silent rollback + error on msg | Auto-ROLLBACK, structured error on msg.error, no partial results. | ✓ |
| Rollback + halt flow | Respects throwErrors toggle for downstream halt. | |
| Rollback with partial results | Emit partial results before rollback. | |

**User's choice:** Silent rollback + error on msg (Recommended)

---

## Streaming & COPY Output Model

| Option | Description | Selected |
|--------|-------------|----------|
| Both cursor streaming AND COPY | Full Phase 3 scope — cursor for large SELECTs, COPY for CSV import/export. | ✓ |
| Cursor streaming only | Stream large result sets only. | |
| COPY only | Bulk import/export only. | |

**User's choice:** Both cursor streaming AND COPY (Recommended)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Config toggle on PostgresNode | Per-node enable. Requires redeploy. | ✓ |
| Per-message toggle via msg.cursor | Dynamic switching per message. | |
| Separate node type | New PostgresCursorNode. | |

**User's choice:** Config toggle on PostgresNode (Recommended)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Batch array + complete signal | payload: [row1,...], batch: {index,rows,total}, complete:true final msg. | ✓ |
| Row-by-row with complete signal | One msg per row + complete flag. | |
| Single accumulated payload | Full array, one output message. | |

**User's choice:** Batch array on payload + complete signal (Recommended)

---

## Listener Reconnection Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Reconnect on error/end | Client error/end events trigger reconnect. Stops only on explicit close. | ✓ |
| Reconnect with max attempts | Same but cap at 10 attempts. | |
| Reconnect only on connection drops | Narrower trigger set. | |

**User's choice:** Reconnect on error/end (Recommended)

---

| Option | Description | Selected |
|--------|-------------|----------|
| 500ms base / 30s max / 2x / full jitter | Standard exponential backoff. | ✓ |
| 1s base / 60s max / 2x / full jitter | More conservative. | |
| 100ms base / 10s max / 2x / full jitter | Aggressive reconnect. | |

**User's choice:** 500ms base / 30s max / 2x / full jitter (Recommended)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Badge with state text | green/yellow/red with channel name and attempt counter. | ✓ |
| Badge + status messages emitted | Plus msg events for downstream flows. | |
| Simple green/red badge | Minimal indicator. | |

**User's choice:** Badge with state text (Recommended)

---

## Retry Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Queries + transactions | Retry on PostgresNode for both query and transaction modes. | ✓ |
| Queries + transactions + streaming + COPY | Maximum coverage. | |
| Queries only | Narrowest scope. | |

**User's choice:** Queries + transactions (Recommended)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Per-node toggle + config fields | retryEnabled toggle with maxRetries, baseDelay typedInput fields on PostgresNode. | ✓ |
| Config node level | Shared policy across all nodes on the same connection. | |
| Per-message msg.retry object | Dynamic per-message control. | |

**User's choice:** Per-node toggle + config fields (Recommended)

---

| Option | Description | Selected |
|--------|-------------|----------|
| 40P01 + 40001 + connection errors | Deadlock, serialization failure, connection resets/refusals. | ✓ |
| All connection + deadlock + serialization + shutdown codes | Broader coverage including 57Pxx admin shutdown codes. | |
| Configurable error code list | User provides comma-separated codes in config. | |

**User's choice:** 40P01 + 40001 + connection errors (Recommended)

---

| Option | Description | Selected |
|--------|-------------|----------|
| 100ms base / 5s max / 2x / 3 retries | Fast retry for queries. | ✓ |
| 500ms base / 30s max / 5 retries | Same profile as listener reconnect. | |
| 50ms base / 2s max / 2 retries | Minimal retry surface. | |

**User's choice:** 100ms base / 5s max / 2x / 3 retries (Recommended)

---

## the Agent's Discretion

The following areas were not discussed and are left to the agent's judgment:
- Default cursor batch size and whether it's configurable
- COPY data flow (CSV source/destination, delimiter options, how COPY mode is triggered)
- Channel sanitization approach (pg-format %I per REQUIREMENTS.md)
- NOTIFY JSON parsing behavior (on-by-default vs. opt-in, field naming)
- Retry config typedInput types for backoff parameters
- Transaction edge cases (no output:true queries, empty results)

## Deferred Ideas

None — discussion stayed within phase scope.
