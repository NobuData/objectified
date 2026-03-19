-- Migration: Add objectified.sso_provider table for optional enterprise SSO configuration
-- Issue: GH-127 - Add optional SSO integration (OIDC / SAML) configuration support
--
-- Stores tenant-scoped SSO provider configuration:
--   - OIDC: store the discovery document JSON (from /.well-known/openid-configuration)
--   - SAML: store the IdP metadata XML
--
-- Note: This migration adds configuration storage only; login/provisioning
-- flows are handled at the application layer.

SET search_path TO objectified, public;

CREATE TABLE IF NOT EXISTS objectified.sso_provider (
    id                UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id          UUID NOT NULL REFERENCES objectified.tenant(id),
    provider_type      VARCHAR(16) NOT NULL CHECK (provider_type IN ('oidc', 'saml')),
    name              VARCHAR(255) NOT NULL,
    enabled           BOOLEAN NOT NULL DEFAULT true,
    oidc_discovery     JSONB DEFAULT NULL,
    saml_metadata_xml  TEXT DEFAULT NULL,
    metadata           JSONB NOT NULL DEFAULT '{}',
    created_at         TIMESTAMP WITHOUT TIME ZONE DEFAULT timezone('utc', clock_timestamp()) NOT NULL,
    updated_at         TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
    deleted_at         TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL
);

-- Ensure the relevant config field is present based on provider type
ALTER TABLE objectified.sso_provider
    DROP CONSTRAINT IF EXISTS chk_sso_provider_type_fields;

ALTER TABLE objectified.sso_provider
    ADD CONSTRAINT chk_sso_provider_type_fields CHECK (
        (provider_type = 'oidc' AND oidc_discovery IS NOT NULL AND saml_metadata_xml IS NULL)
        OR
        (provider_type = 'saml' AND saml_metadata_xml IS NOT NULL AND oidc_discovery IS NULL)
    );

-- Trigger: keep updated_at current on every update
DROP TRIGGER IF EXISTS trg_sso_provider_updated_at ON objectified.sso_provider;
CREATE TRIGGER trg_sso_provider_updated_at
    BEFORE UPDATE ON objectified.sso_provider
    FOR EACH ROW
    EXECUTE FUNCTION objectified.set_updated_at();

-- Indices for efficient lookups and case-insensitive uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_sso_provider_tenant_type_name_unique
    ON objectified.sso_provider (tenant_id, provider_type, LOWER(name))
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sso_provider_tenant_id
    ON objectified.sso_provider (tenant_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sso_provider_enabled
    ON objectified.sso_provider (enabled)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sso_provider_deleted_at
    ON objectified.sso_provider (deleted_at)
    WHERE deleted_at IS NOT NULL;

