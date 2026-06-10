# Stack Research

**Domain:** Node-RED PostgreSQL Contrib Node
**Researched:** 2026-06-10
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | >=18.0.0 (runtime) | Runtime engine | Project constraint; Node.js 24 LTS is current. Node-RED 5.x now requires >=22.9 — if you target NR 5+, bump this floor to >=22.9. |
| Node-RED | >=3.0.0 (peer) | Host platform | Project constraint; NR 5.0.0 just released (2026-06-09) with Node >=22.9 requirement. The >=3.0.0 floor keeps broad compatibility. |
| TypeScript | ^6.0.3 | Language | Latest stable. ts-jest 29 supports TS >=4.3 <7. typescript-eslint 8 supports TS >=4.8.4 <6.1.0. Full-migration goal (no `.js` + `.d.ts` hybrid). |
| pg | ^8.21.0 | PostgreSQL client | Canonical non-blocking PostgreSQL driver for Node.js. Actively maintained by original author (brianc). Pools, prepared statements, Submittable protocol for cursor/streaming. 402 snippets in Context7 docs. Upgrading from current project's ^8.16.2. |
| mustache | ^4.2.0 | SQL template engine | Logic-less templating for rendering `{{msg.payload}}` in SQL strings. Lightweight, stable, already in the project. No breaking changes needed. |

### Streaming & Advanced Features

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pg-cursor | ^2.20.0 | Server-side cursor for large result sets | Query returns >1000 rows; use cursor to fetch in batches, emitted as Node-RED messages. Requires pure JavaScript pg client (no native bindings). |
| pg-query-stream | ^4.15.0 | Node.js Readable stream over cursor | Same as cursor but exposes a `Readable` stream API. Use when you want to pipe results through transforms. Simpler API than raw pg-cursor. |
| pg-copy-streams | ^7.0.0 | High-performance CSV import/export via `COPY` | Bulk data ingestion or export. Essential for ETL use cases. Requires dedicated client from pool. |

> **Streaming recommendation:** Use `pg-query-stream` for most cases — it's simpler and provides a proper Node.js stream. Use raw `pg-cursor` only if you need fine-grained row-by-row control. Both require the pure JavaScript pg client and operate on a dedicated `client` (not `pool.query()` shorthand).

### Development Tools

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| TypeScript | ^6.0.3 | Type-safe development | `tsconfig.json` with `strict: true`, `target: "ES2022"`, `module: "commonjs"` (Node-RED loads CJS modules) |
| ESLint | ^9.39.4 | Code linting | Flat config format (`eslint.config.mjs`). Project spec mandates 9.x; ESLint 10 is available but 9.x is the safer choice for ecosystem plugin maturity. |
| typescript-eslint | ^8.61.0 | ESLint + TypeScript bridge | Provides `tseslint.config(...)` helper for type-safe flat config. Compatible with ESLint 8/9/10 and TS 4.8.4–6.0.x. |
| @typescript-eslint/eslint-plugin | auto-installed by typescript-eslint | TS-aware lint rules | Do NOT install separately — the `typescript-eslint` package re-exports everything needed for flat config. |
| prettier | ^3.8.4 | Code formatting | Pair with `eslint-config-prettier` to avoid rule conflicts. Format on save via editor or pre-commit hook. |
| eslint-config-prettier | ^10.x | Disable ESLint rules that conflict with Prettier | Last config in eslint.config.mjs to ensure Prettier wins formatting. |
| tsx | ^4.22.4 | Run TypeScript directly | Optional: useful for running build scripts or one-off TS scripts without compilation. Not used in production. |

### Testing Stack

