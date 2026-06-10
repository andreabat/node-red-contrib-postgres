/**
 * TypeScript type definitions shared across the Node-RED PostgreSQL contrib node.
 */

export type FieldType = 'flow' | 'global' | 'num' | 'bool' | 'str' | 'env';

export type SslMode = 'disable' | 'require' | 'verify-ca' | 'verify-full';

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
  sslmode: string;
  sslmodeFieldType: string;
  databaseUrl: string;
  databaseUrlFieldType: string;
  useDatabaseUrl: string;
  statementTimeout: string;
  statementTimeoutFieldType: string;
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
  throwErrors: string | boolean;
  useNamedParams: string | boolean;
  queryTimeout: string;
  queryTimeoutFieldType: string;
  mapNumeric: string | boolean;
  mapTimestamptz: string | boolean;
  parseJsonb: string | boolean;
  transactionMode: string | boolean;
}

export interface TransactionQuery {
  query: string;
  params?: Record<string, any>;
  output?: boolean;
}

export interface PostgresListenerNodeConfig {
  name: string;
  channel: string;
  PostgresDBNode: string;
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

export interface StructuredError {
  message: string;
  code?: string;
  detail?: string;
  constraint?: string;
  table?: string;
  schema?: string;
  column?: string;
  severity?: string;
  position?: string;
  dataType?: string;
  hint?: string;
  where?: string;
  routine?: string;
}
