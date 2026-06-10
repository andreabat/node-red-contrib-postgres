import * as pg from 'pg';
import { getREDNodes } from '../lib/red';
import type { PostgresListenerNodeConfig } from '../lib/types';

export function PostgresListenerNode(this: any, config: PostgresListenerNodeConfig) {
  const RED = getREDNodes();
  const node = this;
  RED.createNode(node, config);
  node.config = RED.getNode(config.PostgresDBNode);

  if (!config.channel) {
    node.status({
      fill: 'red',
      shape: 'ring',
      text: 'Channel is required'
    });
    return;
  } else {
    node.status({
      fill: 'green',
      shape: 'ring',
      text: `Listening on channel ${config.channel}`
    });
  }

  // BUG-02 fix: listenerClient declared at function scope (NOT inside .then())
  // so the close handler can access and release it.
  let listenerClient: pg.PoolClient | null = null;

  node.config.pgPool.connect().then((client: pg.PoolClient) => {
    listenerClient = client;

    client.on('notification', async (msg: pg.Notification) => {
      const { channel, payload } = msg;
      try {
        node.log(`Notification received on channel ${channel}`);
        const outMsg = { channel, payload };
        node.send(outMsg);
      } catch (notificationError: any) {
        node.error(`Error handling notification: ${notificationError.message}`);
      }
    });

    client.query(`LISTEN ${config.channel}`).then(() => {
      node.log(`Listening on channel ${config.channel}`);
    }).catch((err: any) => {
      node.error(`Error setting up LISTEN: ${err.message}`);
    });

  }).catch((connectionError: any) => {
    node.error(`Error connecting to database: ${connectionError.message}`);
  });

  // BUG-02 fix: close handler releases the listener client
  node.on('close', async () => {
    if (listenerClient) {
      try {
        await listenerClient.query(`UNLISTEN ${config.channel}`);
      } catch (e: any) {
        node.warn(`Error during UNLISTEN: ${e.message}`);
      }
      try {
        listenerClient.release();
      } catch (e: any) {
        node.warn(`Error releasing listener client: ${e.message}`);
      }
      listenerClient = null;
    }
    node.status({});
  });
}
