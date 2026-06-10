import mustache from 'mustache';
import * as crypto from 'crypto';
import { getREDNodes } from '../lib/red';
import type { PostgresNodeConfig } from '../lib/types';
import { bindNamedParams } from '../lib/params';
import { formatError } from '../lib/errorFormatter';
import { buildQueryTypes } from '../lib/typeMapping';

/**
 * Generates a unique prepared statement name from query text.
 * Uses MD5 truncated to 8 hex chars with 'ps_' prefix (max 11 chars).
 * PostgreSQL identifier limit is 63 bytes, so this is well within bounds.
 * Per D-04: auto-generated from query hash — no user-facing UI for naming.
 */
function hashQuery(text: string): string {
  return 'ps_' + crypto.createHash('md5').update(text).digest('hex').substring(0, 8);
}

export function PostgresNode(this: any, config: PostgresNodeConfig) {
  const RED = getREDNodes();
  const node = this;
  RED.createNode(node, config);
  node.topic = config.topic;
  node.config = RED.getNode(config.PostgresDBNode);

  node.on('input', (msg: any) => {
    const query = mustache.render(config.query, { msg });

    // Step A: Named parameter binding (after Mustache, before query execution)
    const useNamedParams = config.useNamedParams === true || config.useNamedParams === 'true';
    const isParamsObject = typeof msg.params === 'object' && msg.params !== null && !Array.isArray(msg.params);
    const resolvedParams = useNamedParams && isParamsObject
      ? bindNamedParams(query, msg.params)
      : (msg.params || []);

    const transactionMode = config.transactionMode === true || config.transactionMode === 'true';

    const asyncQuery = async () => {
      let client = null;
      const timeoutMs = parseInt(String(config.queryTimeout || 0), 10);
      try {
        node.debug(`Connecting to database with query: ${query}`);
        client = await node.config.pgPool.connect();
        node.log('Connected to database');

        // Step B: Set per-query statement_timeout (QUERY-03)
        if (timeoutMs > 0) {
          try {
            await client.query(`SET statement_timeout = ${timeoutMs}`);
          } catch (setErr: any) {
            node.warn(`Could not set statement_timeout: ${setErr.message}`);
          }
        }

        // Transaction mode: execute array of {query, params, output} entries atomically
        if (transactionMode && Array.isArray(msg.payload)) {
          await client.query('BEGIN');
          let outputResult: any = null;
          for (const entry of msg.payload) {
            const entryQuery = mustache.render(entry.query, { msg });
            const entryParams = useNamedParams && entry.params && typeof entry.params === 'object' && !Array.isArray(entry.params)
              ? bindNamedParams(entryQuery, entry.params)
              : (Array.isArray(entry.params) ? entry.params : []);
            const result = await client.query(entryQuery, entryParams);
            if (entry.output && !outputResult) {
              outputResult = result;
            }
          }
          await client.query('COMMIT');
          msg.payload = outputResult ? outputResult.rows : [];
          node.status({ fill: 'green', shape: 'ring', text: 'Transaction committed' });
          return;
        }

        // Step C: Prepared statement name and type mapping config (REL-02, REL-03)
        const stmtName = hashQuery(query);
        const disableAll = !(config.mapNumeric === true || config.mapNumeric === 'true') &&
                           !(config.mapTimestamptz === true || config.mapTimestamptz === 'true') &&
                           (config.parseJsonb === false || config.parseJsonb === 'false');
        const disableJsonb = config.parseJsonb === false || config.parseJsonb === 'false';
        const queryTypes = buildQueryTypes({ disableAll, disableJsonb });

        msg.payload = await client.query({
          name: stmtName,
          text: query,
          values: resolvedParams,
          types: queryTypes
        });
        node.status({
          fill: 'green',
          shape: 'ring',
          text: `Query ok. ${msg.payload.rowCount} rows returned`
        });
      } catch (err: any) {
        // Step D: Structured error handling (QUERY-02)
        const structuredError = formatError(err);

        // Transaction rollback: attempt ROLLBACK on the client before error propagation
        if (transactionMode && Array.isArray(msg.payload)) {
          try { await client.query('ROLLBACK'); } catch (rollbackErr: any) {
            node.warn(`ROLLBACK failed: ${rollbackErr.message}`);
          }
          msg.payload = undefined;
        }

        // Detect query timeout (code 57014) and format message with timeout value
        if (structuredError.code === '57014') {
          structuredError.message = `Query timeout after ${timeoutMs}ms`;
        }

        node.status({
          fill: 'red',
          shape: 'ring',
          text: `Error: ${structuredError.code || '--'} — ${structuredError.message}`
        });

        if (config.throwErrors) {
          node.error(structuredError, msg);
          msg = null;
        } else {
          node.error(structuredError);
          msg.error = structuredError;
        }
      } finally {
        if (client) {
          try {
            // Step E: Reset statement_timeout before release (QUERY-03)
            // This MUST happen before client.release() to prevent timeout leakage
            if (timeoutMs > 0) {
              try {
                await client.query('SET statement_timeout = 0');
              } catch (resetErr: any) {
                node.warn(`Could not reset statement_timeout: ${resetErr.message}`);
              }
            }
            client.release();
            node.debug('Connection released');
          } catch (releaseError: any) {
            node.error(`Error releasing connection: ${releaseError.message}`);
          }
        }
        node.send(msg);
      }
    };

    asyncQuery().catch((unhandledError: any) => {
      node.error(`Unhandled error: ${unhandledError.message}`);
    });
  });

  node.on('close', () => {
    node.status({});
  });
}
