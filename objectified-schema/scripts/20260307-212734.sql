-- Migration: Add objectified.api_key table for API key authentication
-- Issue: GH-19 - Create authentication REST service
-- Supports per-tenant API keys with create/revoke capabilities.

SET search_path TO objectified, public;

-- api_key table: stores per-tenant API keys for programmatic access
CREATE TABLE objectified.api_key (
    id          UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id   UUID NOT NULL REFERENCES objectified.tenant(id),
    account_id  UUID NOT NULL REFERENCES objectified.account(id),
    name        VARCHAR(255) NOT NULL,
    key_hash    VARCHAR(255) NOT NULL UNIQUE,
    key_prefix  VARCHAR(16) NOT NULL,
    expires_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
    last_used   TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
    enabled     BOOLEAN NOT NULL DEFAULT true,
    metadata    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT timezone('utc', clock_timestamp()) NOT NULL,
    updated_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
    deleted_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL
);

-- Trigger: keep updated_at current on every update
CREATE TRIGGER trg_api_key_updated_at
    BEFORE UPDATE ON objectified.api_key
    FOR EACH ROW
    EXECUTE FUNCTION objectified.set_updated_at();

-- Indices for efficient lookups
CREATE INDEX idx_api_key_tenant_id    ON objectified.api_key (tenant_id)   WHERE deleted_at IS NULL;
CREATE INDEX idx_api_key_account_id   ON objectified.api_key (account_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_api_key_key_prefix   ON objectified.api_key (key_prefix)  WHERE deleted_at IS NULL;
CREATE INDEX idx_api_key_enabled      ON objectified.api_key (enabled)     WHERE deleted_at IS NULL;
CREATE INDEX idx_api_key_expires_at   ON objectified.api_key (expires_at)  WHERE expires_at IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_api_key_deleted_at   ON objectified.api_key (deleted_at)  WHERE deleted_at IS NOT NULL;

