// PostgresListenerNode tests — verify TypeScript migration preserves pre-migration behavior
// covering channel validation, LISTEN setup, notification handling, close cleanup (BUG-02),
// UNLISTEN error resilience, and connect failure

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
  on: jest.fn()
};
const mockPoolConnect = jest.fn().mockResolvedValue(mockClient) as jest.Mock;
const mockPool = {
  connect: mockPoolConnect
};

jest.mock('pg', () => ({
  Pool: jest.fn(() => mockPool)
}));

import type { PostgresListenerNodeConfig } from '../../lib/types';

import { PostgresListenerNode } from '../PostgresListenerNode';
import { setRED } from '../../lib/red';

describe('PostgresListenerNode', () => {
  let redRuntime: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockClient.query.mockResolvedValue({});
    mockClient.release.mockReturnValue(undefined);
    mockPoolConnect.mockResolvedValue(mockClient);

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

  function buildConfig(overrides: Partial<PostgresListenerNodeConfig> = {}): PostgresListenerNodeConfig {
    return {
      name: 'test-listener',
      channel: 'test_channel',
      PostgresDBNode: 'config-node-id',
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

    // Post-expose helpers
    (context as any)._handlers = handlers;
    (context as any)._triggerClose = function () {
      if (handlers['close']) {
        return handlers['close']();
      }
    };
    // Helper to trigger a notification through the registered handler
    (context as any)._triggerNotification = function (channel: string, payload: string) {
      // The notification handler is registered via client.on('notification', cb)
      // We need to find the callback and invoke it
      const onCalls = (mockClient.on as jest.Mock).mock.calls;
      for (const call of onCalls) {
        if (call[0] === 'notification') {
          call[1]({ channel, payload });
        }
      }
    };

    return context;
  }

  async function flushPromises(): Promise<void> {
    await jest.runAllTimersAsync();
  }

  describe('channel validation', () => {
    it('should set red status and return early when channel is empty', () => {
      const config = buildConfig({ channel: '' });
      const context = buildContext();
      const boundFn = PostgresListenerNode.bind(context, config);
      boundFn();
      
      expect(context.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: 'red',
          shape: 'ring',
          text: 'Channel is required'
        })
      );
      // pool.connect should NOT be called
      expect(mockPoolConnect).not.toHaveBeenCalled();
    });
  });

  describe('LISTEN setup', () => {
    it('should connect to pool and set up LISTEN on the channel', async () => {
      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresListenerNode.bind(context, config);
      boundFn();
      
      await flushPromises();

      expect(mockPoolConnect).toHaveBeenCalledTimes(1);
      expect(mockClient.query).toHaveBeenCalledWith('LISTEN test_channel');
      expect(mockClient.on).toHaveBeenCalledWith('notification', expect.any(Function));
    });

    it('should set green status for valid channel', () => {
      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresListenerNode.bind(context, config);
      boundFn();
      
      expect(context.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: 'green',
          shape: 'ring',
          text: 'Listening on channel test_channel'
        })
      );
    });

    it('should log LISTEN setup completion', async () => {
      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresListenerNode.bind(context, config);
      boundFn();
      
      await flushPromises();

      expect(context.log).toHaveBeenCalledWith('Listening on channel test_channel');
    });

    it('should handle LISTEN query error', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('LISTEN failed'));

      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresListenerNode.bind(context, config);
      boundFn();
      
      await flushPromises();

      expect(context.error).toHaveBeenCalledWith(
        expect.stringContaining('LISTEN failed')
      );
    });
  });

  describe('notification handling', () => {
    it('should forward NOTIFY payload as msg with channel and payload', async () => {
      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresListenerNode.bind(context, config);
      boundFn();
      
      await flushPromises();

      // Trigger a notification
      context._triggerNotification('test_channel', '{"key":"val"}');

      expect(context.send).toHaveBeenCalledWith({
        channel: 'test_channel',
        payload: '{"key":"val"}'
      });
    });

    it('should log notification receipt', async () => {
      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresListenerNode.bind(context, config);
      boundFn();
      
      await flushPromises();

      context._triggerNotification('test_channel', 'hello');

      expect(context.log).toHaveBeenCalledWith(
        expect.stringContaining('Notification received on channel test_channel')
      );
    });
  });

  describe('BUG-02 — close handler releases client', () => {
    it('should trigger UNLISTEN and release client on close', async () => {
      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresListenerNode.bind(context, config);
      boundFn();
      
      await flushPromises();

      // Reset mocks to only track close behavior
      mockClient.query.mockClear();
      mockClient.release.mockClear();
      mockClient.query.mockResolvedValue({});

      await context._triggerClose();

      expect(mockClient.query).toHaveBeenCalledWith('UNLISTEN test_channel');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('should clear status on close', async () => {
      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresListenerNode.bind(context, config);
      boundFn();
      
      await flushPromises();

      await context._triggerClose();

      expect(context.status).toHaveBeenCalledWith({});
    });
  });

  describe('BUG-02 — UNLISTEN error resilience', () => {
    it('should still release client when UNLISTEN fails', async () => {
      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresListenerNode.bind(context, config);
      boundFn();
      
      await flushPromises();

      // Make UNLISTEN fail but release succeed
      mockClient.query.mockClear();
      mockClient.release.mockClear();
      mockClient.query.mockRejectedValue(new Error('UNLISTEN failed'));

      await context._triggerClose();

      // node.warn should have been called for the UNLISTEN error
      expect(context.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error during UNLISTEN')
      );
      // Release should still have been called
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('should handle release error gracefully', async () => {
      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresListenerNode.bind(context, config);
      boundFn();
      
      await flushPromises();

      mockClient.query.mockClear();
      mockClient.release.mockClear();
      mockClient.query.mockResolvedValue({});
      mockClient.release.mockImplementation(() => { throw new Error('release failed'); });

      await context._triggerClose();

      expect(context.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error releasing listener client')
      );
    });
  });

  describe('connect error', () => {
    it('should call node.error on connection failure', async () => {
      mockPoolConnect.mockRejectedValue(new Error('connection refused'));

      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresListenerNode.bind(context, config);
      boundFn();
      
      await flushPromises();

      expect(context.error).toHaveBeenCalledWith(
        expect.stringContaining('connection refused')
      );
    });
  });

  describe('node lifecycle', () => {
    it('should create node via RED.createNode', () => {
      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresListenerNode.bind(context, config);
      boundFn();

      expect(redRuntime.nodes.createNode).toHaveBeenCalledWith(context, config);
    });

    it('should reference config node via RED.getNode', () => {
      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresListenerNode.bind(context, config);
      boundFn();

      expect(redRuntime.nodes.getNode).toHaveBeenCalledWith('config-node-id');
    });

    it('should not call send or error when pool.connect has not resolved yet', () => {
      const config = buildConfig();
      const context = buildContext();
      const boundFn = PostgresListenerNode.bind(context, config);
      boundFn();
      
      // At this point, promises have not resolved, so no send/error should have happened
      expect(context.send).not.toHaveBeenCalled();
      expect(context.error).not.toHaveBeenCalledWith(expect.stringContaining('connection'));
    });
  });
});
