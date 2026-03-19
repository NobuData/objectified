-- Migration: Add code_generation_tag to objectified.version for codegen targeting
-- Issue: GH-121 — schema version tagging for code generation

SET search_path TO objectified, public;

ALTER TABLE objectified.version
    ADD COLUMN IF NOT EXISTS code_generation_tag VARCHAR(64) DEFAULT NULL;

COMMENT ON COLUMN objectified.version.code_generation_tag IS
    'Optional stable label for code generation (e.g. v1, api-v2); unique per project (case-insensitive).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_version_project_code_generation_tag_unique
    ON objectified.version (project_id, LOWER(code_generation_tag))
    WHERE deleted_at IS NULL
      AND code_generation_tag IS NOT NULL;
