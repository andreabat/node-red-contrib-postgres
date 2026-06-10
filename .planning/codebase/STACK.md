# Technology Stack

**Analysis Date:** 2026-06-10

## Languages

**Primary:**
- JavaScript (ES6 / ES2015) - Entire codebase. No TypeScript used.

**Secondary:**
- SQL - Embedded in Node-RED editor queries and `LISTEN` commands at runtime
- HTML - Node-RED editor UI templates (`postgrestor.html`)
- JSON - Locale files (`locales/en-US/postgrestor.json`)

## Runtime

**Environment:**
- Node.js >= 18.0.0 (specified in `package.json` engines)
- No `.nvmrc` present

**Package Manager:**
- npm (no lockfile present — no `package-lock.json` or `yarn.lock` committed)

## Frameworks

**Core:**
- Node-RED >= 3.0.0 - This project is a Node-RED contrib node, not a standalone application. Registered as a node module via the `node-red.nodes` field in `package.json`. The runtime is provided by the host Node-RED instance.

**Testing:**
- No test framework. The `test` script in `package.json` runs `eslint postgrestor.js` — linting only, no unit or integration tests.

**Build/Dev:**
- ESLint 6.8.0 - Linting with `eslint-config-google` (Google JavaScript style guide)
- ci-publish 1.1.0 - Used for CI-driven npm publishing via `npm run ci-publish`
- No bundler, transpiler, or build step — plain JavaScript consumed directly by Node-RED

## Key Dependencies

**Critical:**
- `pg` ^8.16.2 - node-postgres, the PostgreSQL client. Provides `Pool` for connection pooling and is the sole database driver.
- `mustache` ^4.2.0 - Logic-less template engine used to interpolate `msg` properties into SQL query strings before execution (e.g., `{{ msg.id }}`).

## Configuration

**Environment:**
- No `.env` files present. Configuration is managed entirely through Node-RED's editor UI and credential storage:
  - Connection parameters (host, port, database, ssl) are configurable per-node in the Node-RED editor
  - Each field supports typed inputs: `str`, `num`, `bool`, `flow`, `global`, or `env` (Node-RED environment variables)
  - User and password are stored as Node-RED **credentials** (secure credential storage)

**Build:**
- `.eslintrc.json` - ESLint configuration extending Google style with relaxed JSDoc requirements
- `azure-pipelines.yml` - CI pipeline configuration (Azure DevOps)

## Platform Requirements

**Development:**
- Node.js >= 18.0.0
- npm for package installation
- Node-RED >= 3.0.0 runtime (for testing the node in-context)

**Production:**
- Node-RED instance >= 3.0.0 with this package installed
- Access to a PostgreSQL database server
- No additional deployment infrastructure required

---

*Stack analysis: 2026-06-10*
