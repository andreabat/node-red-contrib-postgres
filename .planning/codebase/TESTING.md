# Testing Patterns

**Analysis Date:** 2026-06-10

## Test Framework

**Status: No test framework configured.**

- No test runner detected (no `jest`, `vitest`, `mocha`, `ava` dependencies)
- No test configuration files found (`jest.config.*`, `vitest.config.*`, `.mocharc.*`, etc.)
- No test files exist anywhere in the repository
- No test directories present

**Current "test" command:**
```bash
npm test              # Runs: eslint postgrestor.js (lint-only check)
```

This means the only automated validation is ESLint linting against the Google JavaScript style guide. There is no behavioral verification — no unit tests, integration tests, or end-to-end tests.

## Test File Organization

**Not applicable — no tests exist.**

If tests were to be added, the standard Node-RED contrib node conventions would be:

**Location:**
- Co-located tests: `postgrestor.test.js` or `postgrestor.spec.js` alongside `postgrestor.js`
- Separate test directory: `test/postgrestor.test.js` or `tests/postgrestor.test.js`

**Naming:**
- Use `*.test.js` or `*.spec.js` suffix

**Recommended structure for test files:**
```
test/
├── postgrestor.test.js    # Unit tests for postgrestor.js
├── fixtures/
│   └── mock-red.js        # Mock RED runtime object
└── helpers/
    └── setup.js            # Test setup utilities
```

## Test Structure

**No tests exist to demonstrate patterns.**

For reference, Node-RED nodes typically require these test patterns:

**Suite Organization (recommended approach):**
```javascript
const helper = require('node-red-node-test-helper');
const postgrestorNode = require('../postgrestor.js');

describe('PostgresNode', () => {
  beforeAll(async () => {
    // Initialize test helper, load node
    helper.init(require.resolve('../postgrestor.js'));
  });

  afterAll(async () => {
    helper.unload();
  });

  describe('query execution', () => {
    it('should execute a SELECT query and return rows', async () => {
      const flow = [{
        id: 'pg-config',
        type: 'PostgresDBNode',
        host: '127.0.0.1',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: 'testpass'
      }, {
        id: 'pg-query',
        type: 'PostgresNode',
        PostgresDBNode: 'pg-config',
        query: 'SELECT * FROM users WHERE id = $1',
        wires: [['helper']]
      }];

      await helper.load(flow);
      const pgQuery = helper.getNode('pg-query');
      // ... trigger input and assert output
    });
  });
});
```

**Key test dependencies for Node-RED nodes:**
- `node-red-node-test-helper` — official Node-RED test utility for loading nodes in isolation and injecting messages
- `sinon` — for stubbing/mocking `pg.Pool` and database interactions
- `jest` or `mocha` — test runner

## Mocking

**Status: No mocking framework or patterns exist.**

If tests were added, the following mocking strategy is recommended for this codebase:

**What must be mocked:**
- `pg.Pool` / `pg.Client` — the entire PostgreSQL driver (`require('pg')`)
  - `pool.connect()` → returns a mock client
  - `client.query()` → returns mock query results
  - `client.release()` → verify it was called
- The `RED` runtime object passed to `module.exports` — provided by `node-red-node-test-helper`

**What should NOT be mocked:**
- `mustache` template rendering — this is pure logic and should be tested directly
- The `getField()` utility function — pure logic, test directly with various inputs
- Error handling logic — test with real error paths (mock client rejecting)

**Recommended mocking pattern:**
```javascript
jest.mock('pg', () => {
  const mockClient = {
    query: jest.fn(),
    release: jest.fn()
  };
  const mockPool = {
    connect: jest.fn().mockResolvedValue(mockClient)
  };
  return { Pool: jest.fn(() => mockPool) };
});
```

## Fixtures and Factories

**Status: No test data or fixtures exist.**

If tests were added, the following would need fixtures:

