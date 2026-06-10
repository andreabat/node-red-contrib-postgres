import { extractNamedParams, bindNamedParams } from '../params';

describe('extractNamedParams', () => {
  it('should extract positional parameter names from a query with $1 and $2', () => {
    const result = extractNamedParams('SELECT * FROM users WHERE id = $1 AND name = $2');
    expect(result).toEqual(['1', '2']);
  });

  it('should return empty array when query has no $N references', () => {
    const result = extractNamedParams('SELECT 1');
    expect(result).toEqual([]);
  });

  it('should sort positional references numerically (not by appearance order)', () => {
    const result = extractNamedParams('SELECT $3, $1, $2');
    expect(result).toEqual(['1', '2', '3']);
  });

  it('should deduplicate repeated $N references', () => {
    const result = extractNamedParams('SELECT * WHERE id = $1 AND other_id = $1');
    expect(result).toEqual(['1']);
  });
});

describe('bindNamedParams', () => {
  it('should bind object params to positional values by key insertion order', () => {
    const result = bindNamedParams(
      'SELECT * WHERE id = $1 AND name = $2',
      { name: 'Alice', id: 42 }
    );
    // Object.keys insertion order: ["name", "id"]
    // $1 → "name" → "Alice", $2 → "id" → 42
    expect(result).toEqual(['Alice', 42]);
  });

  it('should return undefined for out-of-range positional key', () => {
    // Query has $1 and $2 but params only has 1 key —
    // $2 maps beyond Object.keys giving undefined
    const result = bindNamedParams(
      'SELECT * WHERE id = $1 AND name = $2',
      { name: 'Alice' }
    );
    expect(result).toEqual(['Alice', undefined]);
  });

  it('should ignore extra params keys beyond $N count', () => {
    const result = bindNamedParams(
      'SELECT * WHERE id = $1 AND name = $2',
      { id: 42, name: 'Alice', extra: true }
    );
    // Object.keys: ["id", "name", "extra"]
    // $1 → "id" → 42, $2 → "name" → "Alice"
    // "extra" is beyond max $N and is ignored
    expect(result).toEqual([42, 'Alice']);
  });

  it('should handle params with numeric-looking keys via insertion order', () => {
    const result = bindNamedParams(
      'SELECT * WHERE id = $1',
      { 0: 'Alice', 1: 'Bob' } as any
    );
    // Object.keys for numeric keys: ["0", "1"]
    expect(result[0]).toBe('Alice');
  });
});
