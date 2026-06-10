# Codebase Structure

**Analysis Date:** 2026-06-10

## Directory Layout

```
postgrestor/                           # Project root (package name: @topcs/node-red-contrib-postgres)
├── postgrestor.js                     # Runtime implementation — all three node types + getField helper (182 lines)
├── postgrestor.html                   # Editor UI definition — HTML templates + JS registrations for all three node types (441 lines)
├── package.json                       # Package manifest — dependencies, scripts, Node-RED node mapping
├── azure-pipelines.yml                # Azure DevOps CI pipeline definition
├── .eslintrc.json                     # ESLint configuration (extends google style)
├── .gitignore                         # Ignores .idea/ and node_modules/
├── README.md                          # Project documentation with install/usage instructions
├── LICENSE                            # GNU AGPL v3 full license text
├── icons/                             # Node palette icons
│   ├── postgres.png                   # PostgresDBNode config node icon
│   ├── sql.png                        # PostgresNode query node icon
│   └── listen.png                     # PostgresListenerNode listener node icon
├── locales/                           # Internationalization resources
│   └── en-US/                         # American English locale
│       ├── postgrestor.json           # i18n label/placeholder/tab/title strings (41 lines)
│       └── postgrestor.html           # Editor help panel HTML (37 lines)
├── node_modules/                      # npm dependencies (gitignored, not committed)
├── .planning/                         # GSD planning artifacts (not committed — .gitignore)
│   └── codebase/                      # Codebase map documents
└── .codegraph/                        # Codegraph index cache (not committed)
```

## Directory Purposes

**`icons/`:**
- Purpose: Static PNG icon assets displayed in the Node-RED editor's node palette
- Contains: Three 3rd-party icon images for the three node types
- Key files: `sql.png` (used by PostgresNode), `listen.png` (used by PostgresListenerNode), `postgres.png` (used by PostgresDBNode)

