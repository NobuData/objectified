-- Ticket #6: Create version table
-- Schema: objectified
-- Uses: uuidv7() for primary key, WITHOUT TIME ZONE for all timestamps

SET search_path TO objectified, public;

-- ENUM type for version visibility
CREATE TYPE objectified.version_visibility AS ENUM ('private', 'public');

-- version table: stores version definitions scoped to a project
CREATE TABLE objectified.version (
    id           UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    project_id   UUID NOT NULL REFERENCES objectified.project(id),
    creator_id   UUID NOT NULL REFERENCES objectified.account(id),
    name         VARCHAR(255) NOT NULL,
    description  VARCHAR(4096) NOT NULL,
    change_log   TEXT,
    enabled      BOOLEAN NOT NULL DEFAULT true,
    published    BOOLEAN NOT NULL DEFAULT false,
    visibility   objectified.version_visibility DEFAULT NULL,
    metadata     JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc', clock_timestamp()),
    updated_at   TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
    deleted_at   TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
    published_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL
);

-- Trigger: keep updated_at current on every update
CREATE TRIGGER trg_version_updated_at
    BEFORE UPDATE ON objectified.version
    FOR EACH ROW
    EXECUTE FUNCTION objectified.set_updated_at();

-- Indices for memory-based quick lookups (active versions only)
CREATE INDEX idx_version_project_id
    ON objectified.version (project_id)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_version_creator_id
    ON objectified.version (creator_id)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_version_name
    ON objectified.version (name)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_version_enabled
    ON objectified.version (enabled)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_version_published
    ON objectified.version (published)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_version_visibility
    ON objectified.version (visibility)
    WHERE deleted_at IS NULL;
-- Index to support operations and maintenance on soft-deleted versions
CREATE INDEX idx_version_deleted_at
    ON objectified.version (deleted_at)
    WHERE deleted_at IS NOT NULL;