| Tool | Version | Purpose | Why Recommended |
|------|---------|---------|-----------------|
| Jest | ^30.4.2 | Test runner and assertions | Project spec mandates Jest. Latest stable. Compatible with ts-jest 29.x (peer dep allows `^29.0.0 \|\| ^30.0.0`). |
| ts-jest | ^29.4.11 | TypeScript transformer for Jest | Verified compatible with Jest 30 and TypeScript 6. Uses `@jest/transform ^29 \|\| ^30`. Configure with `preset: 'ts-jest'` or `transform` in jest config. |
| @types/jest | ^30.0.0 | Jest type definitions | Provides `expect`, `describe`, `it`, `jest.Mock` types. Matches Jest 30 major. |
| node-red | ^5.0.0 (dev) | Node-RED runtime for testing | Required by `node-red-node-test-helper`. Install as dev dependency only — never in production dependencies. |
| node-red-node-test-helper | ^0.3.6 | Node-RED node test harness | Loads your nodes into an isolated Node-RED runtime, lets you inject messages and assert outputs. See `test/` examples in Context7 docs. |
| @types/node | ^18.0.0 | Node.js type definitions | Match the project's Node.js >=18.0.0 floor. Use ^20.0.0 if targeting Node-RED 5.x exclusively. |
| @types/pg | ^8.20.0 | pg type definitions | Covers Pool, Client, QueryResult, PoolConfig, etc. |
| @types/pg-cursor | ^2.7.2 | pg-cursor type definitions | Matches pg-cursor 2.x. |
| @types/mustache | ^4.2.6 | mustache type definitions | Matches mustache 4.2.x. |

> **pg-query-stream types caveat:** The official `@types/pg-query-stream` is at 3.4.0, but `pg-query-stream` is at 4.15.0. The type definitions may be incomplete. We'll add local type augmentation in `src/types/pg-query-stream.d.ts` for any missing APIs. Same applies to `@types/pg-copy-streams` (types at 1.2.5, library at 7.0.0).

### Node-RED Type Definitions

| Package | Version | Status | Notes |
|---------|---------|--------|-------|
| @types/node-red | ^1.3.5 | **Stale but usable** | Last published 2024-03, tested against Node-RED ^1.2.0. Covers `NodeAPI`, `Node`, `NodeDef`, `NodeMessage`, `NodeStatus`. The core custom-node API is stable — these types will work for the patterns we need. |
| @types/node-red__runtime | auto-installed | Runtime-specific types | Transitively installed by @types/node-red. |
| @types/node-red__registry | auto-installed | Node registry types | Transitively installed. |

> **Type safety strategy:** Because `@types/node-red` targets NR 1.x, we'll create a local `src/types/node-red-augment.d.ts` to patch any 5.x API gaps we hit. The core patterns (`RED.nodes.createNode`, `RED.nodes.registerType`, `node.on('input'...)`) are unchanged.

## Installation

```bash
# Core production dependencies
npm install pg@^8.21.0 mustache@^4.2.0

# Streaming / advanced features (install as needed)
npm install pg-query-stream@^4.15.0 pg-copy-streams@^7.0.0 pg-cursor@^2.20.0

# Development dependencies
npm install -D typescript@^6.0.3 \
  jest@^30.4.2 ts-jest@^29.4.11 @types/jest@^30.0.0 \
  eslint@^9.39.4 typescript-eslint@^8.61.0 \
  prettier@^3.8.4 eslint-config-prettier@^10.0.0 \
  node-red@^5.0.0 node-red-node-test-helper@^0.3.6 \
  @types/node@^18.0.0 @types/node-red@^1.3.5 \
  @types/pg@^8.20.0 @types/pg-cursor@^2.7.2 @types/mustache@^4.2.6 \
  tsx@^4.22.4
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| pg ^8.21.0 | postgres.js (porsager/postgres) ^3.5.0 | If you prefer tagged-template SQL (`sql\`SELECT...\``) and want a more modern API. But: no cursor/streaming support in the same ecosystem; pg is THE standard with 12M+ weekly downloads. |
| mustache ^4.2.0 | Handlebars ^4.7 | If you need helpers, conditionals, or loops in templates. Overkill for SQL templating — mustache's logic-less approach is exactly right for parameter interpolation. |
| Jest ^30.4.2 | Vitest ^3.x | If you want faster startup and native ESM/TS support without transformers. Project spec mandates Jest, and the Node-RED ecosystem uses Jest via node-red-node-test-helper. |
| ESLint ^9.39.4 | ESLint ^10.4.1 | ESLint 10 is the latest and has full flat config support. Sticking with 9.x matches project spec and ensures broader plugin compatibility. Upgrade path exists via `^9.0.0 \|\| ^10.0.0` in typescript-eslint peer deps. |
| @types/node-red ^1.3.5 | Manual `.d.ts` declarations | If the stale types cause friction, write local declarations for the NR API surface you use. But start with the published types — they cover the stable core. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| pg-native bindings | Requires compiling libpq; fails in many container environments. pg-cursor and pg-query-stream require pure JS client anyway. | `pg` pure JavaScript client (default). |
| pg-promise | Heavier abstraction with its own query formatting. Adds complexity and a competing API surface for no benefit over pg's native features. | `pg` directly — it has pool, transactions, prepared statements built-in. |
| node-postgres <8.16.0 | Missing security fixes and Submittable protocol improvements needed for cursor/streaming. | pg ^8.21.0 |
| ESLint 6.8.0 (current) | Deprecated, no flat config support, incompatible with typescript-eslint 8.x. | ESLint ^9.39.4 with flat config. |
| eslint-config-google | Third-party style guide, not maintained for ESLint 9 flat config. | typescript-eslint's built-in recommended configs + prettier for formatting. |
| babel-jest for TS transformation | Adds babel as a dependency chain. ts-jest is simpler and official for TypeScript. | ts-jest with `preset: 'ts-jest'`. |
| ci-publish (current) | Unmaintained? Dead CI pipeline to remove anyway. | GitHub Actions or manual `npm publish` when CI is re-added. |

