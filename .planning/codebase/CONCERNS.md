# Codebase Concerns

**Analysis Date:** 2026-06-10

## Tech Debt

### Zero Test Coverage

- Issue: The `package.json` `"test"` script runs `eslint postgrestor.js`. No test framework (Jest, Mocha, etc.) is installed, and no test files exist anywhere in the repository.
- Files: `package.json` (line 6), no `*.test.js` or `*.spec.js` files found
- Impact: Every code change is deployed blind. Database interactions, error handling, connection pooling, and SQL generation — all unverified. A regression in the Mustache template rendering or parameterized query handling would be invisible until runtime.
- Fix approach: Install a test framework (Mocha or Jest). Add at minimum: (a) unit tests for `getField()` covering all type branches, (b) integration tests for query execution against a test database, (c) tests for the listener node lifecycle.

### Unused Module-Level Variable

- Issue: `let myPool = false;` is declared at module scope on line 77 but never referenced anywhere in the codebase.
- Files: `postgrestor.js` (line 77)
- Impact: Dead code clutters the module scope. No runtime impact, but indicates incomplete refactoring — a pool variable was likely planned but never wired in.
- Fix approach: Remove the line.

### Outdated Linting Infrastructure

- Issue: `eslint` at `^6.8.0` (released 2019) and `eslint-config-google` at `^0.14.0` (released 2020). ESLint 6.x is unsupported and lacks modern rules.
- Files: `package.json` (lines 38-39), `.eslintrc.json`
- Impact: Modern best practices and security rules are not being enforced. The lint config uses the deprecated `installedESLint` option.
- Fix approach: Upgrade to ESLint 9.x with flat config, or at minimum ESLint 8.x. Replace `eslint-config-google` with a maintained alternative.

### Deprecated CI Configuration

- Issue: `azure-pipelines.yml` targets Ubuntu 16.04 (EOL April 2021) and Node.js 8.x (EOL December 2019), while `package.json` `engines` requires Node `>=18.0.0`.
- Files: `azure-pipelines.yml` (lines 12, 16)
- Impact: CI cannot run. The pipeline is effectively dead and provides no verification gate.
- Fix approach: Update to `ubuntu-latest` and Node 18.x/20.x/22.x. Alternatively, replace with a GitHub Actions workflow.

### Commented-Out Code in HTML Template

- Issue: Large blocks of commented-out code in the PostgresDBNode HTML template, including typedInput initialization for `user` (lines 246-250), `password` (lines 251-265), and `ssl` (lines 241-245). Also commented-out `defaults` for `user`, `password`, `userFieldType`, and `passwordFieldType` (lines 182-195).
- Files: `postgrestor.html` (lines 182-195, 241-265)
- Impact: Makes the code harder to maintain and confusing for contributors. The user/password typedInput UI is commented out, but the underlying `n.userFieldType` and `n.passwordFieldType` are still read in JS — though they fall back gracefully since the values default to `undefined`, which hits the `default` case in `getField`.
- Fix approach: Either fully implement the typedInput for user/password or remove all commented-out code. If keeping credentials as Node-RED credential-only fields (no typedInput), remove the commented-out defaults and typedInput blocks entirely.

### Dead `output` Config Property

- Issue: The `PostgresNode` HTML template includes an "output" checkbox (line 309) with a default of `true` (line 346-348) and an `oneditprepare` handler that reads it (line 367), but the JavaScript `PostgresNode` function never references `config.output` or `node.output`. Messages are always sent via `node.send(msg)` in the `finally` block regardless.
- Files: `postgrestor.html` (lines 309-313, 346-348, 367), `postgrestor.js` (lines 79-135)
- Impact: A UI control that does nothing. Users may toggle it expecting it to suppress output.
- Fix approach: Either wire the `output` config so that the node respects it (conditionally call `node.send(msg)`) or remove the checkbox from the HTML template and defaults.

### Locales Placeholder Swap (min/max)

- Issue: The `min` placeholder value is `"10"` and the `max` placeholder value is `"1"` — these appear to be swapped. A pool minimum of 10 and maximum of 1 is logically inverted.
- Files: `locales/en-US/postgrestor.json` (lines 26-27)
- Impact: Users reading the placeholder text may be confused about which is the maximum and which is the minimum pool size.
- Fix approach: Swap the placeholder values so `max` shows `"10"` and `min` shows `"1"`.

### Single Locale (English Only)

