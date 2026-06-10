# Phase 01: Foundation & Modernization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-10
**Phase:** 01-foundation-modernization
**Areas discussed:** Module Structure

---

## Module Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Split by node type | One file per node type (PostgresDBNode.ts, PostgresNode.ts, PostgresListenerNode.ts) + shared lib/getField.ts, all imported by postgrestor.ts | ✓ |
| Keep as single file | Migrate to TS but maintain single-file structure | |
| Logic/registration split | Split pure logic into testable modules under src/lib/ | |

**User's choice:** Split by node type — clearest separation, individually testable.

---

| Option | Description | Selected |
|--------|-------------|----------|
| src/nodes/ + src/lib/ | Standard TS project layout with nodes in src/nodes/ and shared utilities in src/lib/ | ✓ |
| Flat top-level | All .ts files at top level or single nodes/ dir | |
| lib/ implementation + root entry | lib/ for implementation + root entry for RED wiring | |

**User's choice:** src/nodes/ + src/lib/ — standard TypeScript layout, scales for future phases.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Split HTML by node type | One .html per node type alongside the .ts files | ✓ |
| Keep HTML monolithic | All templates in one postgrestor.html | |

**User's choice:** Split HTML by node type for consistency with the JS/TS split.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Single entry barrel | postgrestor.ts imports split modules, single package.json entry | ✓ |
| Multi-entry per node type | Each node type gets its own package.json entry | |

**User's choice:** Single entry barrel — simpler, more conventional for Node-RED contrib nodes.

---

## the agent's Discretion

The following gray areas were presented but not selected for discussion:

- **Test strategy & coverage depth** — Unit vs. integration tests, mocked pg, RED runtime mocking approach
- **Migration approach** — Strict port vs. opportunistic restructure (getField refactoring, etc.)
- **BUG-04 resolution** — Remove or wire the dead output checkbox
- **TypeScript conventions** — Interfaces, typings, enum usage, strictness beyond `strict: true`
- **ESLint 9.x flat config** — Rule selection, plugin versions
- **Jest + ts-jest config** — Transform patterns, test environment

## Deferred Ideas

None — discussion stayed within phase scope.