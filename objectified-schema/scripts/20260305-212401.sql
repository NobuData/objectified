-- Ticket #10: Create class table
-- Schema: objectified
-- Uses: uuidv7() for primary key, WITHOUT TIME ZONE for all timestamps

SET search_path TO objectified, public;

-- drop previous class table if it exists
DROP TABLE IF EXISTS objectified.class CASCADE;

-- class table: stores class definitions scoped to a version
CREATE TABLE objectified.class (
    id          UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    version_id  UUID NOT NULL REFERENCES objectified.version(id),
    name        VARCHAR(255) NOT NULL,
    description VARCHAR(4096) NOT NULL,
    schema      JSONB NOT NULL DEFAULT '{}',
    metadata    JSONB NOT NULL DEFAULT '{}',
    enabled     BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc', clock_timestamp()),
    updated_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
    deleted_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL
);

-- Trigger: keep updated_at current on every update
CREATE TRIGGER trg_class_updated_at
    BEFORE UPDATE ON objectified.class
    FOR EACH ROW
    EXECUTE FUNCTION objectified.set_updated_at();

-- Indices for memory-based quick lookups (active classes only)
CREATE INDEX idx_class_version_id
    ON objectified.class (version_id)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_class_name
    ON objectified.class (name)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_class_enabled
    ON objectified.class (enabled)
    WHERE deleted_at IS NULL;
-- Index to support operations and maintenance on soft-deleted classes
CREATE INDEX idx_class_deleted_at
    ON objectified.class (deleted_at)
    WHERE deleted_at IS NOT NULL;

