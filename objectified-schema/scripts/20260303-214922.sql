-- Ticket #1: Create initial user table
-- Schema: objectified
-- Uses: uuidv7() for primary key, WITHOUT TIME ZONE for all timestamps

SET search_path TO objectified, public;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enable pgvector extension for future use (e.g., vector search capabilities)
CREATE EXTENSION IF NOT EXISTS "vector";

-- Drop, then create objectified schema if it does not exist
DROP SCHEMA IF EXISTS objectified CASCADE;
CREATE SCHEMA IF NOT EXISTS objectified;

SET search_path TO objectified, public;

-- Trigger function to automatically update updated_at on row updates
CREATE OR REPLACE FUNCTION objectified.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- user table: stores application users with authentication credentials
CREATE TABLE objectified."user" (
    id          UUID PRIMARY KEY DEFAULT uuidv7(),
    name        VARCHAR(255) NOT NULL,
    email       VARCHAR(255) NOT NULL UNIQUE,
    password    VARCHAR(255) NOT NULL,
    verified    BOOLEAN NOT NULL DEFAULT false,
    enabled     BOOLEAN NOT NULL DEFAULT true,
    metadata    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL
);

-- Trigger: keep updated_at current on every update
CREATE TRIGGER trg_user_updated_at
    BEFORE UPDATE ON objectified."user"
    FOR EACH ROW
    EXECUTE FUNCTION objectified.set_updated_at();

-- Indices for quick lookups on email and name
CREATE INDEX idx_user_email   ON objectified."user" (email)  WHERE deleted_at IS NULL;
CREATE INDEX idx_user_name    ON objectified."user" (name)   WHERE deleted_at IS NULL;

-- Additional useful indices
CREATE INDEX idx_user_enabled    ON objectified."user" (enabled)    WHERE deleted_at IS NULL;
CREATE INDEX idx_user_verified   ON objectified."user" (verified)   WHERE deleted_at IS NULL;
CREATE INDEX idx_user_deleted_at ON objectified."user" (deleted_at) WHERE deleted_at IS NOT NULL;

