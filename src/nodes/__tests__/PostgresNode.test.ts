// PostgresNode tests — verify TypeScript migration preserves pre-migration behavior
// covering success, both error paths, Mustache rendering, and client release

const mockClient = {
  query: jest.fn(),
  release: jest.fn()
};
const mockPoolConnect = jest.fn().mockResolvedValue(mockClient) as jest.Mock;
const mockPool = {
  connect: mockPoolConnect
};
const mockPoolConstructor: jest.Mock = jest.fn(() => mockPool) as jest.Mock;

jest.mock('pg', () => ({
  Pool: mockPoolConstructor
}));

const mockMustacheRender = jest.fn().mockReturnValue('SELECT 1');
jest.mock('mustache', () => ({
  render: (...args: any[]) => mockMustacheRender(...args)
}));

// Mock named params and error formatter to verify they are called correctly
const mockBindNamedParams = jest.fn().mockReturnValue([]);
jest.mock('../../lib/params', () => ({
  extractNamedParams: jest.fn().mockReturnValue(['1', '2']),
  bindNamedParams: (...args: any[]) => mockBindNamedParams(...args)
}));

const mockFormatError = jest.fn().mockReturnValue({ message: 'mock error' });
jest.mock('../../lib/errorFormatter', () => ({
  formatError: (...args: any[]) => mockFormatError(...args)
}));

import type { PostgresNodeConfig } from '../../lib/types';

import { PostgresNode } from '../PostgresNode';
import { setRED } from '../../lib/red';

