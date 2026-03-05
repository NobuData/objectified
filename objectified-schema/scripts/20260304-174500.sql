-- Ticket #5: Create project table
-- Schema: objectified
-- Uses: uuidv7() for primary key, WITHOUT TIME ZONE for all timestamps

SET search_path TO objectified, public;

-- project table: stores project definitions scoped to a tenant
CREATE TABLE objectified.project (
    id          UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    tenant_id   UUID NOT NULL REFERENCES objectified.tenant(id),
    creator_id  UUID NOT NULL REFERENCES objectified.account(id),
    name        VARCHAR(255) NOT NULL,
    description VARCHAR(4096) NOT NULL,
    slug        VARCHAR(80) NOT NULL UNIQUE,
    enabled     BOOLEAN NOT NULL DEFAULT true,
    metadata    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc', clock_timestamp()),
    updated_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
    deleted_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,

    CONSTRAINT project_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

-- Trigger: keep updated_at current on every update
CREATE TRIGGER trg_project_updated_at
    BEFORE UPDATE ON objectified.project
    FOR EACH ROW
    EXECUTE FUNCTION objectified.set_updated_at();

-- Indices for memory-based quick lookups (active projects only)
CREATE INDEX idx_project_tenant_id
    ON objectified.project (tenant_id)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_project_creator_id
    ON objectified.project (creator_id)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_project_name
    ON objectified.project (name)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_project_enabled
    ON objectified.project (enabled)
    WHERE deleted_at IS NULL;
-- Index to support operations and maintenance on soft-deleted projects
CREATE INDEX idx_project_deleted_at
    ON objectified.project (deleted_at)
    WHERE deleted_at IS NOT NULL;

