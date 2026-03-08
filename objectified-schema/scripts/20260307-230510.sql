-- Migration: Add objectified.project_history table and fix project slug uniqueness per tenant
-- Issue: GH-22 - Create Projects REST services
-- Adds history tracking for project changes and fixes slug uniqueness to be per-tenant.

SET search_path TO objectified, public;

-- Fix slug uniqueness: drop global unique constraint, add per-tenant unique constraint
ALTER TABLE objectified.project DROP CONSTRAINT IF EXISTS project_slug_format;
ALTER TABLE objectified.project DROP CONSTRAINT IF EXISTS project_slug_key;

-- Remove old global unique index on slug if it exists
DROP INDEX IF EXISTS objectified.project_slug_key;

-- Add per-tenant unique index on (tenant_id, slug) for non-deleted projects
-- Use a partial unique index so that slugs can be reused after soft-delete (deleted_at IS NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS project_tenant_slug_unique
    ON objectified.project (tenant_id, slug)
    WHERE deleted_at IS NULL;

-- Re-add slug format check constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'project_slug_format'
          AND conrelid = 'objectified.project'::regclass
    ) THEN
        ALTER TABLE objectified.project
            ADD CONSTRAINT project_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
    END IF;
END;
$$;

-- project_history table: immutable audit log of all changes to objectified.project rows
CREATE TABLE IF NOT EXISTS objectified.project_history (
    id          UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    project_id  UUID NOT NULL REFERENCES objectified.project(id),
    tenant_id   UUID NOT NULL REFERENCES objectified.tenant(id),
    changed_by  UUID REFERENCES objectified.account(id),
    operation   VARCHAR(16) NOT NULL,           -- 'INSERT', 'UPDATE', 'DELETE'
    old_data    JSONB DEFAULT NULL,             -- row state before the change
    new_data    JSONB DEFAULT NULL,             -- row state after the change
    changed_at  TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc', clock_timestamp())
);

-- Indices for efficient history lookups
CREATE INDEX IF NOT EXISTS idx_project_history_project_id
    ON objectified.project_history (project_id);
CREATE INDEX IF NOT EXISTS idx_project_history_tenant_id
    ON objectified.project_history (tenant_id);
CREATE INDEX IF NOT EXISTS idx_project_history_changed_at
    ON objectified.project_history (changed_at DESC);

