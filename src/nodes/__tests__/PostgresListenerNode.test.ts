// PostgresListenerNode tests — direct pg.Client connections, not pool

const mockClient = {
  query: jest.fn(),
  connect: jest.fn(),
  end: jest.fn(),
  on: jest.fn()
};

// Mock Client constructor that returns a fresh mockClient
const MockClient = jest.fn(function (this: any) {
  Object.assign(this, mockClient);
}) as unknown as jest.Mock & { new (): typeof mockClient };

jest.mock('pg', () => ({
  Client: MockClient,
  Pool: jest.fn(() => ({ options: { host: 'db', port: 5432, database: 'test', user: 'u', password: 'p' } }))
}));

jest.mock('pg-format', () => jest.fn((_: string, v: string) => `"${v}"`));

import type { PostgresListenerNodeConfig } from '../../lib/types';

import { PostgresListenerNode } from '../PostgresListenerNode';
import { setRED } from '../../lib/red';

describe('PostgresListenerNode', () => {
  let redRuntime: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient.query.mockResolvedValue({});
    mockClient.connect.mockResolvedValue(undefined);
    mockClient.end.mockReturnValue(undefined);

    redRuntime = {
      nodes: {
        createNode: jest.fn(),
        registerType: jest.fn(),
        getNode: jest.fn().mockReturnValue({
          pgPool: { options: { host: 'db', port: 5432, database: 'test', user: 'u', password: 'p' } }
        })
      }
    };
    setRED(redRuntime);
  });

  function buildConfig(overrides: Partial<PostgresListenerNodeConfig> = {}): PostgresListenerNodeConfig {
    return {
      name: 'test-listener',
      channel: 'test_channel',
      PostgresDBNode: 'config-node-id',
      parseNotifyJson: true,
      ...overrides
    };
  }

  function buildContext(): any {
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
      config: undefined
    };

    (context as any)._handlers = handlers;
    (context as any)._triggerClose = function () {
      if (handlers['close']) {
        return handlers['close']();
      }
    };
    (context as any)._triggerNotification = function (channel: string, payload: string) {
      const onCalls = (mockClient.on as jest.Mock).mock.calls;
      for (const call of onCalls) {
        if (call[0] === 'notification') {
          call[1]({ channel, payload });
        }
      }
    };
    (context as any)._triggerClientError = function () {
      const onCalls = (mockClient.on as jest.Mock).mock.calls;
      for (const call of onCalls) {
        if (call[0] === 'error') {
          call[1](new Error('connection error'));
        }
      }
    };

    return context;
  }

  async function flushPromises(): Promise<void> {
    await new Promise(resolve => setImmediate(resolve));
  }

  describe('channel validation', () => {
    it('should set red status and return early when channel is empty', () => {
      const config = buildConfig({ channel: '' });
      const context = buildContext();
      const boundFn = PostgresListenerNode.bind(context, config);
      boundFn();

      expect(context.status).toHaveBeenCalledWith(
        expect.objectContaining({ fill: 'red', shape: 'ring', text: 'Channel is required' })
      );
      expect(MockClient).not.toHaveBeenCalled();
    });
  });

  describe('LISTEN setup', () => {
    it('should create a direct Client and set up LISTEN on sanitized channel', async () => {
      const config = buildConfig();
      const context = buildContext();
      PostgresListenerNode.bind(context, config)();

      await flushPromises();

      expect(MockClient).toHaveBeenCalledTimes(1);
      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('LISTEN "test_channel"');
    });

    it('should set green status after successful LISTEN', async () => {
      const config = buildConfig();
      const context = buildContext();
      PostgresListenerNode.bind(context, config)();

      await flushPromises();

      expect(context.status).toHaveBeenCalledWith(
        expect.objectContaining({ fill: 'green', shape: 'ring', text: 'listening on test_channel' })
      );
    });
  });

  describe('notification handling', () => {
    it('should forward NOTIFY with parsed payload and _original', async () => {
      const config = buildConfig();
      const context = buildContext();
      PostgresListenerNode.bind(context, config)();

      await flushPromises();

      context._triggerNotification('test_channel', '{"key":"val"}');

      expect(context.send).toHaveBeenCalledWith({
        channel: 'test_channel',
        payload: { key: 'val' },
        _original: '{"key":"val"}'
      });
    });

    it('should fall back to raw string on parse failure', async () => {
      const config = buildConfig();
      const context = buildContext();
      PostgresListenerNode.bind(context, config)();

      await flushPromises();

      context._triggerNotification('test_channel', 'not-json');

      expect(context.send).toHaveBeenCalledWith({
        channel: 'test_channel',
        payload: 'not-json',
        _original: 'not-json'
      });
    });

    it('should pass raw string when parseNotifyJson is off', async () => {
      const config = buildConfig({ parseNotifyJson: false });
      const context = buildContext();
      PostgresListenerNode.bind(context, config)();

      await flushPromises();

      context._triggerNotification('test_channel', '{"key":"val"}');

      expect(context.send).toHaveBeenCalledWith({
        channel: 'test_channel',
        payload: '{"key":"val"}',
        _original: '{"key":"val"}'
      });
    });
  });

  describe('reconnection', () => {
    it('should show yellow reconnecting status after connection error', async () => {
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.query.mockResolvedValue({});

      const config = buildConfig();
      const context = buildContext();
      PostgresListenerNode.bind(context, config)();

      await flushPromises();
      expect(context.status).toHaveBeenCalledWith(
        expect.objectContaining({ fill: 'green' })
      );

      mockClient.query.mockClear();
      mockClient.query.mockResolvedValue({});

      context._triggerClientError();
      await flushPromises();

      expect(context.status).toHaveBeenCalledWith(
        expect.objectContaining({ fill: 'yellow', shape: 'ring', text: expect.stringContaining('reconnecting') })
      );
    });

    it('should stop reconnection loop when closed during backoff', async () => {
      mockClient.connect.mockRejectedValueOnce(new Error('refused'));
      mockClient.connect.mockResolvedValueOnce(undefined);

      const config = buildConfig();
      const context = buildContext();
      PostgresListenerNode.bind(context, config)();

      await flushPromises();
      await context._triggerClose();
      await flushPromises();
    });
  });

  describe('channel sanitization', () => {
    it('should use pg-format %I for channel in LISTEN', async () => {
      const config = buildConfig({ channel: 'my-channel' });
      const context = buildContext();
      PostgresListenerNode.bind(context, config)();

      await flushPromises();

      expect(mockClient.query).toHaveBeenCalledWith('LISTEN "my-channel"');
    });

    it('should use pg-format %I for channel in UNLISTEN on close', async () => {
      const config = buildConfig({ channel: 'my-channel' });
      const context = buildContext();
      PostgresListenerNode.bind(context, config)();

      await flushPromises();

      mockClient.query.mockClear();
      mockClient.query.mockResolvedValue({});

      await context._triggerClose();

      expect(mockClient.query).toHaveBeenCalledWith('UNLISTEN "my-channel"');
    });
  });

  describe('close handler', () => {
    it('should UNLISTEN and end client on close', async () => {
      const config = buildConfig();
      const context = buildContext();
      PostgresListenerNode.bind(context, config)();

      await flushPromises();

      mockClient.query.mockClear();
      mockClient.end.mockClear();
      mockClient.query.mockResolvedValue({});

      await context._triggerClose();

      expect(mockClient.query).toHaveBeenCalledWith('UNLISTEN "test_channel"');
      expect(mockClient.end).toHaveBeenCalledTimes(1);
    });

    it('should clear status on close', async () => {
      const config = buildConfig();
      const context = buildContext();
      PostgresListenerNode.bind(context, config)();

      await flushPromises();

      await context._triggerClose();

      expect(context.status).toHaveBeenCalledWith({});
    });
  });

  describe('UNLISTEN error resilience', () => {
    it('should still end client when UNLISTEN fails', async () => {
      const config = buildConfig();
      const context = buildContext();
      PostgresListenerNode.bind(context, config)();

      await flushPromises();

      mockClient.query.mockClear();
      mockClient.end.mockClear();
      mockClient.query.mockRejectedValue(new Error('UNLISTEN failed'));

      await context._triggerClose();

      expect(context.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error during UNLISTEN')
      );
      expect(mockClient.end).toHaveBeenCalledTimes(1);
    });

    it('should handle end error gracefully', async () => {
      const config = buildConfig();
      const context = buildContext();
      PostgresListenerNode.bind(context, config)();

      await flushPromises();

      mockClient.query.mockClear();
      mockClient.end.mockClear();
      mockClient.query.mockResolvedValue({});
      mockClient.end.mockImplementation(() => { throw new Error('end failed'); });

      await context._triggerClose();

      expect(context.warn).toHaveBeenCalledWith('Error closing listener client: end failed');
    });
  });

  describe('connect error', () => {
    it('should enter yellow reconnecting status on connection failure', async () => {
      mockClient.connect.mockRejectedValueOnce(new Error('connection refused'));
      mockClient.connect.mockResolvedValue(undefined);

      const config = buildConfig();
      const context = buildContext();
      PostgresListenerNode.bind(context, config)();

      await flushPromises();

      expect(context.status).toHaveBeenCalledWith(
        expect.objectContaining({ fill: 'yellow', shape: 'ring' })
      );
    });
  });

  describe('node lifecycle', () => {
    it('should create node via RED.createNode', () => {
      const config = buildConfig();
      const context = buildContext();
      PostgresListenerNode.bind(context, config)();

      expect(redRuntime.nodes.createNode).toHaveBeenCalledWith(context, config);
    });

    it('should reference config node via RED.getNode', () => {
      const config = buildConfig();
      const context = buildContext();
      PostgresListenerNode.bind(context, config)();

      expect(redRuntime.nodes.getNode).toHaveBeenCalledWith('config-node-id');
    });

    it('should not call send before listenLoop resolves', () => {
      const config = buildConfig();
      const context = buildContext();
      PostgresListenerNode.bind(context, config)();

      expect(context.send).not.toHaveBeenCalled();
    });
  });

  describe('badge states and edge cases', () => {
    it('should show green badge after successful LISTEN', async () => {
      const config = buildConfig();
      const context = buildContext();
      PostgresListenerNode.bind(context, config)();

      await flushPromises();

      expect(context.status).toHaveBeenLastCalledWith(
        expect.objectContaining({ fill: 'green', text: 'listening on test_channel' })
      );
    });

    it('should use safeChannel in UNLISTEN on close', async () => {
      const config = buildConfig({ channel: 'special_ch' });
      const context = buildContext();
      PostgresListenerNode.bind(context, config)();

      await flushPromises();

      mockClient.query.mockClear();
      mockClient.query.mockResolvedValue({});

      await context._triggerClose();

      expect(mockClient.query).toHaveBeenCalledWith('UNLISTEN "special_ch"');
    });

    it('should handle close during active LISTEN gracefully', async () => {
      const config = buildConfig();
      const context = buildContext();
      PostgresListenerNode.bind(context, config)();

      await flushPromises();

      await context._triggerClose();
      await flushPromises();

      expect(mockClient.end).toHaveBeenCalled();
      expect(context.status).toHaveBeenCalledWith({});
    });
  });
});
