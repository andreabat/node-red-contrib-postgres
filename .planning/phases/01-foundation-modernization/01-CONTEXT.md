# Phase 1: Foundation & Modernization - Context

**Gathered:** 2026-06-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 modernizes the entire codebase foundation — migrating a single-file JavaScript Node-RED contrib node (182 lines JS, 441 lines HTML) into a clean, type-safe TypeScript project with ESLint 9.x flat config, Jest + ts-jest test framework, and all 6 known bugs fixed. All existing functionality (pooled queries, Mustache templating, LISTEN/NOTIFY, typed inputs, i18n) must work identically post-migration with zero behavioral regressions.

**Scope:** TypeScript migration (TSC-01), ESLint 9.x upgrade (TSC-02), Jest test setup (TSC-03), remove dead azure-pipelines.yml (TSC-04), fix all 6 BUGs (BUG-01 through BUG-06).
**Out of scope:** Pool configuration UI, SSL config, named parameters, structured errors — those are Phase 2. Transactions, streaming, listener auto-reconnect — Phase 3.
</domain>

<decisions>
## Implementation Decisions

### Module Structure
- **D-01:** Split by node type — one TypeScript file per node under `src/nodes/`: PostgresDBNode.ts, PostgresNode.ts, PostgresListenerNode.ts. Shared utilities (getField, types, helpers) go in `src/lib/`.
- **D-02:** HTML templates also split — one `.html` per node type alongside the `.ts` files, organized under `src/nodes/`.
- **D-03:** Single barrel entry — `postgrestor.ts` at project root imports all split modules and registers with RED. `package.json` `node-red.nodes` stays a single entry pointing to the compiled entry file.

### the agent's Discretion
The following were presented as gray areas but not discussed — the agent has full flexibility to decide the best approach:

- **Test strategy & coverage** — Unit vs. integration tests, mocked pg vs. real PostgreSQL, how to mock the RED runtime, coverage targets, test file organization (colocated `__tests__/` vs. `tests/` directory).
- **Migration depth** — Strict line-for-line port preserving current code shape vs. opportunistic restructuring (e.g., refactoring `getField`'s NaN risk and JSON.parse crash during migration vs. deferring to a separate phase).
- **BUG-04 resolution** — Remove the dead `output` checkbox from the HTML template entirely, or wire it so `node.send(msg)` is conditional on the checkbox value.
- **TypeScript conventions** — Interface patterns for pg.Pool, Node-RED typings (`@types/node-red`?), enum usage for field types, strictness beyond `strict: true`.
- **ESLint 9.x flat config** — Rule selection, plugin versions, migration path from `.eslintrc.json`.
- **Jest + ts-jest config** — Transform patterns, module resolution, test environment.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning Documents
- `.planning/ROADMAP.md` — Phase 1 goal, success criteria, requirement mapping, MVP mode
- `.planning/REQUIREMENTS.md` — Full requirement definitions (TSC-01 through TSC-04, BUG-01 through BUG-06)
- `.planning/PROJECT.md` — Project constraints, key decisions, context, licensing (AGPL v3)

### Codebase Analysis
- `.planning/codebase/ARCHITECTURE.md` — Three node types, getField helper, data flow, error handling patterns, anti-patterns (dead myPool, missing listener teardown, console.log)
- `.planning/codebase/CONCERNS.md` — Zero tests, outdated ESLint, dead CI, commented-out HTML, dead output checkbox, locale swap bug, listener connection leak, security considerations
- `.planning/codebase/CONVENTIONS.md` — Naming (PascalCase constructors, camelCase utils), code style (2-space, single quotes, template literals, no trailing commas), HTML editor conventions, i18n patterns
- `.planning/codebase/STACK.md` — Dependencies (pg ^8.16.2, mustache ^4.2.0), runtime requirements (Node >= 18, Node-RED >= 3), no bundler/transpiler currently

### Source Files to Migrate
- `postgrestor.js` — Runtime node implementations (182 lines)
- `postgrestor.html` — Editor UI templates and registration (441 lines)
- `locales/en-US/postgrestor.json` — i18n strings (with BUG-06 locale swap)
- `locales/en-US/postgrestor.html` — Editor help panel
- `icons/` — Node palette icons (sql.png, listen.png, postgres.png)
- `package.json` — Dependencies, scripts, node-red registration
- `.eslintrc.json` — Legacy ESLint config to replace
- `azure-pipelines.yml` — Dead CI to remove
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **getField utility** (`postgrestor.js:6-24`) — Type coercion for Node-RED typed inputs (flow/global/env/num/bool/str). Convert to TypeScript with proper typing and input validation.
- **pg.Pool creation pattern** (`postgrestor.js:57-68`) — Connection pool with configurable settings. Type as `pg.Pool` with proper interface.
- **Mustache rendering** (`postgrestor.js:85`) — Legacy `mustache.render(query, { msg })`. Preserve behavior exactly.

### Established Patterns
- **Node-RED contrib node registration** — `module.exports = function(RED) { RED.nodes.registerType(...) }` — the split modules must preserve this pattern with a single barrel export.
- **TypedInput system** — Editor-side typedInput initialization (jQuery `.typedInput()`) and runtime-side `*FieldType` hidden inputs. Must remain functional.
- **i18n framework** — `data-i18n` attributes in HTML, `locales/en-US/postgrestor.json` for strings. Labels, placeholders, tabs all i18n'd.
- **Error handling** — Dual path (throwErrors true/false), try/catch/finally with client release, node.status for visual feedback.

### Integration Points
- **package.json entry** — `"node-red": { "nodes": { "postgres": "postgrestor.js" } }` → Update to compiled entry path.
- **Shared pg.Pool** — Config node creates pool; query/listener nodes reference via `RED.nodes.getNode(config.PostgresDBNode)`.
- **Node-RED runtime API** — `RED.nodes.registerType`, `RED.nodes.getNode`, `node.on('input')`, `node.on('close')`, `node.send()`, `node.log/warn/error`, `node.status()`.
</code_context>

<specifics>
## Specific Ideas

- Standard `src/nodes/` + `src/lib/` TypeScript project layout with `postgrestor.ts` barrel entry at root.
- HTML templates split per node type and co-located with the corresponding `.ts` file under `src/nodes/`.
</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-foundation-modernization*
*Context gathered: 2026-06-10*