**`locales/en-US/`:**
- Purpose: English-language i18n strings and help text for the Node-RED editor
- Contains: JSON for field labels/placeholders, HTML file for in-editor help panel
- Key files: `postgrestor.json` (all translatable strings referenced via `data-i18n` attributes in `postgrestor.html`), `postgrestor.html` (help text shown in Node-RED's info sidebar)

**Root-level files:**
- Purpose: All implementation, build, and documentation lives at the project root
- Contains: The JS runtime, HTML editor UI, package manifest, CI config, linter config, docs, license
- Key files: `postgrestor.js` (runtime), `postgrestor.html` (editor), `package.json` (metadata + dependency declarations)

## Key File Locations

**Entry Points:**
- `postgrestor.js:1`: Runtime entry — `module.exports = function (RED) { ... }` registering all node types
- `postgrestor.html`: Editor entry — loaded by Node-RED browser editor to render configuration UI
- `package.json:33`: Node-RED node mapping — `"postgres": "postgrestor.js"` tells Node-RED which module to load

**Configuration:**
- `package.json`: Package metadata, dependency versions (pg ^8.16.2, mustache ^4.2.0), Node-RED compatibility (>=3.0.0), engine requirement (node >=18.0.0)
- `.eslintrc.json`: ESLint config extending google style guide with relaxed JSDoc requirements, no comma-dangle, warn on new-cap
- `azure-pipelines.yml`: CI config — triggers on master and greenkeeper/* branches, Ubuntu 16.04, Node 8.x, publishes build artifacts

**Core Logic:**
- `postgrestor.js:6-24`: `getField()` — typed input resolver for pool config values
- `postgrestor.js:26-69`: `PostgresDBNode()` — config node constructor, creates pg.Pool
- `postgrestor.js:79-137`: `PostgresNode()` — query executor node, async query with Mustache
- `postgrestor.js:141-181`: `PostgresListenerNode()` — LISTEN/NOTIFY subscriber node

**Editor UI:**
- `postgrestor.html:1-111`: PostgresDBNode HTML template — tabbed layout with connection/security/pool tabs
- `postgrestor.html:112-293`: PostgresDBNode editor JS — defaults, typedInput setup, credential registration
- `postgrestor.html:294-330`: PostgresNode HTML template — SQL editor with ACE code editor
- `postgrestor.html:331-382`: PostgresNode editor JS — ACE editor init, defaults
- `postgrestor.html:386-405`: PostgresListenerNode HTML template — simple channel input
- `postgrestor.html:406-441`: PostgresListenerNode editor JS — category "storage", 0 inputs, listen.png icon

**Testing:**
- None present — no test files, no test framework configured. The `"test"` script in `package.json:6` runs only `eslint postgrestor.js`.

**Localization:**
- `locales/en-US/postgrestor.json`: All i18n strings for labels, placeholders, tabs, and tooltips
- `locales/en-US/postgrestor.html`: Help panel content with usage examples and query syntax

## Naming Conventions

**Files:**
- Single-word lowercase: `postgrestor.js`, `postgrestor.html` — matching the project name
- Configuration files: dot-prefixed where conventional (`.eslintrc.json`, `.gitignore`)
- No file extension variants — only `.js`, `.html`, `.json`, `.png`, `.yml`, `.md`

**Directories:**
- Lowercase: `icons/`, `locales/`, `node_modules/`, `.planning/`
- Locale subdirectories follow BCP-47 format: `en-US/`

**JavaScript symbols:**
- Constructor functions (node types): PascalCase — `PostgresDBNode`, `PostgresNode`, `PostgresListenerNode`
- Utility functions: camelCase — `getField()`
- Boolean flag: camelCase — `myPool` (dead code), `throwErrors`
- Config fields: camelCase — `hostFieldType`, `passwordFieldType`, `connectionTimeout`

**Node-RED registrations:**
- Node type names: PascalCase strings — `'PostgresDBNode'`, `'PostgresNode'`, `'PostgresListenerNode'`
- Categories: lowercase — `"config"`, `"storage"`
- Editor element IDs: kebab-case with `node-config-input-` or `node-input-` prefix — `node-config-input-host`, `node-input-query`

## Where to Add New Code

**New Node Type (runtime):**
- Primary code: Add a new constructor function in `postgrestor.js` following the pattern of existing nodes, then call `RED.nodes.registerType('NewNodeName', NewNodeName)` at the bottom
- Registration: If the node needs a config node, use `RED.nodes.getNode(config.referenceId)` to look it up

**New Node Type (editor UI):**
- Template: Add a new `<script type="text/x-red" data-template-name="NewNodeName">` block in `postgrestor.html` with the HTML form
- Registration: Add a new `<script type="text/javascript">` block with `RED.nodes.registerType("NewNodeName", { ... })` including category, defaults, icon, inputs/outputs

**New Icon:**
- Add a PNG file to `icons/`
- Reference it in the editor registration `icon` property in `postgrestor.html`

**New Locale Strings:**
- Add keys to `locales/en-US/postgrestor.json` under the `"postgrestor"` namespace
- Reference via `data-i18n="postgrestor.label.newKey"` in `postgrestor.html`

**Build/CI Changes:**
- Modify `azure-pipelines.yml` for CI pipeline changes
- Add devDependencies to `package.json` for new tooling
- Update `.eslintrc.json` for lint rule changes

**Documentation:**
- Update `README.md` for user-facing documentation
- Update `locales/en-US/postgrestor.html` for in-editor help panel content

## Special Directories

**`node_modules/`:**
- Purpose: Installed npm dependencies (pg, mustache, eslint, ci-publish, parse-github-repo-url, path-exists, lowercase-keys)
- Generated: Yes — by `npm install`
- Committed: No — listed in `.gitignore`

**`.codegraph/`:**
- Purpose: Codegraph index database for symbol search and exploration
- Generated: Yes — by codegraph daemon
- Committed: No

**`.planning/`:**
- Purpose: GSD workflow artifacts (codebase maps, phase plans, specs)
- Generated: Yes — by GSD commands
- Committed: No — managed separately from source code

---

*Structure analysis: 2026-06-10*
