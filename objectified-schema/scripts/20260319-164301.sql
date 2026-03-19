-- Migration: API key scopes — tenant-wide vs project, full vs read-only (GH-129)
-- Adds scope_role and optional project_id to objectified.api_key.

SET search_path TO objectified, public;

ALTER TABLE objectified.api_key
  ADD COLUMN scope_role VARCHAR(32) NOT NULL DEFAULT 'full'
    CONSTRAINT chk_api_key_scope_role CHECK (LOWER(scope_role) IN ('full', 'read_only')),
  ADD COLUMN project_id UUID REFERENCES objectified.project(id) DEFAULT NULL;

CREATE INDEX idx_api_key_project_id ON objectified.api_key (project_id)
  WHERE project_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN objectified.api_key.scope_role IS
  'full: all HTTP methods (read-only still limited to safe verbs); read_only: GET, HEAD, OPTIONS only.';
COMMENT ON COLUMN objectified.api_key.project_id IS
  'When set, the key may only access this project within the tenant (tenant-wide endpoints return 403).';