**Test Data:**
```javascript
// fixtures/query-results.js
const selectResult = {
  command: 'SELECT',
  rowCount: 2,
  oid: null,
  rows: [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' }
  ]
};

const updateResult = {
  command: 'UPDATE',
  rowCount: 1,
  oid: null,
  rows: []
};

const errorResult = new Error('relation "nonexistent" does not exist');
```

**Message fixtures:**
```javascript
// fixtures/messages.js
const inputMessage = {
  topic: 'test-topic',
  payload: {},
  params: ['param1']
};
```

**Location:**
- `test/fixtures/` directory alongside test files

## Coverage

**Status: No coverage tooling or targets.**

- No coverage configuration found
- No `nyc`, `c8`, or `istanbul` in dependencies
- No coverage thresholds enforced

**Recommendations:**
```bash
# If Jest were added:
npx jest --coverage         # Run tests with coverage
# Coverage report location: coverage/lcov-report/index.html
```

**Target areas for coverage (if tests were added):**
- `getField()` — all switch branches (flow, global, num, bool, default)
- `PostgresDBNode` — pool configuration with all field types
- `PostgresNode` — query execution (success, error with throw, error without throw), connection release, message output
- `PostgresListenerNode` — channel listen setup, notification handling, missing channel validation, connection error handling

## Test Types

**Unit Tests (not present):**
- Should test `getField()` utility with each field type
- Should test Mustache template rendering with various `msg` objects
- Should test error handling paths (throw vs. pass-through)
- Should verify `node.status()` is called with correct parameters

**Integration Tests (not present):**
- Should test a full flow from input message to output message with a mock database
- Should test `PostgresListenerNode` NOTIFY event handling with a mock client
- Should test connection pool lifecycle (connect → query → release)

**E2E Tests (not present):**
- Not applicable for a Node-RED contrib node — testing against a real PostgreSQL instance would be done in integration tests

## Common Patterns

**No tests exist to demonstrate patterns.**

If tests were added, recommended patterns:

**Async Testing (with Jest):**
```javascript
it('should execute query and return result', async () => {
  mockClient.query.mockResolvedValue(selectResult);
  // Use node-red-node-test-helper to load and trigger node
  const n = helper.getNode('pg-query');
  n.receive({ payload: {} });
  // Assert message emitted on output
  const output = await helper.getOutput();
  expect(output.payload).toEqual(selectResult);
});
```

**Error Testing:**
```javascript
it('should attach error to msg when throwErrors is false', async () => {
  mockClient.query.mockRejectedValue(new Error('SQL error'));
  const n = helper.getNode('pg-query');
  n.receive({ payload: {} });
  const output = await helper.getOutput();
  expect(output.error).toContain('SQL error');
});

it('should halt flow when throwErrors is true', async () => {
  mockClient.query.mockRejectedValue(new Error('SQL error'));
  const n = helper.getNode('pg-query-throw');
  n.receive({ payload: {} });
  // Verify node.error was called with msg (halts flow)
  // Verify msg is null
});
```

**Connection Release Verification:**
```javascript
it('should release client after query', async () => {
  mockClient.query.mockResolvedValue(selectResult);
  // ... trigger query ...
  expect(mockClient.release).toHaveBeenCalledTimes(1);
});

it('should release client even when query fails', async () => {
  mockClient.query.mockRejectedValue(new Error('query failed'));
  // ... trigger query ...
  expect(mockClient.release).toHaveBeenCalledTimes(1);
});
```

## CI Integration

**Current CI (Azure Pipelines):**
- `azure-pipelines.yml` triggers on `master` and `greenkeeper/*` branches
- Runs `npm i` (install) but does NOT run `npm test`
- No test execution in the pipeline
- The pipeline only builds artifacts — no quality gate beyond artifact packaging

**Gap:** CI runs `npm install` but never executes `npm test`, so even the ESLint lint check is not enforced in CI.

---

*Testing analysis: 2026-06-10*
