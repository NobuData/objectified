-- Ticket #3: Create tenant to account relationship (tenant_user table)
-- Schema: objectified
-- Uses: uuidv7() for primary key, WITHOUT TIME ZONE for all timestamps

SET search_path TO objectified, public;

-- ENUM type for tenant access levels
CREATE TYPE objectified.tenant_access_level AS ENUM ('member', 'administrator');

-- tenant_user table: associates accounts with tenants and assigns an access level
CREATE TABLE objectified.tenant_user (
    id           UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    tenant_id    UUID NOT NULL REFERENCES objectified.tenant(id),
    account_id   UUID NOT NULL REFERENCES objectified.account(id),
    access_level objectified.tenant_access_level NOT NULL DEFAULT 'member',
    enabled      BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc', clock_timestamp()),
    updated_at   TIMESTAMP WITHOUT TIME ZONE DEFAULT timezone('utc', clock_timestamp()),
    deleted_at   TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,

    CONSTRAINT uq_tenant_user_tenant_account UNIQUE (tenant_id, account_id)
);

-- Trigger: keep updated_at current on every update
CREATE TRIGGER trg_tenant_user_updated_at
    BEFORE UPDATE ON objectified.tenant_user
    FOR EACH ROW
    EXECUTE FUNCTION objectified.set_updated_at();

-- Indices for memory-based quick lookups
CREATE INDEX idx_tenant_user_tenant_id  ON objectified.tenant_user (tenant_id);
CREATE INDEX idx_tenant_user_account_id ON objectified.tenant_user (account_id);
CREATE INDEX idx_tenant_user_access_level ON objectified.tenant_user (access_level);

