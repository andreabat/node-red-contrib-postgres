import { formatError } from '../errorFormatter';

describe('formatError', () => {
  describe('PostgreSQL DatabaseError', () => {
    it('should extract all fields from a pg-style error object', () => {
      const pgError = {
        message: 'relation "users" does not exist',
        code: '42P01',
        detail: 'Relation users not found in schema',
        constraint: 'users_pkey',
        table: 'users',
        schema: 'public',
        column: 'id',
        severity: 'ERROR',
        position: '15',
        dataType: undefined,
        hint: 'Check the table name',
        where: undefined,
        routine: 'parse_relation'
      };

      const result = formatError(pgError);

      expect(result.message).toBe('relation "users" does not exist');
      expect(result.code).toBe('42P01');
      expect(result.detail).toBe('Relation users not found in schema');
      expect(result.constraint).toBe('users_pkey');
      expect(result.table).toBe('users');
      expect(result.schema).toBe('public');
      expect(result.column).toBe('id');
      expect(result.severity).toBe('ERROR');
      expect(result.position).toBe('15');
      // dataType was undefined in input — should not appear in output
      expect(result.dataType).toBeUndefined();
      expect(result.hint).toBe('Check the table name');
      // where was undefined in input — should not appear in output
      expect(result.where).toBeUndefined();
      expect(result.routine).toBe('parse_relation');
    });

    it('should detect pg error via duck-type check (code + detail)', () => {
      const pgError = {
        message: 'duplicate key value',
        code: '23505',
        detail: 'Key (id)=(1) already exists.',
        constraint: 'users_pkey',
        table: 'users',
        schema: 'public'
      };

      const result = formatError(pgError);

      expect(result.code).toBe('23505');
      expect(result.detail).toBe('Key (id)=(1) already exists.');
      expect(result.constraint).toBe('users_pkey');
      expect(result.message).toBe('duplicate key value');
    });

    it('should detect query timeout error (code 57014)', () => {
      const timeoutError = {
        message: 'canceling statement due to statement timeout',
        code: '57014',
        detail: undefined,
        constraint: undefined,
        table: undefined,
        schema: undefined,
        severity: 'ERROR'
      };

      const result = formatError(timeoutError);

      expect(result.code).toBe('57014');
      expect(result.message).toContain('statement timeout');
    });
  });

  describe('generic errors', () => {
    it('should format a standard Error object with just message', () => {
      const result = formatError(new Error('something broke'));

      expect(result.message).toBe('something broke');
      // No pg-specific fields on generic errors
      expect(result.code).toBeUndefined();
      expect(result.detail).toBeUndefined();
    });

    it('should format a non-Error thrown value as string message', () => {
      const result = formatError('raw string error');

      expect(result.message).toBe('raw string error');
      expect(result.code).toBeUndefined();
    });

    it('should handle null input gracefully', () => {
      const result = formatError(null);

      // String(null) → "null"
      expect(result.message).toBe('null');
    });

    it('should handle undefined input gracefully', () => {
      const result = formatError(undefined);

      // String(undefined) → "undefined"
      expect(result.message).toBe('undefined');
    });

    it('should handle object with code but no detail (not a pg error)', () => {
      const customError = { message: 'custom', code: 'CUSTOM' };
      const result = formatError(customError);

      expect(result.message).toBe('custom');
      // Duck-type check requires BOTH code AND detail for pg detection
      expect(result.code).toBeUndefined();
    });
  });
});
