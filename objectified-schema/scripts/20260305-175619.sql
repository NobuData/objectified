-- Update email index on objectified.account to use LOWER(email) for case-insensitive uniqueness and lookups
-- Schema: objectified

SET search_path TO objectified, public;

-- Drop the default unique constraint on email (created by UNIQUE on the column)
-- This removes the implicit btree index on email
ALTER TABLE objectified.account DROP CONSTRAINT IF EXISTS account_email_key;

-- Create unique index on LOWER(email) so lookups and uniqueness are case-insensitive
CREATE UNIQUE INDEX idx_account_email_lower ON objectified.account (LOWER(email));
