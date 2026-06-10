// typeMapping tests — verify registerTypeParsers registers pg type parsers
// and buildQueryTypes builds per-query opt-out config

const mockSetTypeParser = jest.fn();
const mockGetTypeParser = jest.fn().mockReturnValue((val: string) => val);

jest.mock('pg', () => ({
  types: {
    setTypeParser: mockSetTypeParser,
    getTypeParser: mockGetTypeParser,
    builtins: {
      NUMERIC: 1700,
      INT8: 20,
      TIMESTAMPTZ: 1184,
    },
  },
}));

// Mock parseFloat/parseInt to verify they are used as parsers
const originalParseFloat = global.parseFloat;
const originalParseInt = global.parseInt;

import { registerTypeParsers, buildQueryTypes } from '../typeMapping';

describe('registerTypeParsers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call setTypeParser for NUMERIC (OID 1700) with parseFloat', () => {
    registerTypeParsers();

    expect(mockSetTypeParser).toHaveBeenCalledWith(1700, parseFloat);
  });

  it('should call setTypeParser for INT8 (OID 20) with parseInt', () => {
    registerTypeParsers();

    expect(mockSetTypeParser).toHaveBeenCalledWith(20, parseInt);
  });

  it('should call setTypeParser for TIMESTAMPTZ (OID 1184) with a function', () => {
    registerTypeParsers();

    const timestamptzCall = mockSetTypeParser.mock.calls.find(
      (call: any[]) => call[0] === 1184
    );

    expect(timestamptzCall).toBeDefined();
    expect(typeof timestamptzCall![1]).toBe('function');
  });

  it('should register exactly 3 type parsers', () => {
    registerTypeParsers();

    expect(mockSetTypeParser).toHaveBeenCalledTimes(3);
  });
});

describe('buildQueryTypes', () => {
  it('should return undefined when all type mapping is enabled (use pool-level parsers)', () => {
    const result = buildQueryTypes({ disableAll: false, disableJsonb: false });

    expect(result).toBeUndefined();
  });

  it('should return identity parser when disableAll is true', () => {
    const result = buildQueryTypes({ disableAll: true, disableJsonb: false });

    expect(result).toBeDefined();
    expect(typeof result!.getTypeParser).toBe('function');

    // Identity parser: input string should be returned as-is
    const identityParser = result!.getTypeParser(1700, 'text');
    expect(identityParser('3.14')).toBe('3.14');
    expect(identityParser('hello')).toBe('hello');
  });

  it('should override only JSONB when disableJsonb is true', () => {
    const result = buildQueryTypes({ disableAll: false, disableJsonb: true });

    expect(result).toBeDefined();
    expect(typeof result!.getTypeParser).toBe('function');

    // When OID is 3807 (JSONB), should return identity parser
    const jsonbParser = result!.getTypeParser(3807, 'binary');
    expect(jsonbParser('{"a":1}')).toBe('{"a":1}');

    // When OID is not 3807, should delegate to pg.types.getTypeParser
    // Verify getTypeParser was called for non-JSONB OIDs
    mockGetTypeParser.mockClear();
    const nonJsonbParser = result!.getTypeParser(1700, 'text');
    expect(mockGetTypeParser).toHaveBeenCalledWith(1700, 'text');
    expect(typeof nonJsonbParser).toBe('function');
  });
});

describe('TIMESTAMPTZ parser behavior', () => {
  it('should convert a valid date string to ISO 8601 format', () => {
    registerTypeParsers();

    // Find the TIMESTAMPTZ parser that was registered
    const timestamptzCall = mockSetTypeParser.mock.calls.find(
      (call: any[]) => call[0] === 1184
    );
    expect(timestamptzCall).toBeDefined();

    const parser = timestamptzCall![1] as (val: string) => string;

    // The parser uses new Date(val).toISOString()
    const result = parser('2024-06-15T14:30:00Z');
    expect(result).toBe('2024-06-15T14:30:00.000Z');
  });
});

describe('NUMERIC parser behavior', () => {
  it('should convert "3.14" to the number 3.14', () => {
    registerTypeParsers();

    // Find the NUMERIC parser that was registered
    const numericCall = mockSetTypeParser.mock.calls.find(
      (call: any[]) => call[0] === 1700
    );
    expect(numericCall).toBeDefined();

    const parser = numericCall![1] as (val: string) => number;

    // The parser is parseFloat
    const result = parser('3.14');
    expect(result).toBe(3.14);
    expect(typeof result).toBe('number');
  });
});
