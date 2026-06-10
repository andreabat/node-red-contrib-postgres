/**
 * TypeScript type definitions shared across the Node-RED PostgreSQL contrib node.
 */

export type FieldType = 'flow' | 'global' | 'num' | 'bool' | 'str' | 'env';

export interface PostgresDBNodeConfig {
  name: string;
  host: string;
  hostFieldType: string;
  port: string;
  portFieldType: string;
  database: string;
  databaseFieldType: string;
  ssl: string;
  sslFieldType: string;
  max: string;
  maxFieldType: string;
  min: string;
  minFieldType: string;
  idle: string;
  idleFieldType: string;
  connectionTimeout: string;
  connectionTimeoutFieldType: string;
  user: string;
  userFieldType: string;
  password: string;
  passwordFieldType: string;
  throwErrors: string;
  throwErrorsFieldType: string;
}

export interface PostgresNodeConfig {
  name: string;
  topic: string;
  query: string;
  PostgresDBNode: string;
  throwErrors: string;
}

export interface PoolConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  database: string;
  ssl: boolean;
  max: number;
  min: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
}

export interface NodeStatus {
  fill: string;
  shape: string;
  text: string;
}