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

      const config = buildConfig({ throwErrors: true });
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      const inputMsg = { payload: { hello: 'world' } };
      await runInputAndWait(inputMsg);

      expect(context.error).toHaveBeenCalledWith(
        expect.stringContaining('SQL error'),
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

      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({});

      // node.error called without msg (logs only)
      expect(context.error).toHaveBeenCalledWith(
        expect.stringContaining('SQL error')
      );
      // node.error should not have a second argument (no msg arg = log only)
      const errorCalls = (context.error as jest.Mock).mock.calls;
      const msgErrorCall = errorCalls.find((call: any[]) => call.length >= 2);
      expect(msgErrorCall).toBeUndefined();

      // node.send called with msg having error
      expect(context.send).toHaveBeenCalledTimes(1);
      const outputMsg = (context.send as jest.Mock).mock.calls[0]![0];
      expect(outputMsg.error).toContain('SQL error');
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

      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresNode.bind(context, config);
      boundFn();
      nodeInstance = context;

      await runInputAndWait({ topic: 'my-topic', _msgid: 'abc' });

      const outputMsg = (context.send as jest.Mock).mock.calls[0]![0];
      expect(outputMsg.topic).toBe('my-topic');
      expect(outputMsg._msgid).toBe('abc');
      expect(outputMsg.error).toContain('oops');
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
});