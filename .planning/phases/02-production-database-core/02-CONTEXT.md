# Phase 2: Production Database Core - Context

**Gathered:** 2026-06-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 upgrades the PostgreSQL config and query nodes from basic/functional to production-grade — adding configurable pool limits, full SSL with certificate management, `DATABASE_URL` alternative, named parameters, structured error objects, per-node query timeouts, CodeMirror SQL syntax highlighting, automatic type mapping, and named prepared statements with cache management. All builds on the TypeScript foundation from Phase 1.

**Scope:** Pool config UI (POOL-01), pool health badge (POOL-02), SSL with certs (POOL-03), DATABASE_URL (POOL-04), named parameters (QUERY-01), structured errors (QUERY-02), query timeout (QUERY-03), SQL editor (QUERY-04), prepared statements (REL-02), type mapping (REL-03).
**Out of scope:** Transactions (TXN-01/TXN-02), streaming/cursor (STREAM-01/STREAM-02), listener auto-reconnect (LISTEN-01), channel sanitization (LISTEN-02), NOTIFY JSON parsing (LISTEN-03), retry logic (REL-01) — these are Phase 3.
</domain>

<decisions>
## Implementation Decisions

### SSL Configuration UX
- **D-01:** Progressive disclosure — sslmode dropdown (disable/require/verify-ca/verify-full) always visible; CA cert, client cert, and client key fields appear only when sslmode is `verify-ca` or `verify-full`.
- **D-02:** Cert values (CA cert, client cert, client key) stored in Node-RED encrypted credential storage — same pattern as the existing user/password credentials. Not plain typed-input fields.
- **D-03:** Deprecate the existing boolean `ssl` toggle — existing `ssl: true` configs auto-migrate to `sslmode: require` on first upgrade. The deprecated field remains greyed out with a migration tooltip.

### Prepared Statements Lifecycle
- **D-04:** Auto-generated names from query hash (e.g. `ps_abc123`). No user-facing UI for naming — every unique query automatically becomes a prepared statement. Transparent to the user.
- **D-05:** Per-connection cache — each pool client tracks its own set of prepared statements. Statements survive across multiple queries on the same client connection.
- **D-06:** Redeploy clears cache — all prepared statements for a node are invalidated on node redeploy. Queries re-prepare on first execution post-deploy.

### the Agent's Discretion
The following gray areas were not discussed — the agent has full flexibility to decide the best approach:

- **DATABASE_URL integration (POOL-04)** — Override vs. fallback semantics vs. separate mode toggle. Whether URL query parameters (sslmode, pool params) are parsed.
- **Pool health display (POOL-02)** — Polling interval vs. on-demand refresh. Granularity of displayed data (active/idle/waiting/total vs. simple healthy/unhealthy).
- **Query timeout implementation (QUERY-03)** — PostgreSQL `statement_timeout` (per-connection) vs. Node.js AbortController/promise timeout approach.
- **Structured error format (QUERY-02)** — Beyond code/detail/constraint/table: include SQL state, severity, position, original query? Exact fields on `msg.error`.
- **Type mapping behavior (REL-03)** — On-by-default (breaking change) vs. opt-in per node. Whether jsonb auto-parse is a separate toggle from numeric/timestamp mapping.
- **Named parameters mapping (QUERY-01)** — How `msg.params = {name: 'value'}` maps to positional `$1,$2`. Interaction with Mustache templating. Handling of params not found in the query.
- **CodeMirror integration (QUERY-04)** — Which SQL mode/dialect, configuration (line numbers, word wrap, auto-completion), theme consistency with Node-RED editor.
- **Pool config UI layout (POOL-01)** — Exact field grouping, tabs vs. flat layout, typedInput defaults for pool parameters.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning & Requirements
- `.planning/ROADMAP.md` — Phase 2 goal, success criteria (5 items), MVP mode, requirement-to-phase mapping
- `.planning/REQUIREMENTS.md` — Full definitions for POOL-01 through POOL-04, QUERY-01 through QUERY-04, REL-02, REL-03
- `.planning/PROJECT.md` — Project constraints (Node >= 18, Node-RED >= 3, TypeScript strict, AGPL v3), key decisions

