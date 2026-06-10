import mustache from 'mustache';
import { getREDNodes } from '../lib/red';
import type { PostgresNodeConfig } from '../lib/types';
import { bindNamedParams } from '../lib/params';
import { formatError } from '../lib/errorFormatter';

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

        msg.payload = await client.query(query, resolvedParams);
        node.status({
          fill: 'green',
          shape: 'ring',
          text: `Query ok. ${msg.payload.rowCount} rows returned`
        });
      } catch (err: any) {
        // Step C: Structured error handling (QUERY-02)
        const structuredError = formatError(err);

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
            // Step D: Reset statement_timeout before release (QUERY-03)
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
