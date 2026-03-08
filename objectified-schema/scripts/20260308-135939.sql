-- Migration: Create objectified.version_snapshot table for version state snapshots
-- Issue: GH-24 - Create Version History REST services
-- Stores committed version states capturing classes and properties at a point in time.

SET search_path TO objectified, public;

-- version_snapshot table: immutable snapshots of version state (classes + properties)
CREATE TABLE IF NOT EXISTS objectified.version_snapshot (
    id           UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    version_id   UUID NOT NULL REFERENCES objectified.version(id),
    project_id   UUID NOT NULL REFERENCES objectified.project(id),
    committed_by UUID REFERENCES objectified.account(id),
    revision     INTEGER NOT NULL,
    label        VARCHAR(255) DEFAULT NULL,
    description  VARCHAR(4096) DEFAULT NULL,
    snapshot     JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc', clock_timestamp())
);

-- Unique constraint to prevent duplicate revision numbers per version
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'version_snapshot_version_revision_unique'
          AND conrelid = 'objectified.version_snapshot'::regclass
    ) THEN
        ALTER TABLE objectified.version_snapshot
            ADD CONSTRAINT version_snapshot_version_revision_unique
            UNIQUE (version_id, revision);
    END IF;
END;
$$;

-- Indices for efficient snapshot lookups
CREATE INDEX IF NOT EXISTS idx_version_snapshot_version_id
    ON objectified.version_snapshot (version_id);
CREATE INDEX IF NOT EXISTS idx_version_snapshot_project_id
    ON objectified.version_snapshot (project_id);
CREATE INDEX IF NOT EXISTS idx_version_snapshot_created_at
    ON objectified.version_snapshot (created_at DESC);