### Codebase Analysis
- `.planning/codebase/ARCHITECTURE.md` — Three node types, pg.Pool lifecycle, getField helper, query execution flow, error handling (throwErrors dual path), listener pattern
- `.planning/codebase/STACK.md` — Dependencies (pg ^8.16.2, mustache ^4.2.0), Node-RED runtime contract, typedInput system
- `.planning/codebase/INTEGRATIONS.md` — pg.Pool connection params, credential storage patterns, SSL boolean toggle (current), connection defaults

### Prior Phase
- `.planning/phases/01-foundation-modernization/01-CONTEXT.md` — Module structure (src/nodes/, src/lib/, barrel entry), HTML split, TypeScript conventions, test strategy, established patterns (getField, pg.Pool, Mustache, i18n, typedInput)

### Source Files (post-Phase-1)
- `src/nodes/PostgresDBNode.ts` — Config node: creates pg.Pool, manages credentials, pool settings
- `src/nodes/PostgresNode.ts` — Query node: Mustache rendering, parameterized queries, error handling
- `src/lib/getField.ts` — Typed input resolution utility (flow/global/env/num/bool/str)
- `src/nodes/PostgresDBNode.html` — Config node editor template (SSL, pool settings, credentials)
- `src/nodes/PostgresNode.html` — Query node editor template (SQL editor, named params, type mapping toggles)
- `locales/en-US/postgrestor.json` — i18n strings
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **getField utility** — Type coercion for Node-RED typed inputs (flow/global/env/num/bool/str). Already migrated to TypeScript in Phase 1. Used to resolve pool config values and SSL settings from editor.
- **pg.Pool creation pattern** — Config node (`PostgresDBNode`) creates pool with `{ user, password, host, port, database, ssl, max, min, idleTimeoutMillis, connectionTimeoutMillis }`. Extend with sslmode, cert values, and DATABASE_URL.
- **Mustache templating** — `mustache.render(query, { msg })` for injecting msg properties into SQL. Must coexist with named parameter binding.
- **Node-RED credential storage** — `node.credentials.user`, `node.credentials.password` already registered. Extend with sslCa, sslCert, sslKey credential types.

### Established Patterns
- **TypedInput system** — Editor-side `typedInput()` jQuery plugin for config fields, runtime-side `*FieldType` hidden inputs resolved via getField. Pool params (max, idleTimeout, etc.) should follow this pattern.
- **i18n framework** — `data-i18n` attributes in HTML, locale strings in `locales/en-US/postgrestor.json`. All new editor fields must be i18n'd.
- **Error handling** — Dual path (throwErrors true/false), try/catch/finally with client release, node.status for visual feedback. Structured error (QUERY-02) must preserve both paths.
- **Config node pattern** — `RED.nodes.getNode(config.PostgresDBNode)` to access pool from query/listener nodes. Pool health (POOL-02) needs the same reference.

### Integration Points
- **PostgresDBNode config panel** — Add: pool settings (max, idleTimeout, connectionTimeout, statement_timeout), SSL (sslmode dropdown + cert credentials), DATABASE_URL field, pool health badge
- **PostgresNode config panel** — Add: SQL editor (CodeMirror), named params toggle, query timeout, type mapping toggles (numeric→number, timestamptz→ISO, jsonb→object), prepared statements (auto)
- **pg.Pool constructor** — Must accept new sslmode (translated to pg SSL config) and DATABASE_URL (parsed, merged with individual fields)
- **Query execution** — Extend `client.query(query, params)` to support: named param mapping, query timeout, prepared statement cache, type mapping post-processing
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

*Phase: 02-production-database-core*
*Context gathered: 2026-06-10*