- Issue: Only `en-US` translations exist. No i18n support for other languages.
- Files: `locales/en-US/` (only locale directory)
- Impact: Non-English-speaking Node-RED users see untranslated labels. Reduces adoption.
- Fix approach: Add additional locale directories (e.g., `de-DE/`, `it-IT/`, `ja/`).

## Known Bugs

### `parseInt` Returns NaN for Invalid Input

- Symptoms: Pool configuration values (`max`, `min`, `idle`, `connectionTimeout`, `port`) become `NaN` when the configured flow/global variable contains a non-numeric string.
- Files: `postgrestor.js` (line 15)
- Trigger: Set a pool field (e.g., `max`) to `flow` type and store a non-numeric value in the flow context. `parseInt("abc")` returns `NaN`.
- Workaround: Ensure flow/global values are always numeric strings. No runtime guard exists.
- Fix approach: Use `Number(value)` with an `isNaN()` check, or provide a fallback default. Consider adding validation in the HTML `oneditprepare` to reject non-numeric inputs for numeric fields.

### `JSON.parse` Throws on Invalid Boolean Input

- Symptoms: An unhandled exception when `ssl` or `throwErrors` field type is `bool` and the value is not valid JSON (`JSON.parse("not-json")` throws).
- Files: `postgrestor.js` (line 18)
- Trigger: Set `ssl` or `throwErrors` to `flow` or `global` type and store a non-JSON value.
- Workaround: Ensure flow/global boolean values are always `"true"` or `"false"` (lowercase, valid JSON). No runtime guard exists.
- Fix approach: Wrap `JSON.parse` in a try-catch with a fallback to `false`. Alternatively, use a simple string comparison (`value === 'true'`).

### Listener Connection Never Released

- Symptoms: The `PostgresListenerNode` calls `pgPool.connect()` to acquire a client for LISTEN, but never releases it. There is no `node.on('close')` handler to execute `client.release()` or `UNLISTEN`. On Node-RED redeploy, the pooled connection remains allocated until the pool detects it as idle and times it out, or the process terminates.
- Files: `postgrestor.js` (lines 141-181)
- Trigger: Deploy a flow with a `PostgresListenerNode`, then redeploy. The old connection is leaked and only reclaimed by idle timeout or TCP keepalive failure.
- Workaround: Restart Node-RED to force-clear all connections. Short idle timeouts on the pool mitigate but don't fix.
- Fix approach: Add a `node.on('close', ...)` handler that (a) runs `UNLISTEN ${config.channel}`, (b) calls `client.release()`, and (c) optionally sets a flag to ignore future notifications from the stale connection. Also consider adding reconnection logic for dropped connections.

### Connection Pool Never Drained on Close

- Symptoms: The `PostgresDBNode` constructor creates a `pg.Pool` but registers no `close` handler. When Node-RED is stopped or the config node is removed, `pool.end()` is never called. Active connections may remain open until TCP timeouts.
- Files: `postgrestor.js` (lines 26-69)
- Trigger: Node-RED shutdown or redeploy while connections are active.
- Workaround: The PostgreSQL server typically detects dropped clients via TCP keepalive. However, idle connections may persist on the server side until timeout.
- Fix approach: Register a `node.on('close', ...)` handler on the config node that calls `this.pgPool.end()`.

## Security Considerations

### SQL Injection via Mustache Template Engine

- Risk: The Mustache template engine (`mustache.render(config.query, { msg })`) allows users to embed raw `msg` properties directly into SQL query strings. If a user writes `SELECT * FROM users WHERE name = '{{ msg.name }}'`, and `msg.name` contains `' OR '1'='1`, the resulting query is vulnerable to SQL injection. The README itself warns about this for the Listen node, but the warning is buried and does not apply exclusively to the listener — the same risk exists for the `PostgresNode` query.
- Files: `postgrestor.js` (lines 85, 171), `README.md` (line 9)
- Current mitigation: The code supports parameterized queries via `msg.params` (line 93: `client.query(query, msg.params || [])`), which is the correct approach. Users can use `$1`, `$2` placeholders. However, Mustache templating coexists without any guardrails, and the example in the README shows both patterns side by side.
- Recommendations:
  1. Add a prominent security warning in the node's help text (HTML template) explaining the injection risk of Mustache templating.
  2. Consider adding a config option to disable Mustache rendering entirely, forcing parameterized-only queries.
  3. Validate that the rendered query does not contain unquoted template expansions by checking for common injection patterns.
  4. Update the README to emphasize that `msg.params` with `$N` placeholders is the **only** safe pattern.

