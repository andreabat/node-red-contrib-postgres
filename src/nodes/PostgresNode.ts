import mustache from 'mustache';
import { getREDNodes } from '../lib/red';
import type { PostgresNodeConfig } from '../lib/types';

export function PostgresNode(this: any, config: PostgresNodeConfig) {
  const RED = getREDNodes();
  const node = this;
  RED.createNode(node, config);
  node.topic = config.topic;
  node.config = RED.getNode(config.PostgresDBNode);

  node.on('input', (msg: any) => {
    const query = mustache.render(config.query, { msg });

    const asyncQuery = async () => {
      let client = null;
      try {
        node.debug(`Connecting to database with query: ${query}`);
        client = await node.config.pgPool.connect();
        node.log('Connected to database');
        msg.payload = await client.query(query, msg.params || []);
        node.status({
          fill: 'green',
          shape: 'ring',
          text: `Query ok. ${msg.payload.rowCount} rows returned`
        });
      } catch (err: any) {
        const errorMessage = `Error executing query: ${err.message}`;
        node.status({
          fill: 'red',
          shape: 'ring',
          text: errorMessage
        });

        if (config.throwErrors) {
          node.error(errorMessage, msg);
          msg = null;
        } else {
          node.error(errorMessage);
          msg.error = errorMessage;
        }
      } finally {
        if (client) {
          try {
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