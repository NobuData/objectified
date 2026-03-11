/**
 * Internal credential verification against objectified.account.
 * Uses the Postgres helper (lib/db/postgres) — no external REST.
 */

import { compare } from 'bcryptjs';
import { queryOne } from '@lib/db/postgres';

export interface VerifiedUser {
  id: string;
  name: string;
  email: string;
  is_administrator?: boolean;
}

/**
 * Check whether the given account is an administrator in at least one
 * active tenant. Mirrors the REST API's ``_is_platform_admin`` logic.
 */
async function isAdministratorInAnyTenant(accountId: string): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM objectified.tenant_account ta
       JOIN objectified.tenant t ON t.id = ta.tenant_id
       WHERE ta.account_id = $1
         AND ta.access_level = 'administrator'
         AND ta.deleted_at IS NULL
         AND t.deleted_at IS NULL
     ) AS exists`,
    [accountId]
  );
  return row?.exists === true;
}

/**
 * Look up account by email, verify password with bcrypt, and return user if valid.
 * Only considers non-deleted, enabled accounts.
 */
export async function verifyCredentials(
  email: string,
  password: string
): Promise<VerifiedUser | null> {
  if (!email?.trim() || !password) {
    return null;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPassword = typeof password === 'string' ? password.trim() : '';
  if (!normalizedPassword) {
    return null;
  }
  const row = await queryOne<{ id: string; name: string; email: string; password: string }>(
    `SELECT id, name, email, password
     FROM objectified.account
     WHERE LOWER(email) = $1 AND deleted_at IS NULL AND enabled = true`,
    [normalizedEmail]
  );

  if (!row?.password) {
    return null;
  }

  const storedHash = String(row.password).trim();
  if (!storedHash || !storedHash.startsWith('$2')) {
    return null;
  }

  let match: boolean;
  try {
    // Compare submitted password with stored bcrypt hash (constant-time, secure)
    match = await compare(normalizedPassword, storedHash);
  } catch {
    return null;
  }

  if (!match) {
    return null;
  }

  const isAdmin = await isAdministratorInAnyTenant(row.id);
  return { id: row.id, name: row.name, email: row.email, is_administrator: isAdmin };
}

/**
 * Look up account by email only (for SSO providers such as GitHub).
 * Returns user if the account exists, is enabled, and not deleted.
 */
export async function getAccountByEmail(
  email: string
): Promise<VerifiedUser | null> {
  if (!email?.trim()) {
    return null;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const row = await queryOne<{ id: string; name: string; email: string }>(
    `SELECT id, name, email
     FROM objectified.account
     WHERE LOWER(email) = $1 AND deleted_at IS NULL AND enabled = true`,
    [normalizedEmail]
  );

  if (!row) return null;
  const isAdmin = await isAdministratorInAnyTenant(row.id);
  return { id: row.id, name: row.name, email: row.email, is_administrator: isAdmin };
}
