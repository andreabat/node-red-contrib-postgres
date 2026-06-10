# Coding Conventions

**Analysis Date:** 2026-06-10

## Naming Patterns

**Files:**
- Single-file backend module: `postgrestor.js`
- Node-RED editor template: `postgrestor.html`
- Locale files follow `<locale>/postgrestor.json` pattern (e.g., `locales/en-US/postgrestor.json`)
- Help text in locale directory: `locales/en-US/postgrestor.html`

**Functions:**
- Constructor functions (Node-RED node types): PascalCase — `PostgresDBNode`, `PostgresNode`, `PostgresListenerNode`
- Utility functions: camelCase — `getField`
- Node-RED node constructors receive a single `config` parameter (or `n` for config nodes): `function PostgresNode(config)`
- All functions defined inside `module.exports = function(RED) {}` closure for access to the `RED` runtime object

**Variables:**
- Node reference: `const node = this` (standard Node-RED pattern to capture `this` in constructor)
- Configuration parameters: copied from config object to node via `node.<property> = n.<property>`
- Database pool: `node.pgPool` on config node, accessed as `node.config.pgPool` on query/listener nodes
- Error messages: camelCase — `errorMessage`, `releaseError`, `notificationError`, `connectionError`
- Async IIFE in `PostgresNode`: `const asyncQuery = async () => { ... }`

**Types:**
- Not applicable — this is plain JavaScript (Node.js ≥ 18), no TypeScript

## Code Style

**Formatting:**
- ESLint with `eslint-config-google` (Google JavaScript Style Guide) — configured in `.eslintrc.json`
- No Prettier — formatting relies on ESLint rules alone
- Indentation: 2 spaces (enforced by Google style guide)
- Semicolons: required (enforced by Google style guide)
- Trailing commas: never allowed — `"comma-dangle": ["error", "never"]` in `.eslintrc.json`
- Constructor capitalization: `"new-cap": "warn"` — warns if constructor doesn't start with uppercase

**Linting:**
- ESLint version `^6.8.0` (dev dependency)
- `eslint-config-google` version `^0.14.0` (dev dependency)
- Strict mode: `'use strict'` declared inside each `module.exports` function (not at file level)
- JSDoc not required: `"require-jsdoc"` custom rule disables requirement for all function types (`FunctionDeclaration`, `MethodDefinition`, `ClassDeclaration`, `ArrowFunctionExpression`)
- Run command: `npm test` (aliased to `eslint postgrestor.js`)

**Strings:**
- Single quotes used consistently for string literals (Google style)
- Template literals (backticks) used for all string interpolation (e.g., `` `Error executing query: ${err.message}` ``)
- No string concatenation with `+` — all concatenation uses template literals

**Object Literals:**
- No trailing commas (enforced by ESLint)
- Multi-line objects use consistent indentation:

```javascript
node.status({
  fill: 'green',
  shape: 'ring',
  text: `Query ok. ${msg.payload.rowCount} rows returned`
});
```

## Import Organization

**Order:**
1. `'use strict'` directive — always first statement inside `module.exports` function
2. NPM package imports — `const mustache = require('mustache');` then `const Pool = require('pg').Pool;`

**Destructuring from packages:**
- Uses destructured imports from npm packages: `const Pool = require('pg').Pool;`
- No path aliases — no module bundler or alias configuration present

**No ES module syntax:**
- Uses CommonJS `require()` exclusively
- No `import`/`export` statements
- `module.exports = function(RED) {}` for the single module export

## Error Handling

**Patterns:**

1. **Try/catch with async/await (primary pattern):**
```javascript
try {
  client = await node.config.pgPool.connect();
  msg.payload = await client.query(query, msg.params || []);
  node.status({ fill: 'green', shape: 'ring', text: `Query ok...` });
} catch (err) {
  const errorMessage = `Error executing query: ${err.message}`;
  node.status({ fill: 'red', shape: 'ring', text: errorMessage });
  if (config.throwErrors) {
    node.error(errorMessage, msg);  // halts flow
    msg = null;
  } else {
    node.error(errorMessage);       // logs but continues
    msg.error = errorMessage;       // passes error downstream
  }
} finally {
  if (client) client.release();
  node.send(msg);
}
```

2. **Promise .catch() pattern:**
```javascript
client.query(`LISTEN ${config.channel}`)
  .then(() => { node.log(...); })
  .catch(err => { node.error(...); });
```

3. **Top-level async error boundary:**
```javascript
asyncQuery().catch((unhandledError) => {
  node.error(`Unhandled error: ${unhandledError.message}`);
});
```

4. **Nested try/catch for cleanup:**
```javascript
finally {
  if (client) {
    try {
      client.release();
    } catch (releaseError) {
      node.error(`Error releasing connection: ${releaseError.message}`);
    }
  }
  node.send(msg);
}
```

**Error message format:**
- All error messages use template literals with `err.message` or similar: `` `Error executing query: ${err.message}` ``
- Verbose, human-readable messages
- Always pass the original error's `.message` property into new messages

**Error propagation:**
- Two paths based on `config.throwErrors`:
  - `throwErrors = true`: calls `node.error(message, msg)` which halts the flow, sets `msg = null`
  - `throwErrors = false`: calls `node.error(message)` to log, then attaches error to `msg.error` and passes downstream
- `node.error()` is the Node-RED API for error logging (NOT `throw`)
- The third argument-less form `node.error(message)` logs without stopping the flow

