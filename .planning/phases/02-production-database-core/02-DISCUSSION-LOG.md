# Phase 2: Production Database Core - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-10
**Phase:** 02-production-database-core
**Areas discussed:** SSL configuration UX, Prepared statements lifecycle

---

## SSL Configuration UX

| Option | Description | Selected |
|--------|-------------|----------|
| Always show all fields | All SSL fields always visible (sslmode + cert textareas) | |
| Progressive disclosure | Show sslmode dropdown, reveal cert fields only for verify-ca/verify-full | ✓ |
| Sslmode only, certs always visible | No show/hide logic, certs always shown alongside dropdown | |
| Let me describe it | Freeform input | |

**User's choice:** Progressive disclosure — sslmode dropdown always visible, cert fields (CA cert, client cert, client key) appear only when sslmode is `verify-ca` or `verify-full`.

**Notes:** User selected the recommended option. This keeps the config panel clean for users not requiring certificate verification.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Credentials | Store cert/key in Node-RED encrypted credential storage | ✓ |
| Typed-input fields | Plain str/env/flow/global fields | |
| File paths only | Path references, read at runtime | |
| Let me describe it | Freeform input | |

**User's choice:** Node-RED credential storage — encrypted at rest, same pattern as existing user/password credentials.

**Notes:** Consistent with the existing credential approach. Certs are sensitive material and should not be stored in plain config.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Deprecate, auto-migrate | Keep boolean greyed out, auto-map ssl=true to sslmode=require | ✓ |
| Replace entirely | Remove boolean, ssl=true silently becomes sslmode=require | |
| Keep boolean as gate | Boolean checkbox gates the sslmode dropdown | |

**User's choice:** Deprecate boolean toggle with auto-migration. Existing `ssl: true` configs map to `sslmode: require`. Deprecated field remains visible but greyed out with a migration tooltip.

**Notes:** Non-breaking approach. Users with existing flows see what happened and can adjust if needed.

---

## Prepared Statements Lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| User-provided names | User types a name in editor config | |
| Auto-generated | Names from query hash, invisible to user | ✓ |
| Hybrid: name or auto | User name if given, hash fallback if empty | |
| Let me describe it | Freeform input | |

**User's choice:** Auto-generated names from query hash (e.g. `ps_abc123`). Every unique query automatically becomes a prepared statement with no user-facing UI.

**Notes:** User values simplicity — no new editor fields needed for prepared statements.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Per-connection cache | Each pool client tracks its own prepared statements | ✓ |
| Central map, re-prepare | Node-level map, check-and-reprepare each query | |
| No caching | Prepare+execute each time | |
| Let me describe it | Freeform input | |

**User's choice:** Per-connection cache — each pool client tracks its own set of prepared statements. Statements survive across queries on the same connection.

**Notes:** Aligned with PostgreSQL's per-connection prepared statement model.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Redeploy clears cache | Node redeploy invalidates all prepared statements | ✓ |
| TTL-based expiry | Cache expires after configurable time | |
| Both: redeploy + TTL | Combined approach | |

**User's choice:** Redeploy clears cache. Statements re-prepare on first post-deploy execution.

**Notes:** Simplest approach. TTL adds complexity without clear benefit for this use case.

---

## the Agent's Discretion

- DATABASE_URL integration — override/fallback semantics, URL parameter parsing
- Pool health display — polling strategy, granularity
- Query timeout implementation — statement_timeout vs. AbortController
- Structured error format — exact fields beyond code/detail/constraint/table
- Type mapping behavior — on-by-default vs. opt-in, jsonb toggle independence
- Named parameters mapping — interaction with Mustache
- CodeMirror integration — mode, config, theme
