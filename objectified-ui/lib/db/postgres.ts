/**
 * Internal PostgreSQL database helper for server-side use (e.g. auth).
 * Connection settings are read from .env (POSTGRES_*).
 */

import { Pool, PoolClient } from 'pg';

const poolConfig = {
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
  user: process.env.POSTGRES_USERNAME ?? 'postgres',
  password: process.env.POSTGRES_PASSWORD ?? '',
  database: process.env.POSTGRES_DB ?? 'objectified',
};

let pool: Pool | null = null;

/**
 * Returns a shared connection pool for the objectified database.
 * Uses POSTGRES_* env vars from .env.
 */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(poolConfig);
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
