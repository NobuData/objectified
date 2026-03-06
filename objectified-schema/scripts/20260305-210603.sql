-- Ticket #9: Create property table
-- Schema: objectified
-- Uses: uuidv7() for primary key, WITHOUT TIME ZONE for all timestamps

SET search_path TO objectified, public;

-- drop previous property table if it exists
DROP TABLE IF EXISTS objectified.property CASCADE;

-- property table: stores property definitions scoped to a project
CREATE TABLE objectified.property (
    id          UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    project_id  UUID NOT NULL REFERENCES objectified.project(id),
    name        VARCHAR(255) NOT NULL,
    description VARCHAR(4096) NOT NULL,
    data        JSONB NOT NULL DEFAULT '{}',
    enabled     BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc', clock_timestamp()),
    updated_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
    deleted_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL
);

-- Trigger: keep updated_at current on every update
CREATE TRIGGER trg_property_updated_at
    BEFORE UPDATE ON objectified.property
    FOR EACH ROW
    EXECUTE FUNCTION objectified.set_updated_at();

-- Indices for memory-based quick lookups (active properties only)
CREATE INDEX idx_property_project_id
    ON objectified.property (project_id)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_property_name
    ON objectified.property (name)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_property_enabled
    ON objectified.property (enabled)
    WHERE deleted_at IS NULL;
-- Index to support operations and maintenance on soft-deleted properties
CREATE INDEX idx_property_deleted_at
    ON objectified.property (deleted_at)
    WHERE deleted_at IS NOT NULL;

