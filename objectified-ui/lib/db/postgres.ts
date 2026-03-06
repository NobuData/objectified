/**
 * Internal PostgreSQL database helper for server-side use (e.g. auth).
 * Connection settings are read from .env (POSTGRES_*).
 */

import { Pool, PoolClient } from 'pg';

const REQUIRED_POSTGRES_ENV_VARS = [
  'POSTGRES_HOST',
  'POSTGRES_PORT',
  'POSTGRES_USERNAME',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
] as const;

function getPoolConfig() {
  if (process.env.POSTGRES_URL) {
    return { connectionString: process.env.POSTGRES_URL };
  }
  const nodeEnv = process.env.NODE_ENV;
  const isDevLike =
    !nodeEnv || nodeEnv === 'development' || nodeEnv === 'test';
  if (!isDevLike) {
    const missing = REQUIRED_POSTGRES_ENV_VARS.filter(
      (name) => !process.env[name]
    );
    if (missing.length > 0) {
      throw new Error(
        `Missing required PostgreSQL environment variables: ${missing.join(
          ', '
        )}`
      );
    }
  }
  return {
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
    user: process.env.POSTGRES_USERNAME ?? 'postgres',
    password: process.env.POSTGRES_PASSWORD ?? '',
    database: process.env.POSTGRES_DB ?? 'objectified',
  };
}

let pool: Pool | null = null;

/**
 * Returns a shared connection pool for the objectified database.
 * Uses POSTGRES_* env vars from .env or POSTGRES_URL if provided.
 *
 * The pool instance is stored on globalThis to avoid creating multiple
 * pools in environments with module reloads (e.g. Next.js dev / HMR).
 */
export function getPool(): Pool {
  if (!pool) {
    const globalForPg = globalThis as typeof globalThis & {
      __OBJECTIFIED_PG_POOL__?: Pool;
    };
  
    if (!globalForPg.__OBJECTIFIED_PG_POOL__) {
      globalForPg.__OBJECTIFIED_PG_POOL__ = new Pool(getPoolConfig());
    }
  
    pool = globalForPg.__OBJECTIFIED_PG_POOL__;
  }
  return pool;
}

/**
 * Execute a query and return a single row, or null.
 * Uses the objectified schema (objectified.account, etc.).
 */
export async function queryOne<T extends Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const client = await getPool().connect();
  try {
    const result = await client.query(sql, params);
    const row = result.rows[0];
    return (row as T) ?? null;
  } finally {
    client.release();
  }
}

/**
 * Acquire a client from the pool for multiple operations (e.g. transaction).
 * Caller must release with client.release().
 */
export async function getClient(): Promise<PoolClient> {
  return getPool().connect();
}
