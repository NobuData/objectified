-- Ticket #2: Create initial tenant table
-- Schema: objectified
-- Uses: uuidv7() for primary key, WITHOUT TIME ZONE for all timestamps

SET search_path TO objectified, public;

-- tenant table: stores multi-tenant configuration with URL-friendly slug
CREATE TABLE objectified.tenant (
    id          UUID PRIMARY KEY DEFAULT uuidv7(),
    name        VARCHAR(80) NOT NULL,
    description VARCHAR(4096) NOT NULL,
    slug        VARCHAR(80) NOT NULL UNIQUE,
    enabled     BOOLEAN NOT NULL DEFAULT true,
    metadata    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc', clock_timestamp()),
    updated_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
    deleted_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,

    CONSTRAINT tenant_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

-- Trigger: keep updated_at current on every update
CREATE TRIGGER trg_tenant_updated_at
    BEFORE UPDATE ON objectified.tenant
    FOR EACH ROW
    EXECUTE FUNCTION objectified.set_updated_at();

-- Partial indexes for quick lookups on tenant attributes, filtering by deleted_at (soft-delete)
CREATE INDEX idx_tenant_name       ON objectified.tenant (name)       WHERE deleted_at IS NULL;
CREATE INDEX idx_tenant_enabled    ON objectified.tenant (enabled)    WHERE deleted_at IS NULL;
CREATE INDEX idx_tenant_deleted_at ON objectified.tenant (deleted_at) WHERE deleted_at IS NOT NULL;

