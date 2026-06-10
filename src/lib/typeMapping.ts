/**
 * Type mapping utility for PostgreSQL result type conversion.
 * Full implementation in plan 02-03.
 * Stub created for plan 02-01 to unblock pool creation import.
 */

/**
 * Register global type parsers for PostgreSQL result type mapping.
 * NUMERIC -> number, INT8 -> number, TIMESTAMPTZ -> ISO string.
 * Currently a no-op — full registration comes in plan 02-03.
 */
export function registerTypeParsers(): void {
  // No-op stub — type parsers registered in plan 02-03
}

/**
 * Build per-query types config for opt-out of type mapping.
 * Currently returns undefined — full implementation in plan 02-03.
 */
export function buildQueryTypes(disableTypeMapping: boolean): any {
  // No-op stub — per-query types config in plan 02-03
  return undefined;
}
