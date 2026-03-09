-- Migration: Add parent_id and timestamps to objectified.class_property
-- Issue: GH-30 - Create class property REST services
-- Adds parent_id self-reference for nested property support and audit timestamps.

SET search_path TO objectified, public;

-- Add parent_id column to class_property for nested property support
ALTER TABLE objectified.class_property
    ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES objectified.class_property(id) DEFAULT NULL;

-- Add audit timestamps
ALTER TABLE objectified.class_property
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc', clock_timestamp());

ALTER TABLE objectified.class_property
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL;

-- Index for efficient parent lookups
CREATE INDEX IF NOT EXISTS idx_class_property_parent_id
    ON objectified.class_property (parent_id)
    WHERE parent_id IS NOT NULL;

