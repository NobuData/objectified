-- Migration: Tenant member email invitations (pending / accepted / cancelled)
-- Issue: GH-193 — invite-by-email pending state, resend/cancel, member workspace roles
--
-- Adds:
--   - objectified.tenant_member_invitation_status enum
--   - objectified.tenant_member_invitation for emails without an account yet

SET search_path TO objectified, public;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'tenant_member_invitation_status'
          AND n.nspname = 'objectified'
    ) THEN
        CREATE TYPE objectified.tenant_member_invitation_status AS ENUM (
            'pending',
            'accepted',
            'cancelled'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS objectified.tenant_member_invitation (
    id                      UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id               UUID NOT NULL REFERENCES objectified.tenant(id),
    email                   VARCHAR(320) NOT NULL,
    role_id                 UUID REFERENCES objectified.role(id),
    status                  objectified.tenant_member_invitation_status NOT NULL DEFAULT 'pending',
    invited_by_account_id   UUID REFERENCES objectified.account(id),
    last_sent_at            TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
    created_at              TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc', clock_timestamp()),
    updated_at              TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
    deleted_at              TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL
);

DROP TRIGGER IF EXISTS trg_tenant_member_invitation_updated_at
    ON objectified.tenant_member_invitation;
CREATE TRIGGER trg_tenant_member_invitation_updated_at
    BEFORE UPDATE ON objectified.tenant_member_invitation
    FOR EACH ROW
    EXECUTE FUNCTION objectified.set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_member_invitation_pending_email
    ON objectified.tenant_member_invitation (tenant_id, LOWER(email))
    WHERE status = 'pending' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_member_invitation_tenant_status
    ON objectified.tenant_member_invitation (tenant_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_member_invitation_deleted_at
    ON objectified.tenant_member_invitation (deleted_at)
    WHERE deleted_at IS NOT NULL;
