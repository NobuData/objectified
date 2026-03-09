-- Migration: Add parent_id and timestamps to objectified.class_property
-- Issue: GH-30 - Create class property REST services
-- Adds parent_id self-reference for nested property support and audit timestamps.

SET search_path TO objectified, public;

-- Add parent_id column to class_property for nested property support.
-- ON DELETE SET NULL ensures child properties are promoted to top-level when a parent is removed.
ALTER TABLE objectified.class_property
    ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES objectified.class_property(id) ON DELETE SET NULL DEFAULT NULL;

-- Add audit timestamps: add nullable first, backfill existing rows, then enforce NOT NULL.
ALTER TABLE objectified.class_property
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE;

UPDATE objectified.class_property
    SET created_at = timezone('utc', clock_timestamp())
    WHERE created_at IS NULL;

ALTER TABLE objectified.class_property
    ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE objectified.class_property
    ALTER COLUMN created_at SET DEFAULT timezone('utc', clock_timestamp());

ALTER TABLE objectified.class_property
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL;

-- Ensure updated_at is automatically maintained on every row update.
DO
$$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM   pg_trigger
        WHERE  tgname = 'trg_class_property_set_updated_at'
    ) THEN
        CREATE TRIGGER trg_class_property_set_updated_at
        BEFORE UPDATE ON objectified.class_property
        FOR EACH ROW
        EXECUTE FUNCTION objectified.set_updated_at();
    END IF;
END;
$$;

-- Update uniqueness to support nested properties with case-insensitive name matching.
-- Drop the old (class_id, name) unique constraint from 20260305-214944.sql.
ALTER TABLE objectified.class_property
    DROP CONSTRAINT IF EXISTS uq_class_property_class_name;

-- Enforce case-insensitive uniqueness for top-level properties (parent_id IS NULL).
CREATE UNIQUE INDEX IF NOT EXISTS ux_class_property_class_top_name_ci
    ON objectified.class_property (class_id, lower(name))
    WHERE parent_id IS NULL;

-- Enforce case-insensitive uniqueness for nested properties (parent_id IS NOT NULL).
CREATE UNIQUE INDEX IF NOT EXISTS ux_class_property_class_parent_name_ci
    ON objectified.class_property (class_id, parent_id, lower(name))
    WHERE parent_id IS NOT NULL;

-- Index for efficient parent lookups
CREATE INDEX IF NOT EXISTS idx_class_property_parent_id
    ON objectified.class_property (parent_id)
    WHERE parent_id IS NOT NULL;

