/**
 * Type mapping utility for PostgreSQL result type conversion.
 *
 * Registers global type parsers via pg.types.setTypeParser for:
 * - NUMERIC (OID 1700) → JavaScript number (parseFloat)
 * - INT8 / BIGINT (OID 20) → JavaScript number (parseInt)
 * - TIMESTAMPTZ (OID 1184) → ISO 8601 string
 *
 * Per RESARCH.md assumption A4: setTypeParser is global and affects all
 * pools in the Node-RED process. Per-node opt-out is available via
 * buildQueryTypes() which constructs a per-query `types` config.
 *
 * JSONB (OID 3807) is auto-parsed by pg by default — no setTypeParser
 * needed. The toggle controls whether to override with identity parser.
 */

import * as pg from 'pg';

/**
 * Register global type parsers for PostgreSQL result type mapping.
 *
 * - NUMERIC (1700) → parseFloat (number)
 * - INT8 (20) → parseInt (number)
 * - TIMESTAMPTZ (1184) → new Date(val).toISOString() (ISO 8601 string)
 *
 * Called at pool creation time from PostgresDBNode.
 */
export function registerTypeParsers(): void {
  pg.types.setTypeParser(pg.types.builtins.NUMERIC, parseFloat);
  pg.types.setTypeParser(pg.types.builtins.INT8, parseInt);
  pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (val: string) => {
    return new Date(val).toISOString();
  });
}

/**
 * Build per-query types config for opt-out of type mapping.
 *
 * @param options.disableAll - If true, all types return raw strings (identity parser).
 * @param options.disableJsonb - If true, only JSONB (OID 3807) returns raw string;
 *   other types use pool-level parsers.
 * @returns QueryConfig.types value, or undefined to use pool-level parsers.
 */
export function buildQueryTypes(options: {
  disableAll: boolean;
  disableJsonb: boolean;
}): any {
  if (options.disableAll) {
    return {
      getTypeParser: (_oid: number, _format: string) => (val: string) => val,
    };
  }

  if (options.disableJsonb) {
    return {
      getTypeParser: (oid: number, format: string) =>
        oid === 3807
          ? (val: string) => val
          : pg.types.getTypeParser(oid, format as any),
    };
  }

  return undefined;
}
