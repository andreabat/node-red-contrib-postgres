import type { StructuredError } from './types';

/**
 * Formats a caught error into a structured error object.
 * If the error is a PostgreSQL DatabaseError (detected via duck-type check
 * for `code` + `detail` fields), extracts all available pg error fields.
 * Otherwise returns a minimal `{ message }` object.
 *
 * Uses duck-type checking (`'code' in err && 'detail' in err`) instead of
 * `instanceof DatabaseError` to avoid import coupling with pg-protocol internals.
 *
 * @param err - The caught error value (may be Error, object, string, null, etc.)
 * @returns A StructuredError with at minimum a `message` field
 */
export function formatError(err: unknown): StructuredError {
  // Duck-type check: pg DatabaseError always has both 'code' and 'detail'
  if (err && typeof err === 'object' && 'code' in err && 'detail' in err) {
    const dbErr = err as Record<string, any>;

    const result: StructuredError = {
      message: typeof dbErr.message === 'string' ? dbErr.message : String(dbErr.message || ''),
      code: dbErr.code || undefined,
      detail: dbErr.detail || undefined,
      constraint: dbErr.constraint || undefined,
      table: dbErr.table || undefined,
      schema: dbErr.schema || undefined,
      column: dbErr.column || undefined,
      severity: dbErr.severity || undefined,
      position: dbErr.position || undefined,
      dataType: dbErr.dataType || undefined,
      hint: dbErr.hint || undefined,
      where: dbErr.where || undefined,
      routine: dbErr.routine || undefined
    };

    return result;
  }

  // Fallback: non-pg error
  if (err instanceof Error) {
    return { message: err.message };
  }

  // Handle plain objects that have a message property (error-like objects)
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as Record<string, any>).message;
    return { message: typeof msg === 'string' ? msg : String(msg) };
  }

  return { message: String(err) };
}