describe('PostgresNode', () => {
  let redRuntime: any;
  let nodeInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockMustacheRender.mockReturnValue('SELECT 1');
    mockBindNamedParams.mockReturnValue([]);
    mockFormatError.mockReturnValue({ message: 'mock error' });

    // Build a mock RED runtime
    redRuntime = {
      nodes: {
        createNode: jest.fn(),
        registerType: jest.fn(),
        getNode: jest.fn().mockReturnValue({
          pgPool: mockPool
        })
      }
    };
    setRED(redRuntime);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function buildConfig(overrides: Partial<PostgresNodeConfig> = {}): PostgresNodeConfig {
    return {
      name: 'test-query-node',
      topic: 'test-topic',
      query: 'SELECT * FROM users WHERE id = 1',
      PostgresDBNode: 'config-node-id',
      throwErrors: false,
      useNamedParams: false,
      queryTimeout: '0',
      queryTimeoutFieldType: 'num',
      mapNumeric: false,
      mapTimestamptz: false,
      parseJsonb: false,
      ...overrides
    };
  }

  function buildContext(): any {
    nodeInstance = null;

    // To hook into the node, we use a proxy that captures:
    // - on() calls (input, close) to track event handlers
    // - send() calls
    // - error() calls
    // - status() calls
    // - debug() / log() calls
    const handlers: Record<string, (...args: any[]) => void> = {};

    const context: any = {
      debug: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      send: jest.fn(),
      status: jest.fn(),
      on: function (event: string, handler: any) {
        handlers[event] = handler;
      },
      topic: undefined,
      config: undefined
    };

    // Post-expose helpers
    (context as any)._handlers = handlers;
    (context as any)._triggerInput = function (msg: any) {
      if (handlers['input']) {
        handlers['input'](msg);
      }
    };
    (context as any)._triggerClose = function () {
      if (handlers['close']) {
        handlers['close']();
      }
    };

    return context;
  }

  async function runInputAndWait(msg: any): Promise<void> {
    nodeInstance._triggerInput(msg);
    // Advance timers to flush all microtasks and setTimeout callbacks
    await jest.runAllTimersAsync();
  }

  describe('success path', () => {
    it('should execute query and return payload on msg', async () => {
      const selectResult = { command: 'SELECT', rowCount: 2, rows: [{ id: 1 }, { id: 2 }] };
      mockClient.query.mockResolvedValue(selectResult);

      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      const inputMsg = { payload: {} };
      await runInputAndWait(inputMsg);

      expect(mockClient.query).toHaveBeenCalledWith('SELECT 1', []);
      expect(context.send).toHaveBeenCalledTimes(1);

      const outputMsg = (context.send as jest.Mock).mock.calls[0]![0];
      expect(outputMsg.payload).toBe(selectResult);
      expect(outputMsg.payload.rowCount).toBe(2);
    });

    it('should set green status on success', async () => {
      mockClient.query.mockResolvedValue({ command: 'SELECT', rowCount: 5, rows: [] });

      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({});

      expect(context.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: 'green',
          shape: 'ring',
          text: expect.stringContaining('5 rows returned')
        })
      );
    });

    it('should release client after query', async () => {
      mockClient.query.mockResolvedValue({ command: 'SELECT', rowCount: 0, rows: [] });

      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({});

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('should connect to pool from config node', async () => {
      mockClient.query.mockResolvedValue({ command: 'SELECT', rowCount: 0, rows: [] });

      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({});

      expect(redRuntime.nodes.getNode).toHaveBeenCalledWith('config-node-id');
      expect(mockPoolConnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('error + throwErrors=true', () => {
    it('should call node.error with msg to halt flow', async () => {
      mockClient.query.mockRejectedValue(new Error('SQL error'));
      mockFormatError.mockReturnValue({ message: 'SQL error' });

      const config = buildConfig({ throwErrors: true });
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      const inputMsg = { payload: { hello: 'world' } };
      await runInputAndWait(inputMsg);

      expect(context.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'SQL error' }),
        inputMsg
      );
      // When throwErrors=true, msg is set to null and node.send(null) is called
      expect(context.send).toHaveBeenCalledWith(null);
    });

    it('should release client even on error', async () => {
      mockClient.query.mockRejectedValue(new Error('fail'));

      const config = buildConfig({ throwErrors: true });
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({});

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('should set red status on error', async () => {
      mockClient.query.mockRejectedValue(new Error('boom'));
      mockFormatError.mockReturnValue({ message: 'boom', code: 'ERR' });

      const config = buildConfig({ throwErrors: true });
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({});

      expect(context.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: 'red',
          shape: 'ring',
          text: expect.stringContaining('boom')
        })
      );
    });
  });

  describe('error + throwErrors=false', () => {
    it('should attach error to msg.payload downstream', async () => {
      mockClient.query.mockRejectedValue(new Error('SQL error'));
      mockFormatError.mockReturnValue({ message: 'SQL error' });

      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({});

      // node.error called without msg (logs only)
      expect(context.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'SQL error' })
      );
      // node.error should not have a second argument (no msg arg = log only)
      const errorCalls = (context.error as jest.Mock).mock.calls;
      const msgErrorCall = errorCalls.find((call: any[]) => call.length >= 2);
      expect(msgErrorCall).toBeUndefined();

      // node.send called with msg having error
      expect(context.send).toHaveBeenCalledTimes(1);
      const outputMsg = (context.send as jest.Mock).mock.calls[0]![0];
      expect(outputMsg.error.message).toContain('SQL error');
    });

    it('should release client even when query fails', async () => {
      mockClient.query.mockRejectedValue(new Error('fail'));

      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({});

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('should send original msg properties along with error', async () => {
      mockClient.query.mockRejectedValue(new Error('oops'));
      mockFormatError.mockReturnValue({ message: 'oops' });

      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({ topic: 'my-topic', _msgid: 'abc' });

      const outputMsg = (context.send as jest.Mock).mock.calls[0]![0];
      expect(outputMsg.topic).toBe('my-topic');
      expect(outputMsg._msgid).toBe('abc');
      expect(outputMsg.error).toEqual(expect.objectContaining({ message: 'oops' }));
    });
  });

  describe('Mustache rendering', () => {
    it('should render query template with msg context', async () => {
      mockMustacheRender.mockReturnValue("SELECT 'rendered'");
      mockClient.query.mockResolvedValue({ command: 'SELECT', rowCount: 1, rows: [] });

      const config = buildConfig({ query: 'SELECT \'{{msg.greeting}}\'' });
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({ greeting: 'hello' });

      expect(mockMustacheRender).toHaveBeenCalledWith(
        "SELECT '{{msg.greeting}}'",
        expect.objectContaining({ msg: expect.objectContaining({ greeting: 'hello' }) })
      );
    });
  });

  describe('no params', () => {
    it('should call client.query with empty array when msg.params is absent', async () => {
      mockClient.query.mockResolvedValue({ command: 'SELECT', rowCount: 0, rows: [] });

      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({});

      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), []);
    });

    it('should call client.query with msg.params when present', async () => {
      mockClient.query.mockResolvedValue({ command: 'SELECT', rowCount: 0, rows: [] });

      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({ params: [42, 'hello'] });

      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), [42, 'hello']);
    });
  });

  describe('node lifecycle', () => {
    it('should clear status on close', async () => {
      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      nodeInstance._triggerClose();

      expect(context.status).toHaveBeenCalledWith({});
    });

    it('should set topic from config', () => {
      const config = buildConfig({ topic: 'my-topic' });
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();

      expect(context.topic).toBe('my-topic');
    });

    it('should create node via RED.createNode', () => {
      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();

      expect(redRuntime.nodes.createNode).toHaveBeenCalledWith(context, config);
    });
  });

  describe('connection release error', () => {
    it('should handle release error gracefully', async () => {
      mockClient.query.mockResolvedValue({ command: 'SELECT', rowCount: 0, rows: [] });
      mockClient.release.mockImplementation(() => { throw new Error('release failed'); });

      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({});

      // Release was attempted and error was caught
      expect(mockClient.release).toHaveBeenCalledTimes(1);
      // node.error should have been called with the release error
      expect(context.error).toHaveBeenCalledWith(
        expect.stringContaining('release failed')
      );
    });
  });

  describe('named parameter binding', () => {
    it('should call bindNamedParams when useNamedParams is on and msg.params is object', async () => {
      mockClient.query.mockResolvedValue({ command: 'SELECT', rowCount: 1, rows: [] });
      mockMustacheRender.mockReturnValue('SELECT * WHERE id = $1 AND name = $2');
      mockBindNamedParams.mockReturnValue([42, 'Alice']);

      const config = buildConfig({ useNamedParams: true });
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({ params: { name: 'Alice', id: 42 } });

      expect(mockBindNamedParams).toHaveBeenCalledWith(
        'SELECT * WHERE id = $1 AND name = $2',
        { name: 'Alice', id: 42 }
      );
    });

    it('should pass positional array to client.query when useNamedParams is on', async () => {
      mockClient.query.mockResolvedValue({ command: 'SELECT', rowCount: 1, rows: [] });
      mockBindNamedParams.mockReturnValue([42, 'Alice']);

      const config = buildConfig({ useNamedParams: true });
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({ params: { name: 'Alice', id: 42 } });

      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), [42, 'Alice']);
    });

    it('should pass msg.params array through unchanged when useNamedParams is falsy', async () => {
      mockClient.query.mockResolvedValue({ command: 'SELECT', rowCount: 0, rows: [] });

      const config = buildConfig({ useNamedParams: false });
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({ params: [1, 2, 3] });

      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), [1, 2, 3]);
      expect(mockBindNamedParams).not.toHaveBeenCalled();
    });

    it('should pass msg.params array through unchanged when params is array', async () => {
      mockClient.query.mockResolvedValue({ command: 'SELECT', rowCount: 0, rows: [] });

      const config = buildConfig({ useNamedParams: true });
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({ params: [10, 20] });

      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), [10, 20]);
      expect(mockBindNamedParams).not.toHaveBeenCalled();
    });

    it('should run Mustache rendering before named parameter binding', async () => {
      mockClient.query.mockResolvedValue({ command: 'SELECT', rowCount: 0, rows: [] });
      mockBindNamedParams.mockReturnValue([1]);

      const config = buildConfig({ useNamedParams: true, query: 'SELECT * FROM {{msg.table}} WHERE id = $1' });
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      // Track the call order: Mustache should be called before bindNamedParams
      const callOrder: string[] = [];
      mockMustacheRender.mockImplementation(() => {
        callOrder.push('mustache');
        return 'SELECT * FROM users WHERE id = $1';
      });
      mockBindNamedParams.mockImplementation(() => {
        callOrder.push('bindNamedParams');
        return [1];
      });

      await runInputAndWait({ table: 'users', params: { id: 1 } });

      expect(callOrder).toEqual(['mustache', 'bindNamedParams']);
    });
  });

  describe('structured error handling', () => {
    it('should call formatError with pg-style error on query failure', async () => {
      const pgErr = new Error('relation does not exist') as any;
      pgErr.code = '42P01';
      pgErr.detail = 'Relation users not found';
      pgErr.constraint = 'users_pkey';
      pgErr.table = 'users';
      mockClient.query.mockRejectedValue(pgErr);

      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({});

      expect(mockFormatError).toHaveBeenCalledWith(pgErr);
    });

    it('should set msg.error with structured error fields when throwErrors=false', async () => {
      const pgErr = new Error('dup key') as any;
      pgErr.code = '23505';
      pgErr.detail = 'Key (id)=(1) already exists.';
      pgErr.constraint = 'users_pkey';
      pgErr.table = 'users';
      mockClient.query.mockRejectedValue(pgErr);
      mockFormatError.mockReturnValue({
        message: 'dup key',
        code: '23505',
        detail: 'Key (id)=(1) already exists.',
        constraint: 'users_pkey',
        table: 'users'
      });

      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({});

      const outputMsg = (context.send as jest.Mock).mock.calls[0]![0];
      expect(outputMsg.error.code).toBe('23505');
      expect(outputMsg.error.detail).toBe('Key (id)=(1) already exists.');
      expect(outputMsg.error.constraint).toBe('users_pkey');
      expect(outputMsg.error.table).toBe('users');
    });

    it('should preserve dual-path error handling with structured errors (throwErrors=true)', async () => {
      const pgErr = new Error('fail') as any;
      pgErr.code = '42P01';
      pgErr.detail = 'detail text';
      mockClient.query.mockRejectedValue(pgErr);
      mockFormatError.mockReturnValue({
        message: 'fail',
        code: '42P01',
        detail: 'detail text'
      });

      const config = buildConfig({ throwErrors: true });
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      const inputMsg = { payload: 'test' };
      await runInputAndWait(inputMsg);

      // node.error called with structuredError and msg (halt flow)
      expect(context.error).toHaveBeenCalledWith(
        expect.objectContaining({ code: '42P01' }),
        inputMsg
      );
      expect(context.send).toHaveBeenCalledWith(null);
    });

    it('should preserve dual-path error handling with structured errors (throwErrors=false)', async () => {
      const pgErr = new Error('fail') as any;
      pgErr.code = '42P01';
      pgErr.detail = 'detail text';
      mockClient.query.mockRejectedValue(pgErr);
      mockFormatError.mockReturnValue({
        message: 'fail',
        code: '42P01',
        detail: 'detail text'
      });

      const config = buildConfig({ throwErrors: false });
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({});

      // node.error called with structuredError only (no second arg)
      expect(context.error).toHaveBeenCalledWith(
        expect.objectContaining({ detail: 'detail text' })
      );
      // msg.error has structured error
      const outputMsg = (context.send as jest.Mock).mock.calls[0]![0];
      expect(outputMsg.error).toEqual(expect.objectContaining({ code: '42P01' }));
    });

    it('should detect query timeout errors (code 57014) and format accordingly', async () => {
      const timeoutErr = new Error('canceling statement due to statement timeout') as any;
      timeoutErr.code = '57014';
      timeoutErr.detail = '';
      mockClient.query.mockRejectedValue(timeoutErr);
      mockFormatError.mockReturnValue({
        message: 'Query timeout after 5000ms',
        code: '57014'
      });

      const config = buildConfig({ queryTimeout: '5000' });
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({});

      expect(mockFormatError).toHaveBeenCalledWith(timeoutErr);
    });
  });

  describe('query timeout', () => {
    it('should not set statement_timeout when queryTimeout is 0', async () => {
      mockClient.query.mockResolvedValue({ command: 'SELECT', rowCount: 0, rows: [] });

      const config = buildConfig({ queryTimeout: '0' });
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({});

      // Only the main query should be called, no SET statement_timeout
      const queryCalls = mockClient.query.mock.calls.filter(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('statement_timeout')
      );
      expect(queryCalls.length).toBe(0);
    });

    it('should call SET statement_timeout when queryTimeout > 0', async () => {
      mockClient.query.mockResolvedValue({ command: 'SELECT', rowCount: 0, rows: [] });

      const config = buildConfig({ queryTimeout: '5000' });
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({});

      const setCalls = mockClient.query.mock.calls.filter(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('statement_timeout')
      );
      expect(setCalls.length).toBe(2); // SET + RESET
      expect(setCalls[0]![0]).toBe('SET statement_timeout = 5000');
    });

    it('should reset statement_timeout to 0 in finally block', async () => {
      mockClient.query.mockResolvedValue({ command: 'SELECT', rowCount: 0, rows: [] });

      const config = buildConfig({ queryTimeout: '5000' });
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({});

      const setCalls = mockClient.query.mock.calls.filter(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('statement_timeout')
      );
      expect(setCalls.length).toBe(2);
      expect(setCalls[1]![0]).toBe('SET statement_timeout = 0');
    });

    it('should call client.release() even if SET statement_timeout reset fails', async () => {
      // Main query succeeds, but reset fails
      mockClient.query
        .mockResolvedValueOnce({}) // SET statement_timeout = 5000
        .mockResolvedValueOnce({ command: 'SELECT', rowCount: 0, rows: [] }) // main query
        .mockRejectedValueOnce(new Error('no permission')); // SET statement_timeout = 0 fails

      const config = buildConfig({ queryTimeout: '5000' });
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({});

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('should proceed with query if SET statement_timeout fails (e.g., permission denied)', async () => {
      // SET fails, but query should still execute
      mockClient.query
        .mockRejectedValueOnce(new Error('permission denied')) // SET fails
        .mockResolvedValueOnce({ command: 'SELECT', rowCount: 5, rows: [] }); // query succeeds

      const config = buildConfig({ queryTimeout: '5000' });
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({});

      // Query still executed
      const queryCalls = mockClient.query.mock.calls.filter(
        (call: any[]) => typeof call[0] === 'string' && !call[0].includes('statement_timeout')
      );
      expect(queryCalls.length).toBe(1);
      // Status should be green (query succeeded)
      expect(context.status).toHaveBeenCalledWith(
        expect.objectContaining({ fill: 'green' })
      );
    });
  });
});