// PostgresDBNode tests — verify the TypeScript migration preserves
// the same behavior as the original postgrestor.js:26-75

// Mock pg.Pool before loading the module
const mockPoolOn = jest.fn();
const mockPool = {
  on: mockPoolOn
};
const mockPoolConstructor: jest.Mock = jest.fn(() => mockPool) as jest.Mock;

jest.mock('pg', () => ({
  Pool: mockPoolConstructor
}));

import { PostgresDBNode } from '../PostgresDBNode';
import { setRED, getRED, getREDNodes } from '../../lib/red';

describe('PostgresDBNode', () => {
  let redRuntime: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Build a mock RED runtime matching what node-red provides
    redRuntime = {
      nodes: {
        createNode: jest.fn(),
        registerType: jest.fn(),
        getNode: jest.fn()
      }
    };
    setRED(redRuntime);
  });

  describe('RED runtime injection', () => {
    it('should store and retrieve RED runtime', () => {
      expect(getRED()).toBe(redRuntime);
      expect(getREDNodes()).toBe(redRuntime.nodes);
    });
  });

  describe('node construction', () => {
    it('should create node via RED.createNode', () => {
      const config: any = {
        name: 'test-db',
        host: '127.0.0.1',
        hostFieldType: 'str',
        port: '5432',
        portFieldType: 'num',
        database: 'postgres',
        databaseFieldType: 'str',
        ssl: 'false',
        sslFieldType: 'bool',
        max: '10',
        maxFieldType: 'num',
        min: '1',
        minFieldType: 'num',
        idle: '1000',
        idleFieldType: 'num',
        connectionTimeout: '10000',
        connectionTimeoutFieldType: 'num',
        throwErrors: 'true',
        throwErrorsFieldType: 'bool',
        user: '',
        userFieldType: 'str',
        password: '',
        passwordFieldType: 'str'
      };

      const context: any = {
        context: () => ({
          flow: { get: () => undefined },
          global: { get: () => undefined }
        }),
        debug: jest.fn(),
        credentials: { user: undefined, password: undefined }
      };

      // Simulate node construction
      const boundFn = PostgresDBNode.bind(context, config);
      boundFn();

      // Verify RED.createNode was called
      expect(redRuntime.nodes.createNode).toHaveBeenCalledWith(
        context,
        config
      );
    });

    it('should replace console.log with node.debug', () => {
      const config: any = {
        name: 'test',
        host: '127.0.0.1',
        hostFieldType: 'str',
        port: '5432',
        portFieldType: 'num',
        database: 'postgres',
        databaseFieldType: 'str',
        ssl: 'false',
        sslFieldType: 'bool',
        max: '10',
        maxFieldType: 'num',
        min: '1',
        minFieldType: 'num',
        idle: '1000',
        idleFieldType: 'num',
        connectionTimeout: '10000',
        connectionTimeoutFieldType: 'num',
        throwErrors: 'true',
        throwErrorsFieldType: 'bool',
        user: '',
        userFieldType: 'str',
        password: '',
        passwordFieldType: 'str'
      };

      const context: any = {
        context: () => ({
          flow: { get: () => undefined },
          global: { get: () => undefined }
        }),
        debug: jest.fn(),
        credentials: { user: 'u', password: 'p' }
      };

      const boundFn = PostgresDBNode.bind(context, config);
      boundFn();

      // Verify node.debug was called with throwErrors value (not console.log)
      expect(context.debug).toHaveBeenCalledWith(
        expect.stringContaining('config throwErrors')
      );
    });

    it('should create pg.Pool with resolved config values', () => {
      const config: any = {
        name: 'test',
        host: 'localhost',
        hostFieldType: 'str',
        port: '5432',
        portFieldType: 'num',
        database: 'mydb',
        databaseFieldType: 'str',
        ssl: 'false',
        sslFieldType: 'bool',
        max: '5',
        maxFieldType: 'num',
        min: '2',
        minFieldType: 'num',
        idle: '5000',
        idleFieldType: 'num',
        connectionTimeout: '3000',
        connectionTimeoutFieldType: 'num',
        throwErrors: 'true',
        throwErrorsFieldType: 'bool',
        user: '',
        userFieldType: 'str',
        password: '',
        passwordFieldType: 'str'
      };

      const context: any = {
        context: () => ({
          flow: { get: () => undefined },
          global: { get: () => undefined }
        }),
        debug: jest.fn(),
        warn: jest.fn(),
        credentials: { user: 'admin', password: 'secret' }
      };

      const boundFn = PostgresDBNode.bind(context, config);
      boundFn();

      // Verify pg.Pool was constructed
      expect(mockPoolConstructor).toHaveBeenCalledTimes(1);

      // Verify the pool config passed to pg.Pool
      const poolConfig = mockPoolConstructor.mock.calls[0]![0] as Record<string, unknown>;
      expect(poolConfig.host).toBe('localhost');
      expect(poolConfig.database).toBe('mydb');
      expect(poolConfig.port).toBe(5432);
      expect(poolConfig.max).toBe(5);
      expect(poolConfig.min).toBe(2);
      expect(poolConfig.idleTimeoutMillis).toBe(5000);
      expect(poolConfig.connectionTimeoutMillis).toBe(3000);
      expect(poolConfig.ssl).toBe(false);
      expect(poolConfig.user).toBe('admin');
      expect(poolConfig.password).toBe('secret');
    });
  });
});