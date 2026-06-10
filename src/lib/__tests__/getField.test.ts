import { getField } from '../getField';

describe('getField', () => {
  let node: any;
  let flowGet: jest.Mock;
  let globalGet: jest.Mock;
  let warn: jest.Mock;

  beforeEach(() => {
    flowGet = jest.fn();
    globalGet = jest.fn();
    warn = jest.fn();
    node = {
      context: () => ({
        flow: { get: flowGet },
        global: { get: globalGet }
      }),
      warn
    };
  });

  describe('flow', () => {
    it('should return flow context value', () => {
      flowGet.mockReturnValue('flow-val');
      const result = getField(node, 'flow', 'key');
      expect(result).toBe('flow-val');
      expect(flowGet).toHaveBeenCalledWith('key');
    });
  });

  describe('global', () => {
    it('should return global context value', () => {
      globalGet.mockReturnValue('global-val');
      const result = getField(node, 'global', 'key');
      expect(result).toBe('global-val');
      expect(globalGet).toHaveBeenCalledWith('key');
    });
  });

  describe('num', () => {
    it('should parse valid numeric string', () => {
      const result = getField(node, 'num', '42');
      expect(result).toBe(42);
      expect(typeof result).toBe('number');
    });

    it('should return NaN and warn on invalid numeric string', () => {
      const result = getField(node, 'num', 'abc');
      expect(isNaN(result as number)).toBe(true);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('abc')
      );
    });

    it('should return 0 for empty string', () => {
      const result = getField(node, 'num', '');
      expect(result).toBe(0);
    });
  });

  describe('bool', () => {
    it('should parse "true" to boolean true', () => {
      const result = getField(node, 'bool', 'true');
      expect(result).toBe(true);
      expect(typeof result).toBe('boolean');
    });

    it('should parse "false" to boolean false', () => {
      const result = getField(node, 'bool', 'false');
      expect(result).toBe(false);
    });

    it('should fallback to string comparison for invalid JSON', () => {
      const result = getField(node, 'bool', 'not-json');
      expect(result).toBe(false);
    });
  });

  describe('str', () => {
    it('should return string value as-is', () => {
      const result = getField(node, 'str', 'hello');
      expect(result).toBe('hello');
    });
  });

  describe('default / undefined kind', () => {
    it('should return raw value when kind is undefined', () => {
      const result = getField(node, undefined, 'raw');
      expect(result).toBe('raw');
    });
  });

  describe('env', () => {
    it('should fall to default and return value as-is', () => {
      const result = getField(node, 'env', 'MY_ENV_VAR');
      expect(result).toBe('MY_ENV_VAR');
    });
  });
});