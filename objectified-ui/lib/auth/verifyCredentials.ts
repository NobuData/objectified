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
  const row = await queryOne<{ id: string; name: string; email: string; password: string }>(
    `SELECT id, name, email, password
     FROM objectified.account
     WHERE LOWER(email) = $1 AND deleted_at IS NULL AND enabled = true`,
    [normalizedEmail]
  );

  if (!row?.password) {
    return null;
  }

  const match = await compare(password, row.password);

  if (!match) {
    return null;
  }

  return { id: row.id, name: row.name, email: row.email };
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

  return row ? { id: row.id, name: row.name, email: row.email } : null;
}
