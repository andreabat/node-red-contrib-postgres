# Walking Skeleton — node-red-contrib-postgrestor Revival

**Phase:** 01
**Generated:** 2026-06-10

## Capability Proven End-to-End

A developer can configure a PostgreSQL connection (PostgresDBNode), execute parameterized SQL queries with Mustache templating (PostgresNode), and receive real-time LISTEN/NOTIFY push messages (PostgresListenerNode) — all running as compiled TypeScript, linted by ESLint 9.x, and verified by a Jest test suite.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Language | TypeScript 5.7 with `strict:true`, `target:ES2022`, `module:commonjs` | Full type safety; CommonJS for Node-RED compatibility (Node-RED contrib nodes use `module.exports`) |
| Framework | Node-RED contrib node pattern (not standalone app) | This is a plugin for the Node-RED runtime, not a standalone server. Barrel entry `postgrestor.ts` exports `function(RED)` closure. |
| Data layer | `pg` 8.x (node-postgres) via `pg.Pool` | Existing dependency — connection pooling with configurable min/max/idleTimeout/connectionTimeout. Pool owned by PostgresDBNode config node, shared via `RED.nodes.getNode()`. |
| Auth | Node-RED credential storage (`credentials: { user, password }`) | User/password stored securely by Node-RED, not in plain config. Credential schema registered with node type. |
| Module structure | `src/nodes/` + `src/lib/` with `postgrestor.ts` barrel at root | Split by node type (D-01): PostgresDBNode, PostgresNode, PostgresListenerNode each in own `.ts` + `.html` file. Shared utilities (getField, types) in `src/lib/`. Single barrel entry (D-03). |
| Linting | ESLint 9.x flat config with typescript-eslint 8.x | Replaces outdated ESLint 6.8.0. Preserved legacy rules: comma-dangle never, new-cap warn, require-jsdoc off. |
| Testing | Jest 29 + ts-jest + node-red-node-test-helper | Colocated `__tests__/` directories. pg.Pool mocked; Mustache and getField tested directly. Tests cover success, error (throwErrors true/false), client release, close handlers. |
| Deployment target | npm package (`@topcs/node-red-contrib-postgres`) installed in Node-RED | Dev workflow: `npm run build` → `npm link` in Node-RED `.node-red/` directory. No separate dev server — tested in-context with Node-RED runtime. |
| Directory layout | Flat src/ with feature-folders per node type | `src/nodes/PostgresDBNode.ts` + `.html`, `PostgresNode.ts` + `.html`, `PostgresListenerNode.ts` + `.html`. Shared: `src/lib/types.ts`, `src/lib/getField.ts`. Tests colocated in `src/nodes/__tests__/` and `src/lib/__tests__/`. Assets: `icons/`, `locales/` preserved at root. |

## Stack Touched in Phase 1

- [x] Project scaffold — `tsconfig.json`, `eslint.config.mjs`, `jest.config.ts`, `package.json` updated
- [x] Routing — Barrel entry `postgrestor.ts` registers all three node types with `RED.nodes.registerType()`
- [x] Database — `pg.Pool` created in PostgresDBNode, consumed by PostgresNode (read/write queries) and PostgresListenerNode (LISTEN/NOTIFY)
- [x] UI — Three HTML editor templates (PostgresDBNode with 3-tab config, PostgresNode with SQL editor, PostgresListenerNode with channel input)
- [x] Deployment — `npm run build` compiles to `dist/`; `npm link` installs into Node-RED; `package.json` `node-red.nodes` field resolves entry

## Out of Scope (Deferred to Later Slices)

- Pool configuration UI (max/idleTimeout/connectionTimeout as typed inputs) — Phase 2
- SSL/smode dropdown with CA cert/client cert/key — Phase 2
- `DATABASE_URL` connection string alternative — Phase 2
- Named parameters (`msg.params` as `{name: value}`) — Phase 2
- Structured `msg.error` with `code`, `detail`, `constraint`, `table` — Phase 2
- Per-node query timeout — Phase 2
- CodeMirror SQL syntax highlighting — Phase 2
- Automatic type mapping (`numeric`→number, `timestamptz`→ISO, `jsonb` parse) — Phase 2
- Pool health status badge (active/idle/waiting) — Phase 2
- Prepared statements with cache management — Phase 2
- Multi-step transactions (BEGIN/COMMIT/ROLLBACK) — Phase 3
- LISTEN/NOTIFY auto-reconnect with jittered backoff — Phase 3
- Channel name sanitization (pg-format identifier escaping) — Phase 3
- NOTIFY payload auto-JSON-parse — Phase 3
- Cursor mode for large result sets — Phase 3
- COPY support (CSV import/export) — Phase 3
- Retry with exponential backoff — Phase 3
- GitHub Actions CI — deferred indefinitely (add after v1 stabilization)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- **Phase 2:** Production Database Core — pooled connections with health status, SSL config, named parameters, structured errors, query timeout, CodeMirror editor, type mapping, prepared statements
- **Phase 3:** Transactions, Real-time & Streaming — atomic multi-step transactions, LISTEN/NOTIFY auto-reconnect, cursor streaming, COPY, retry with backoff