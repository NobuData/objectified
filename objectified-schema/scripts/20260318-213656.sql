-- Migration: Add RBAC roles and permissions (tenant-scoped) with optional resource scoping
-- Issue: GH-128 - Implement RBAC with configurable roles and permissions
--
-- Adds:
--   - objectified.permission: global permission registry (key + description)
--   - objectified.role: tenant-scoped roles (key + name + description)
--   - objectified.role_permission: mapping roles -> permissions
--   - objectified.account_role: role assignments to accounts, optionally scoped to a resource
--
-- Notes:
--   - Existing tenant_account.access_level='administrator' remains authoritative for full access.
--   - Tenant members implicitly receive the 'viewer' permission set unless overridden by explicit roles.
--   - Resource scoping is optional and currently supports project/version.

SET search_path TO objectified, public;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'rbac_resource_type'
          AND n.nspname = 'objectified'
    ) THEN
        CREATE TYPE objectified.rbac_resource_type AS ENUM ('project', 'version');
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS objectified.permission (
    id          UUID PRIMARY KEY DEFAULT uuidv7(),
    key         VARCHAR(128) NOT NULL UNIQUE,
    description VARCHAR(1024) NOT NULL DEFAULT '',
    enabled     BOOLEAN NOT NULL DEFAULT true,
    metadata    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT timezone('utc', clock_timestamp()) NOT NULL,
    updated_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
    deleted_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL
);

DROP TRIGGER IF EXISTS trg_permission_updated_at ON objectified.permission;
CREATE TRIGGER trg_permission_updated_at
    BEFORE UPDATE ON objectified.permission
    FOR EACH ROW
    EXECUTE FUNCTION objectified.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_permission_enabled
    ON objectified.permission (enabled)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_permission_deleted_at
    ON objectified.permission (deleted_at)
    WHERE deleted_at IS NOT NULL;


CREATE TABLE IF NOT EXISTS objectified.role (
    id          UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id   UUID NOT NULL REFERENCES objectified.tenant(id),
    key         VARCHAR(80) NOT NULL,
    name        VARCHAR(255) NOT NULL,
    description VARCHAR(1024) NOT NULL DEFAULT '',
    enabled     BOOLEAN NOT NULL DEFAULT true,
    metadata    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT timezone('utc', clock_timestamp()) NOT NULL,
    updated_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
    deleted_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL
);

-- Per-tenant uniqueness; soft-deleted roles do not reserve a key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_role_tenant_key_unique
    ON objectified.role (tenant_id, LOWER(key))
    WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_role_updated_at ON objectified.role;
