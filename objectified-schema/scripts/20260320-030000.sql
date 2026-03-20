-- GH-137: Optional schema promotion workflow (dev/staging/prod)
--
-- Adds:
--   - objectified.schema_environment (enum)
--   - objectified.schema_live_version (tracks the current live version per env)
--   - objectified.schema_promotion (history/audit metadata)
--   - schema webhook event type: schema.promoted
--   - RBAC permission: schema:promote

SET search_path TO objectified, public;

-- ---------------------------------------------------------------------------
-- Environment enum
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    CREATE TYPE objectified.schema_environment AS ENUM ('dev', 'staging', 'prod');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Live version mapping (per project + environment)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS objectified.schema_live_version (
    id              UUID PRIMARY KEY DEFAULT uuidv7(),
    project_id      UUID NOT NULL REFERENCES objectified.project(id) ON DELETE CASCADE,
    environment     objectified.schema_environment NOT NULL,
    version_id      UUID NULL REFERENCES objectified.version(id) ON DELETE SET NULL,
    promoted_by     UUID NULL REFERENCES objectified.account(id) ON DELETE SET NULL,
    promoted_at     TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc', clock_timestamp()),
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc', clock_timestamp()),
    updated_at      TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,

    CONSTRAINT uq_schema_live_version_project_env UNIQUE (project_id, environment)
);

DROP TRIGGER IF EXISTS trg_schema_live_version_updated_at ON objectified.schema_live_version;
CREATE TRIGGER trg_schema_live_version_updated_at
    BEFORE UPDATE ON objectified.schema_live_version
    FOR EACH ROW
    EXECUTE FUNCTION objectified.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_schema_live_version_project_env
    ON objectified.schema_live_version (project_id, environment)
    WHERE version_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Promotion history / metadata
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS objectified.schema_promotion (
    id              UUID PRIMARY KEY DEFAULT uuidv7(),
    project_id      UUID NOT NULL REFERENCES objectified.project(id) ON DELETE CASCADE,
    environment     objectified.schema_environment NOT NULL,
    from_version_id UUID NULL REFERENCES objectified.version(id) ON DELETE SET NULL,
    to_version_id   UUID NULL REFERENCES objectified.version(id) ON DELETE SET NULL,
    promoted_by     UUID NULL REFERENCES objectified.account(id) ON DELETE SET NULL,
    created_at      TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc', clock_timestamp()),
    metadata        JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_schema_promotion_project_env_created_at
    ON objectified.schema_promotion (project_id, environment, created_at DESC);

-- ---------------------------------------------------------------------------
-- RBAC permission: schema:promote
-- ---------------------------------------------------------------------------
INSERT INTO objectified.permission (key, description)
VALUES
    ('schema:promote', 'Promote a published schema version to an environment live target')
ON CONFLICT (key) DO UPDATE
SET description = EXCLUDED.description
WHERE objectified.permission.description IS DISTINCT FROM EXCLUDED.description;

-- Give the permission to the default "publisher" role.
INSERT INTO objectified.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM objectified.role r
JOIN objectified.permission p ON p.key = 'schema:promote'
WHERE LOWER(r.key) = 'publisher'
  AND r.deleted_at IS NULL
  AND p.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Webhook event type: schema.promoted
-- ---------------------------------------------------------------------------
ALTER TABLE objectified.schema_webhook
    DROP CONSTRAINT IF EXISTS chk_schema_webhook_events_known;

ALTER TABLE objectified.schema_webhook
    ADD CONSTRAINT chk_schema_webhook_events_known CHECK (
        events <@ ARRAY[
            'schema.committed',
            'schema.published',
            'schema.branch_created',
            'schema.promoted'
        ]::TEXT[]
    );

ALTER TABLE objectified.schema_webhook_delivery
    DROP CONSTRAINT IF EXISTS chk_schema_webhook_delivery_event_type;

ALTER TABLE objectified.schema_webhook_delivery
    ADD CONSTRAINT chk_schema_webhook_delivery_event_type CHECK (
        event_type IN (
            'schema.committed',
            'schema.published',
            'schema.branch_created',
            'schema.promoted'
        )
    );

