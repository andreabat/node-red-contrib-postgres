import * as pg from 'pg';
import format from 'pg-format';
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
  }

  const safeChannel = format('%I', config.channel);
  let listenerClient: pg.PoolClient | null = null;
  let closed = false;

  const parseNotifyJson = config.parseNotifyJson === undefined || config.parseNotifyJson === true || config.parseNotifyJson === 'true';

  async function         listenLoop(): Promise<void> {
    let attempt = 0;

    while (!closed) {
      try {
        listenerClient = await node.config.pgPool.connect();

        await listenerClient!.query(`LISTEN ${safeChannel}`);
        attempt = 0;

        node.status({
          fill: 'green', shape: 'ring',
          text: `listening on ${config.channel}`
        });

        // pg PoolClient may not proxy 'notification' from the underlying
        // Client. Access _client directly to guarantee delivery.
        const eventSource = (listenerClient as any)._client || listenerClient;
        eventSource.on('notification', (msg: pg.Notification) => {
          node.log(`NOTIFY received on channel '${msg.channel}': ${msg.payload}`);
          let payload: any = msg.payload;
          if (parseNotifyJson) {
            try { payload = JSON.parse(msg.payload || ''); } catch { /* fall through to raw string */ }
          }
          node.send({ channel: msg.channel, payload, _original: msg.payload });
        });

        // Block until connection drops. PoolClient proxies the underlying
        // Client's 'error' event, which fires on TCP reset, timeout, or
        // server restart. We do NOT listen for 'end' — PoolClient emits
        // 'end' during normal pool operations (release/internal cleanup),
        // which would prematurely kill the listenLoop.
        await new Promise<void>((_, reject) => {
          listenerClient!.on('error', reject);
        });
      } catch (err: any) {
        if (closed) break;

        const delay = Math.min(30000, 500 * Math.pow(2, attempt)) * Math.random();
        attempt++;

        node.status({
          fill: 'yellow', shape: 'ring',
          text: `reconnecting (attempt ${attempt})`
        });

        if (listenerClient) {
          try { listenerClient.release(); } catch { /* release best-effort */ }
          listenerClient = null;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    node.status({ fill: 'red', shape: 'ring', text: 'disconnected' });
  }

  listenLoop().catch((err: any) => {
    node.error(`Listener loop fatal error: ${err.message}`);
  });

  node.on('close', async () => {
    closed = true;
    if (listenerClient) {
      try {
        await listenerClient.query(`UNLISTEN ${safeChannel}`);
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
