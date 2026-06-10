# External Integrations

**Analysis Date:** 2026-06-10

## APIs & External Services

**Database:**
- PostgreSQL - The sole external integration. All node functionality (query execution, LISTEN/NOTIFY) operates against a PostgreSQL database.
  - SDK/Client: `pg` (node-postgres) ^8.16.2 — imported in `postgrestor.js` line 4
  - Auth: PostgreSQL native username/password authentication
  - Credentials stored in Node-RED credential storage (user: text type, password: password type)
  - Connection pooling via `pg.Pool` with configurable min/max/idle/connectionTimeout settings

## Data Storage

**Databases:**
- PostgreSQL (external, not bundled)
  - Connection: host/port/database configured per-node via the Node-RED editor
  - Client: `pg.Pool` — instantiated in `PostgresDBNode` at `postgrestor.js` line 57
  - Default connection values: host `127.0.0.1`, port `5432`, database `postgres`
  - SSL support: configurable boolean toggle
  - Connection pool defaults: max 10, min 1, idle timeout 1000ms, connection timeout 10000ms

**File Storage:**
- Local filesystem only (Node-RED's own storage). No external file/object storage.

**Caching:**
- None. No caching layer present in the codebase.

## Authentication & Identity

**Auth Provider:**
- PostgreSQL native authentication (username + password)
  - Implementation: Credentials passed to `pg.Pool` constructor at `postgrestor.js` lines 58-59
  - User field: sourced from Node-RED credential storage (`node.credentials.user`)
  - Password field: sourced from Node-RED credential storage (`node.credentials.password`) as type `password`
  - Both user and password support typedInput resolution (`str`, `flow`, `global`, `env` via `getField`)
  - No OAuth, no external auth provider, no API key authentication

## Monitoring & Observability

**Error Tracking:**
- None. No external error tracking service. Errors are handled via `node.error()` (Node-RED's built-in logging) and `console.log` statements.

**Logs:**
- Node-RED built-in logging: `node.log()`, `node.error()` for runtime messages
- `console.log` calls for debugging output:
  - `postgrestor.js` line 55: logs `throwErrors` config value
  - `postgrestor.js` line 90: logs connecting query
  - `postgrestor.js` line 92: logs connected confirmation
  - `postgrestor.js` line 118: logs connection release
- These debug `console.log` calls appear to be development artifacts left in production code

## CI/CD & Deployment

**Hosting:**
- Node-RED instance — package is installed as a node-red contrib module. No dedicated hosting platform.

**CI Pipeline:**
- Azure Pipelines (`azure-pipelines.yml`)
  - Triggered on `master` and `greenkeeper/*` branches
  - Pool: `Ubuntu-16.04` (outdated, EOL)
  - Node.js version: 8.x (severely outdated — does not match engines requirement of >=18.0.0)
  - Steps: install deps → copy files (excluding node_modules and .git) → publish build artifact
  - No test execution, no lint step in CI
  - No deployment step

## Environment Configuration

**Required env vars:**
- None required by the node itself. Connection parameters (host, port, database, user, password) can optionally be sourced from Node-RED environment variables via the `env` typedInput type.

**Secrets location:**
- Node-RED credential storage (encrypted at rest by Node-RED). The `PostgresDBNode` declares credentials for `user` (type: `text`) and `password` (type: `password`) at `postgrestor.js` lines 72-75 and `postgrestor.html` lines 287-290.
- No `.env` files or external secret management detected.

## Webhooks & Callbacks

**Incoming:**
- None. No HTTP endpoints exposed by this node.

**Outgoing:**
- PostgreSQL LISTEN/NOTIFY via `PostgresListenerNode` (`postgrestor.js` lines 141-181). This is a persistent TCP connection that receives asynchronous notifications from PostgreSQL. The listener:
  - Connects to the configured database server
  - Executes `LISTEN <channel>`
  - Emits incoming notifications as Node-RED messages with `{ channel, payload }` structure
  - Does not reconnect on connection loss (no reconnection logic)

---

*Integration audit: 2026-06-10*
