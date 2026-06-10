import * as pg from 'pg';
import { getREDNodes } from '../lib/red';
import { getField } from '../lib/getField';
import type { PostgresDBNodeConfig } from '../lib/types';

export function PostgresDBNode(this: any, n: PostgresDBNodeConfig) {
  const RED = getREDNodes();
  const node = this;
  RED.createNode(node, n);
  node.name = n.name;
  node.host = n.host;
  node.hostFieldType = n.hostFieldType;
  node.port = n.port;
  node.portFieldType = n.portFieldType;
  node.database = n.database;
  node.databaseFieldType = n.databaseFieldType;
  node.ssl = n.ssl;
  node.sslFieldType = n.sslFieldType;
  node.max = n.max;
  node.maxFieldType = n.maxFieldType;
  node.min = n.min;
  node.minFieldType = n.minFieldType;
  node.idle = n.idle;
  node.idleFieldType = n.idleFieldType;
  node.user = n.user;
  node.userFieldType = n.userFieldType;
  node.password = n.password;
  node.passwordFieldType = n.passwordFieldType;

  node.connectionTimeout = n.connectionTimeout;
  node.connectionTimeoutFieldType = n.connectionTimeoutFieldType;
  node.throwErrors = n.throwErrors;
  node.throwErrorsFieldType = n.throwErrorsFieldType;
  node.debug(`config throwErrors: ${node.throwErrors}`);

  this.pgPool = new pg.Pool({
    user: getField(node, n.userFieldType as any, node.credentials.user) as string | undefined,
    password: getField(node, n.passwordFieldType as any, node.credentials.password) as string | undefined,
    host: getField(node, n.hostFieldType as any, n.host) as string,
    port: getField(node, n.portFieldType as any, n.port) as number,
    database: getField(node, n.databaseFieldType as any, n.database) as string,
    ssl: getField(node, n.sslFieldType as any, n.ssl) as boolean,
    max: getField(node, n.maxFieldType as any, n.max) as number,
    min: getField(node, n.minFieldType as any, n.min) as number,
    idleTimeoutMillis: getField(node, n.idleFieldType as any, n.idle) as number,
    connectionTimeoutMillis: getField(node, n.connectionTimeoutFieldType as any, n.connectionTimeout) as number
  });
}