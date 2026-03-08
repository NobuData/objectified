-- Migration: Add source_version_id to objectified.version and create objectified.version_history
-- Issue: GH-23 - Create Versions REST services
-- Adds branch-source tracking to version rows and an immutable audit log for version changes.

SET search_path TO objectified, public;

-- Add source_version_id to objectified.version for branch/fork tracking
ALTER TABLE objectified.version
    ADD COLUMN IF NOT EXISTS source_version_id UUID REFERENCES objectified.version(id) DEFAULT NULL;

-- Index for efficient branch-source lookups
CREATE INDEX IF NOT EXISTS idx_version_source_version_id
    ON objectified.version (source_version_id)
    WHERE source_version_id IS NOT NULL;

-- version_history table: immutable audit log of all changes to objectified.version rows
CREATE TABLE IF NOT EXISTS objectified.version_history (
    id          UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    version_id  UUID NOT NULL REFERENCES objectified.version(id),
    project_id  UUID NOT NULL REFERENCES objectified.project(id),
    changed_by  UUID REFERENCES objectified.account(id),
    revision    INTEGER NOT NULL,
    operation   VARCHAR(16) NOT NULL,
    old_data    JSONB DEFAULT NULL,
    new_data    JSONB DEFAULT NULL,
    changed_at  TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc', clock_timestamp())
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'version_history_operation_check'
          AND conrelid = 'objectified.version_history'::regclass
    ) THEN
        ALTER TABLE objectified.version_history
            ADD CONSTRAINT version_history_operation_check
            CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE'));
    END IF;
END;
$$;

-- Unique constraint to prevent duplicate revision numbers per version
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'version_history_version_revision_unique'
          AND conrelid = 'objectified.version_history'::regclass
    ) THEN
        ALTER TABLE objectified.version_history
            ADD CONSTRAINT version_history_version_revision_unique
            UNIQUE (version_id, revision);
    END IF;
END;
$$;

-- Indices for efficient history lookups
CREATE INDEX IF NOT EXISTS idx_version_history_version_id
    ON objectified.version_history (version_id);
CREATE INDEX IF NOT EXISTS idx_version_history_project_id
    ON objectified.version_history (project_id);
CREATE INDEX IF NOT EXISTS idx_version_history_changed_at
    ON objectified.version_history (changed_at DESC);