## Stack Patterns by Variant

**If targeting Node-RED 5.x only:**
- Bump `@types/node` to ^22.0.0 and `node` engine to >=22.9
- Use `node-red@^5.0.0` as dev dependency
- Test against NR 5.0 runtime

**If keeping Node-RED >=3.0.0 compatibility:**
- Keep `@types/node ^18.0.0` (Node.js 18 LTS floor)
- Test against the oldest supported NR version (3.x)
- Use conditional feature detection for NR 4.x/5.x APIs if needed

**If streaming large datasets (>100K rows):**
- Use `pg-query-stream` with backpressure-aware message emission
- Consider batching rows into `msg.payload` chunks of ~1000 rows each
- Release the client on stream `end` or `error`

**If doing bulk imports (CSV → PostgreSQL):**
- Use `pg-copy-streams` with `COPY ... FROM STDIN CSV`
- Allocate a dedicated client from the pool (not `pool.query()`)
- Stream CSV through the copy stream to avoid memory issues

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| ts-jest ^29.4.11 | Jest ^29.0.0 \|\| ^30.0.0, TS >=4.3 <7 | Verified: Jest 30.4.2 + TypeScript 6.0.3 are within range. |
| typescript-eslint ^8.61.0 | ESLint ^8.57.0 \|\| ^9.0.0 \|\| ^10.0.0, TS >=4.8.4 <6.1.0 | TypeScript 6.0.3 is <6.1.0 — compatible. |
| pg-query-stream ^4.15.0 | pg >=2.8.1 | Requires pure JavaScript client; incompatible with pg-native bindings. |
| pg-cursor ^2.20.0 | pg (pure JS client only) | Same restriction: no native bindings. |
| @types/pg-query-stream ^3.4.0 | pg-query-stream ^3.x | **Mismatch.** Types are for 3.x, library is 4.x. Expect gaps. |
| @types/pg-copy-streams ^1.2.5 | pg-copy-streams ^1.x | **Mismatch.** Types are for 1.x, library is 7.x. Significant gaps expected. |

## Sources

- Context7 `/brianc/node-postgres` (402 snippets) — pg pooling, cursor, streaming API verified
- Context7 `/kulshekhar/ts-jest` (41 snippets) — Jest 30 compatibility, configuration patterns
- Context7 `/typescript-eslint/typescript-eslint` (1021 snippets) — flat config migration, ESLint 9/10 support
- Context7 `/node-red/node-red.github.io` (2336 snippets) — custom node creation, unit testing patterns
- Context7 `/node-red/node-red-node-test-helper` (98 snippets) — test harness API
- npm registry — version verification for all packages (2026-06-10); latest `pg@8.21.0`, `node-red@5.0.0`, `typescript@6.0.3`, `eslint@10.4.1`/`9.39.4`, `jest@30.4.2`, `ts-jest@29.4.11`, `typescript-eslint@8.61.0`
- Node-RED Release Plan (https://nodered.org/about/releases/) — NR 5.x release schedule, maintenance windows
- npm registry peer dependency verification — ts-jest `jest: ^29.0.0 || ^30.0.0`, typescript-eslint `eslint: ^8.57.0 || ^9.0.0 || ^10.0.0`, `typescript: >=4.8.4 <6.1.0`
- npm registry version trees — confirmed no ts-jest 30.x exists; latest is 29.4.11 with Jest 30 support

---

*Stack research for: node-red-contrib-postgrestor — PostgreSQL contrib node revival*
*Researched: 2026-06-10*
