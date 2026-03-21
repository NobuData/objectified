-- GitHub #194: Tenant administrator audit log and primary administrator designation.

SET search_path TO objectified, public;

ALTER TABLE objectified.tenant
    ADD COLUMN IF NOT EXISTS primary_admin_account_id UUID DEFAULT NULL
        REFERENCES objectified.account (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_primary_admin
    ON objectified.tenant (primary_admin_account_id)
    WHERE deleted_at IS NULL AND primary_admin_account_id IS NOT NULL;

-- Earliest active enabled administrator per tenant (designation of record).
UPDATE objectified.tenant t
SET primary_admin_account_id = sub.account_id
FROM (
    SELECT DISTINCT ON (ta.tenant_id)
        ta.tenant_id,
        ta.account_id
    FROM objectified.tenant_account ta
    WHERE ta.deleted_at IS NULL
      AND ta.access_level = 'administrator'
      AND ta.enabled = true
    ORDER BY ta.tenant_id, ta.created_at ASC
) sub
WHERE t.id = sub.tenant_id
  AND t.deleted_at IS NULL
  AND t.primary_admin_account_id IS NULL;

CREATE TABLE IF NOT EXISTS objectified.tenant_admin_audit_event (
    id UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES objectified.tenant (id),
    event_type VARCHAR(64) NOT NULL,
    actor_account_id UUID DEFAULT NULL REFERENCES objectified.account (id) ON DELETE SET NULL,
    target_account_id UUID DEFAULT NULL REFERENCES objectified.account (id) ON DELETE SET NULL,
    previous_primary_account_id UUID DEFAULT NULL REFERENCES objectified.account (id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc', clock_timestamp())
);

CREATE INDEX IF NOT EXISTS idx_tenant_admin_audit_tenant_created
    ON objectified.tenant_admin_audit_event (tenant_id, created_at DESC);