CREATE TRIGGER trg_role_updated_at
    BEFORE UPDATE ON objectified.role
    FOR EACH ROW
    EXECUTE FUNCTION objectified.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_role_tenant_id
    ON objectified.role (tenant_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_role_enabled
    ON objectified.role (enabled)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_role_deleted_at
    ON objectified.role (deleted_at)
    WHERE deleted_at IS NOT NULL;


CREATE TABLE IF NOT EXISTS objectified.role_permission (
    id            UUID PRIMARY KEY DEFAULT uuidv7(),
    role_id       UUID NOT NULL REFERENCES objectified.role(id),
    permission_id UUID NOT NULL REFERENCES objectified.permission(id),
    enabled       BOOLEAN NOT NULL DEFAULT true,
    metadata      JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMP WITHOUT TIME ZONE DEFAULT timezone('utc', clock_timestamp()) NOT NULL,
    updated_at    TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
    deleted_at    TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_role_permission_unique
    ON objectified.role_permission (role_id, permission_id)
    WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_role_permission_updated_at ON objectified.role_permission;
CREATE TRIGGER trg_role_permission_updated_at
    BEFORE UPDATE ON objectified.role_permission
    FOR EACH ROW
    EXECUTE FUNCTION objectified.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_role_permission_role_id
    ON objectified.role_permission (role_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_role_permission_permission_id
    ON objectified.role_permission (permission_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_role_permission_deleted_at
    ON objectified.role_permission (deleted_at)
    WHERE deleted_at IS NOT NULL;


CREATE TABLE IF NOT EXISTS objectified.account_role (
    id            UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id     UUID NOT NULL REFERENCES objectified.tenant(id),
    account_id    UUID NOT NULL REFERENCES objectified.account(id),
    role_id       UUID NOT NULL REFERENCES objectified.role(id),
    resource_type objectified.rbac_resource_type DEFAULT NULL,
    resource_id   UUID DEFAULT NULL,
    enabled       BOOLEAN NOT NULL DEFAULT true,
    metadata      JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMP WITHOUT TIME ZONE DEFAULT timezone('utc', clock_timestamp()) NOT NULL,
    updated_at    TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
    deleted_at    TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,

    CONSTRAINT chk_account_role_resource_pair CHECK (
        (resource_type IS NULL AND resource_id IS NULL)
        OR
        (resource_type IS NOT NULL AND resource_id IS NOT NULL)
    )
);

-- Only one active assignment per (tenant, account, role, resource scope).
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_role_unique
    ON objectified.account_role (tenant_id, account_id, role_id, resource_type, resource_id)
    WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_account_role_updated_at ON objectified.account_role;
CREATE TRIGGER trg_account_role_updated_at
    BEFORE UPDATE ON objectified.account_role
    FOR EACH ROW
    EXECUTE FUNCTION objectified.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_account_role_tenant_account
    ON objectified.account_role (tenant_id, account_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_account_role_role_id
    ON objectified.account_role (role_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_account_role_deleted_at
    ON objectified.account_role (deleted_at)
    WHERE deleted_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Seed permissions (idempotent)
-- ---------------------------------------------------------------------------

INSERT INTO objectified.permission (key, description)
VALUES
    ('project:read', 'Read projects within a tenant'),
    ('project:write', 'Create, update, delete, restore projects within a tenant'),
    ('version:read', 'Read versions within a project'),
    ('version:write', 'Create, update, delete versions within a project'),
    ('version:publish', 'Publish/unpublish versions and commit schema snapshots'),
    ('schema:read', 'Read schema objects (classes, properties, validation)'),
    ('schema:write', 'Create/update/delete schema objects (classes, properties, imports/merges)'),
    ('audit:read', 'Read audit/history endpoints (project/version history, schema diffs)')
ON CONFLICT (key) DO UPDATE
SET description = EXCLUDED.description
WHERE objectified.permission.description IS DISTINCT FROM EXCLUDED.description;

-- ---------------------------------------------------------------------------
-- Seed default roles per tenant (idempotent)
-- ---------------------------------------------------------------------------

WITH tenant_ids AS (
    SELECT id AS tenant_id
    FROM objectified.tenant
    WHERE deleted_at IS NULL
)
INSERT INTO objectified.role (tenant_id, key, name, description)
SELECT tenant_id, 'viewer', 'Viewer', 'Read-only access to projects, versions, and schema.'
FROM tenant_ids
ON CONFLICT DO NOTHING;

WITH tenant_ids AS (
    SELECT id AS tenant_id
    FROM objectified.tenant
    WHERE deleted_at IS NULL
)
INSERT INTO objectified.role (tenant_id, key, name, description)
SELECT tenant_id, 'schema-editor', 'Schema Editor', 'Create and edit schema (classes/properties) and drafts.'
FROM tenant_ids
ON CONFLICT DO NOTHING;

WITH tenant_ids AS (
    SELECT id AS tenant_id
    FROM objectified.tenant
    WHERE deleted_at IS NULL
)
INSERT INTO objectified.role (tenant_id, key, name, description)
SELECT tenant_id, 'publisher', 'Publisher', 'Publish/unpublish versions and commit snapshots.'
FROM tenant_ids
ON CONFLICT DO NOTHING;

WITH tenant_ids AS (
    SELECT id AS tenant_id
    FROM objectified.tenant
    WHERE deleted_at IS NULL
)
INSERT INTO objectified.role (tenant_id, key, name, description)
SELECT tenant_id, 'auditor', 'Auditor', 'Read audit logs and history endpoints.'
FROM tenant_ids
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Seed role->permission mappings (idempotent)
-- ---------------------------------------------------------------------------

-- Viewer: read permissions
INSERT INTO objectified.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM objectified.role r
JOIN objectified.permission p ON p.key IN ('project:read', 'version:read', 'schema:read')
WHERE LOWER(r.key) = 'viewer'
  AND r.deleted_at IS NULL
  AND p.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- Schema Editor: viewer + write schema + write project/version
INSERT INTO objectified.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM objectified.role r
JOIN objectified.permission p ON p.key IN (
    'project:read', 'version:read', 'schema:read',
    'project:write', 'version:write', 'schema:write'
)
WHERE LOWER(r.key) = 'schema-editor'
  AND r.deleted_at IS NULL
  AND p.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- Publisher: viewer + publish
INSERT INTO objectified.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM objectified.role r
JOIN objectified.permission p ON p.key IN ('project:read', 'version:read', 'schema:read', 'version:publish')
WHERE LOWER(r.key) = 'publisher'
  AND r.deleted_at IS NULL
  AND p.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- Auditor: viewer + audit
INSERT INTO objectified.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM objectified.role r
JOIN objectified.permission p ON p.key IN ('project:read', 'version:read', 'schema:read', 'audit:read')
WHERE LOWER(r.key) = 'auditor'
  AND r.deleted_at IS NULL
  AND p.deleted_at IS NULL
ON CONFLICT DO NOTHING;

