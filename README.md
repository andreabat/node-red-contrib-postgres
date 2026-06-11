# 🐘 @topcs/node-red-contrib-postgres

Three nodes for PostgreSQL in Node-RED. **Config node** manages the connection pool. **Query node** executes SQL with Mustache templates and parameterized queries. **Listener node** pushes real-time `NOTIFY` events into your flow with automatic reconnection.

## ✨ Features

This fork brings a full TypeScript rewrite with 137 tests and zero regressions:

| Feature | Description |
|---------|-------------|
| 🔒 **Parameterized queries** | `msg.params` → `$1, $2, ...` |
| 🎨 **Named parameters** | `{name: 'value'}` → auto-bound in insertion order |
| 🧩 **Mustache templates** | `SELECT * FROM {{msg.table}}` |
| 🔄 **Multi-step transactions** | Array of `{query, params, output}` → `BEGIN / COMMIT / ROLLBACK` |
| 📡 **Real-time LISTEN/NOTIFY** | Push events from Postgres, auto-reconnects on connection drop |
| 🔮 **Cursor streaming** | `DECLARE / FETCH` large result sets in configurable batches |
| 📦 **COPY import/export** | High-speed CSV via PostgreSQL COPY protocol |
| ♻️ **Self-healing retry** | Retries on deadlock (40P01), serialization failures, connection drops with jittered backoff |
| 💚 **Pool health badge** | Active / idle / waiting / total visible on the node |
| 🔐 **Full SSL** | `sslmode`, CA cert, client cert/key — RDS/Azure/Supabase ready |
| 🧹 **Structured errors** | `msg.error.code`, `.detail`, `.constraint`, `.table` |
| ⏱️ **Query timeout** | Per-node `SET statement_timeout` with guaranteed reset |
| 🎯 **Type mapping** | `NUMERIC→number`, `TIMESTAMPTZ→ISO`, `JSONB→object` |
| ⚡ **Prepared statements** | Auto-named via MD5 hash, no configuration needed |
| 🛡️ **Channel sanitization** | LISTEN/UNLISTEN uses `pg-format %I` |
| 🧪 **137 tests** | Zero regressions |

## 📦 Install

```
npm install @topcs/node-red-contrib-postgres
```

Or use Node-RED's **Manage Palette** → search `@topcs/node-red-contrib-postgres`.

## 🚀 Quick Start

**1. Drop a PostgresDBNode** — set host, port, database, user, password. Configure SSL if needed. The badge shows pool health.

**2. Wire a PostgresNode** — write SQL with optional `{{msg.field}}` templates.

**Parameterized:**
```json
{"params": [42, "hello"]}
```

**Named parameters:**
```json
{"params": {"id": 42, "name": "Alice"}}
```
Enable "Named Parameters" toggle on the node.

**Transaction (array of queries on one connection):**
```json
{"payload": [
  {"query": "INSERT INTO users VALUES($1, $2)", "params": {"id": 1, "name": "Ada"}, "output": true},
  {"query": "INSERT INTO logs VALUES($1)", "params": {"action": "created"}}
]}
```
Enable "Transaction Mode". First `output: true` entry determines `msg.payload.rows`.

**Cursor streaming:**
Enable "Cursor Mode". SELECT queries stream batches via `DECLARE / FETCH`:
```json
// Sequential messages per batch:
{"payload": [...rows], "batch": {"index": 0, "rows": 100, "total": 100}}
// Final signal:
{"payload": [], "complete": true, "total": 10500}
```

**3. Add a PostgresListenerNode** — set channel name. When Postgres sends `NOTIFY channel, 'payload'`, it arrives as `{channel, payload, _original}`. JSON payloads auto-parse. Connection drops auto-recover.

## 🔧 Editor Toggles

| Toggle | Description |
|--------|-------------|
| **Throw Exception** | Halt the flow on SQL error (`throwErrors`) |
| **Named Parameters** | Bind `msg.params` object as `$1, $2, ...` |
| **Transaction Mode** | Execute `msg.payload` array atomically |
| **Cursor Mode** | Stream SELECT results in batches |
| **COPY Mode** | Use COPY protocol for CSV import/export |
| **Retry on Transient Errors** | Auto-retry deadlocks, serialization failures, connection drops |
| **Type Mapping** | NUMERIC→number, TIMESTAMPTZ→ISO, JSONB→object |

## 🎯 Requirements

- Node.js >= 18.0.0
- Node-RED >= 3.0.0
- PostgreSQL (any recent version)

## 🧪 Development

```
npm install
npm run build    # tsc + build HTML templates
npm test         # 137 tests (Jest)
npm run lint     # ESLint 9.x
```

## 📜 License

GNU AGPL-3.0. Originally by [doing-things-with-node-red](https://github.com/doing-things-with-node-red/node-red-contrib-postgrestor), forked and maintained by Andrea Batazzi. Revived with TypeScript.

---

[![NPM](https://nodei.co/npm/@topcs/node-red-contrib-postgres.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/@topcs/node-red-contrib-postgres/)