**Status indicators:**
- `node.status({ fill: 'green', shape: 'ring', ... })` for success
- `node.status({ fill: 'red', shape: 'ring', ... })` for errors
- `node.status({})` on node `close` event to clear status

## Logging

**Framework:** Direct `console.log()` calls — no structured logging library

**Patterns observed (in `postgrestor.js`):**

| Line | Pattern | Context |
|------|---------|---------|
| 55 | `console.log("config throwErrors", node.throwErrors)` | Debug logging of configuration value |
| 90 | `console.log("Connecting to database with query:", query)` | Connection lifecycle log |
| 92 | `console.log("Connected to database")` | Connection lifecycle log |
| 118 | `console.log("Connection released")` | Cleanup lifecycle log |

**Node-RED logging API (used sparingly):**
- `node.log()` — used in `PostgresListenerNode` (line 163: notification received, line 172: listening setup)
- `node.error()` — used consistently for all error conditions

**Notable inconsistency:** `console.log()` is used for lifecycle logging in `PostgresNode`, but `node.log()` is used in `PostgresListenerNode`. The Node-RED convention recommends `node.log()` for all node-level logging so it appears in the Node-RED debug panel.

**Log content:**
- Connection lifecycle: connecting, connected, released
- Query content: the actual SQL query string is logged (potential information leakage concern)
- Configuration values: `throwErrors` value is logged
- Error messages: always include the original error message

**When to log:**
- On connection lifecycle events (connect, release)
- On error conditions (via `node.error()`)
- On notification events (via `node.log()`)
- Debugging config state (via `console.log()`)

## Comments

**When to Comment:**
- No inline comments in `postgrestor.js`
- No file-level or function-level documentation comments
- JSDoc/TSDoc not used — ESLint rule explicitly disables JSDoc requirement

**Commented-out code:**
- `postgrestor.html` contains significant commented-out code blocks:
  - Lines 182-195: user/password config fields (removed from config node defaults)
  - Lines 241-245: SSL `typedInput` configuration (disabled)
  - Lines 246-265: user/password `typedInput` configuration with custom change handler (disabled)
  - Lines 63, 72, 251-256: various single-line commented-out form elements

**HTML template comments:**
- SQL examples provided as HTML comments in template: `/* INTEGER id COLUMN */`
- These serve as documentation for the Mustache/SQL template syntax

## Function Design

**Size:**
- `getField`: 18 lines (6-24) — utility switch statement
- `PostgresDBNode`: 42 lines (26-69) — config node constructor with property assignment and pool creation
- `PostgresNode`: 56 lines (79-135) — query execution node with async input handler
- `PostgresListenerNode`: 41 lines (141-181) — NOTIFY listener node
- Single file totals: 182 lines — very compact codebase

**Parameters:**
- Constructor functions receive a single config object (`n` or `config`)
- `getField(node, kind, value)` — explicit positional parameters, clear naming
- Config object property names use camelCase matching the HTML form field IDs (e.g., `node.hostFieldType`)

**Return Values:**
- `getField()` returns parsed values or `undefined` if no matching case
- Node constructors do not return values (side-effect: register with RED runtime)
- Async query handler passes data via `msg.payload`

**Async Patterns:**
- `PostgresNode` uses an async IIFE pattern: defines `asyncQuery` via `const asyncQuery = async () => { ... }` then calls `asyncQuery().catch(...)`
- This approach isolates the async logic from the synchronous event handler
- The `.catch()` on the outer call catches any unhandled rejections from the async IIFE

## Module Design

**Exports:**
- Single `module.exports = function(RED) {}` — standard Node-RED contrib node pattern
- All node types and logic defined inside the exported function
- No additional exports beyond the main function

**Barrel Files:**
- Not applicable — single source file

**Module structure (within `postgrestor.js`):**
1. `'use strict'` directive
2. NPM imports (`mustache`, `pg.Pool`)
3. Utility function (`getField`)
4. Config node (`PostgresDBNode`) — registered with `RED.nodes.registerType('PostgresDBNode', ...)`
5. Module-level variable (`let myPool = false;` — appears unused)
6. Query node (`PostgresNode`) — registered with `RED.nodes.registerType('PostgresNode', ...)`
7. Listener node (`PostgresListenerNode`) — registered with `RED.nodes.registerType('PostgresListenerNode', ...)`

**Node-RED registration pattern:**
```javascript
RED.nodes.registerType('NodeTypeName', ConstructorFunction);
// Config nodes include credentials:
RED.nodes.registerType('PostgresDBNode', PostgresDBNode, {
  credentials: { user: { type: 'text' }, password: { type: 'password' } }
});
```

## HTML/Editor Conventions

**Template definitions:**
- Node templates use `<script type="text/x-red" data-template-name="NodeName">`
- Registration scripts use `<script type="text/javascript">`
- Form inputs use `id="node-config-input-<property>"` (config nodes) or `id="node-input-<property>"` (flow nodes)
- Hidden inputs for field type tracking: `id="node-config-input-<property>FieldType"`

**i18n:**
- All UI labels use `data-i18n` attributes: `data-i18n="postgrestor.label.name"` and `data-i18n="[placeholder]postgrestor.placeholder.name"`
- Locale JSON uses nested keys: `postgrestor.label.name`, `postgrestor.placeholder.host`, `postgrestor.tab.connection`

**Editor integration:**
- SQL editor provided via `RED.editor.createEditor()` with ACE editor in SQL mode
- jQuery used for DOM manipulation (`$("#node-input-...").typedInput({...})`)

---

*Convention analysis: 2026-06-10*