### Sensitive Data in Console Logs

- Risk: Raw SQL queries are logged via `console.log`, which can include sensitive data (PII, credentials embedded in queries, etc.). Node-RED's `console.log` typically goes to stdout/stderr which may be captured in log aggregation systems, written to disk, or exposed in container logs.
- Files: `postgrestor.js` (lines 55, 90, 92, 118)
- Current mitigation: None.
- Recommendations:
  1. Replace all `console.log` calls with `node.log()` (Node-RED's logging facility, which respects log levels).
  2. Set log level to `debug` for query-content logs so they are suppressed in production.
  3. Never log the full query text at `info` level; log only metadata (row count, duration, command type).
  4. Remove `console.log("config throwErrors", node.throwErrors)` which appears to be a debug leftover.

### SSL Configuration Limited to Boolean

- Risk: The `ssl` field can only be `true` or `false`. The `pg` library's SSL option accepts an object (e.g., `{ rejectUnauthorized: false }` for self-signed certificates, or `{ ca: ... }` for custom CA). With only a boolean, users connecting to PostgreSQL instances with self-signed or custom-CA certificates have no way to configure SSL properly and may resort to disabling SSL entirely.
- Files: `postgrestor.js` (line 63), `postgrestor.html` (lines 47-53, 147-152)
- Current mitigation: Commented-out typedInput for SSL (HTML lines 241-245) suggests this was considered but never implemented.
- Recommendations: Re-enable the SSL typedInput (uncomment lines 241-245 in the HTML). The `oneditprepare` handler should allow SSL to be configured as a string (for CA path), an object (for `{ rejectUnauthorized, ca, cert, key }`), or a boolean. Update `getField` to handle SSL object parsing.

### Error Message Leaks Query in Node Status

- Risk: The error message `Error executing query: ${err.message}` is written to the node status (visible in the Node-RED editor UI). If the PostgreSQL error message includes the query text (which many error types do, e.g., syntax errors), the full query — potentially with sensitive data — is exposed in the editor UI.
- Files: `postgrestor.js` (lines 100-105)
- Current mitigation: None.
- Recommendations: Truncate or sanitize the status text. Do not include the raw `err.message` in node status. Instead use a generic message like `Query execution failed` and log the full error via `node.error()` (which goes to the debug sidebar but is less visible than node status).

## Performance Bottlenecks

### Listener Node Uses One Connection Per Node Permanently

- Problem: Each `PostgresListenerNode` instance permanently occupies one connection from the pool for its `LISTEN` subscription. If a user creates many listener nodes, the pool can be exhausted.
- Files: `postgrestor.js` (line 160)
- Cause: The listener uses `pgPool.connect()` to acquire a dedicated client, which is standard for PostgreSQL `LISTEN` (the connection must remain open). However, pool exhaustion is a real risk with no warning.
- Improvement path:
  1. Document the connection-per-listener model in the node help text.
  2. Consider a dedicated pool for listeners separate from the query pool.
  3. Add a pool exhaustion warning if `listenerCount >= pool.max`.

### No Query Timeout

- Problem: Queries execute with no timeout. A long-running query or a hung connection holds a pool slot indefinitely.
- Files: `postgrestor.js` (line 93)
- Cause: `client.query()` is called without a timeout or `statement_timeout` hint.
- Improvement path: Add a configurable query timeout and pass it to `client.query()` or set `statement_timeout` via `SET LOCAL`.

## Fragile Areas

### `PostgresListenerNode` — No Reconnection Logic

- Files: `postgrestor.js` (lines 141-181)
- Why fragile: If the PostgreSQL connection drops (network blip, server restart, idle timeout), the LISTEN subscription silently dies. No notification is sent to the user, and the node continues to appear green. New NOTIFY events are never received.
- Safe modification: Add a connection error listener on the client (`client.on('error', ...)`) that triggers a reconnection loop with backoff. Update node status to reflect connection state.
- Test coverage: None. Modifications would need integration tests with a real PostgreSQL instance.

### `getField` — Unvalidated Type Coercion

- Files: `postgrestor.js` (lines 6-24)
- Why fragile: The function silently coerces invalid values. `parseInt("invalid")` returns `NaN`, `JSON.parse("invalid")` throws. If the pool receives `NaN` for `max`, `min`, `port`, or timeout values, behavior is unpredictable — the `pg` library may throw, or connections may fail silently.
- Safe modification: Add input validation before coercion. Wrap `JSON.parse` in try-catch. Use `Number()` + `isNaN()` for numeric fields with a fallback default. Add explicit error logging for invalid values.
- Test coverage: None. This function is the gateway for all pool configuration.

### `PostgresNode` Error Path — `msg = null` Breaks Downstream

- Files: `postgrestor.js` (lines 107-113)
- Why fragile: When `config.throwErrors` is true and a query fails, `node.error(errorMessage, msg)` is called and then `msg` is set to `null`. The `finally` block always calls `node.send(msg)`, so the downstream node receives `null`. This is a silent failure — the downstream node gets no payload payload, no error property, and no indication of what happened. If the downstream node expects `msg.payload` to always be defined, it will crash.
- Safe modification: When `throwErrors` is true, do not send `null` — call `node.send()` with no arguments (or don't send at all), or set `msg.payload = null` and `msg.error = errorMessage` instead of replacing the entire message.
- Test coverage: None.

### Credentials Field Type Mismatch Between HTML and JS

- Files: `postgrestor.html` (lines 182-195, 246-265), `postgrestor.js` (lines 48-49, 58-59)
- Why fragile: The HTML template defines credentials (user, password) at lines 287-290 but has the typedInput/defaults commented out. The JS code reads `n.userFieldType` and `n.passwordFieldType` which were meant to come from the HTML defaults. Since the defaults are commented out, these are `undefined`. The `getField` function's `default` case returns the raw value, so `getField(node, undefined, node.credentials.user)` returns `node.credentials.user` — which works by accident, but the fieldType abstraction is silently broken for credentials.
- Safe modification: Either remove the `userFieldType`/`passwordFieldType` reads and treat credentials as always plain text, or implement the full typedInput UI for credentials (including env/flow/global support if desired).

## Dependencies at Risk

### `eslint@6.8.0` and `eslint-config-google@0.14.0`

- Risk: ESLint 6.x reached end of life in 2021. No security patches, no support for newer ECMAScript syntax, and compatibility issues with modern Node.js.
- Impact: Security vulnerabilities in ESLint itself may go unpatched. Newer Node.js features may not be properly linted.
- Migration plan: Upgrade to ESLint 8.x (drop-in replacement) or 9.x (flat config). Replace `eslint-config-google` with a maintained config or define rules inline.

### `mustache@^4.2.0`

- Risk: Mustache 4.2.0 is relatively recent, but the library has a small maintenance team. No critical vulnerabilities known, but the template engine is the primary SQL injection vector (see Security Considerations above).
- Impact: If Mustache is abandoned, the templating feature would need a replacement.
- Migration plan: Consider making Mustache optional (config toggle). Evaluate alternatives like Handlebars or dropping template rendering entirely in favor of parameterized-only queries.

### Azure Pipelines / Ubuntu 16.04 / Node 8.x

- Risk: The CI pipeline is targeting EOL infrastructure and a Node.js version 10 major versions behind the `engines` requirement.
- Impact: No CI verification. The pipeline is dead weight.
- Migration plan: Migrate to GitHub Actions (repository is already on GitHub) or update Azure Pipelines to use modern images.

## Missing Critical Features

### No Connection Health Check

- Problem: There is no mechanism to verify that the database connection is alive before executing queries. If the connection pool is exhausted or the database is unreachable, queries fail at execution time with no proactive warning.
- Blocks: Operators cannot monitor connection health through Node-RED's status API or dashboard.
- Recommendation: Add a periodic health-check query (e.g., `SELECT 1`) and expose connection status via node status (green/yellow/red).

### No Connection Pool Monitoring/Metrics

- Problem: No visibility into pool utilization, wait times, or connection counts. Operators cannot detect pool exhaustion before queries fail.
- Blocks: Capacity planning and debugging of connection-related issues.
- Recommendation: Expose pool metrics (total, idle, waiting, active connections) via `msg` properties or Node-RED status.

### No LISTEN/NOTIFY Channel Validation

- Problem: The `PostgresListenerNode` does not validate that the channel name is a valid PostgreSQL identifier. Special characters or excessively long names may cause silent failures or unexpected behavior.
- Files: `postgrestor.js` (line 171)
- Blocks: Robust channel handling.
- Recommendation: Validate channel names against PostgreSQL identifier rules before executing `LISTEN`.

---

*Concerns audit: 2026-06-10*
