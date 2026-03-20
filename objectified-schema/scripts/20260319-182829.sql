-- GH-132: Configurable rate limits (tenant / API key) and optional project/version quotas.

SET search_path TO objectified, public;

ALTER TABLE objectified.tenant
    ADD COLUMN IF NOT EXISTS rate_limit_requests_per_minute INTEGER NULL,
    ADD COLUMN IF NOT EXISTS max_projects INTEGER NULL,
    ADD COLUMN IF NOT EXISTS max_versions_per_project INTEGER NULL;

COMMENT ON COLUMN objectified.tenant.rate_limit_requests_per_minute IS
    'Optional RPM override for JWT users on this tenant''s routes; NULL inherits global default.';
COMMENT ON COLUMN objectified.tenant.max_projects IS
    'Optional cap on active (non-deleted) projects; NULL means unlimited.';
COMMENT ON COLUMN objectified.tenant.max_versions_per_project IS
    'Optional cap on active (non-deleted) versions per project; NULL means unlimited.';

ALTER TABLE objectified.tenant DROP CONSTRAINT IF EXISTS chk_tenant_rate_limit_rpm;
ALTER TABLE objectified.tenant ADD CONSTRAINT chk_tenant_rate_limit_rpm CHECK (
    rate_limit_requests_per_minute IS NULL
    OR (rate_limit_requests_per_minute >= 1 AND rate_limit_requests_per_minute <= 1000000)
);

ALTER TABLE objectified.tenant DROP CONSTRAINT IF EXISTS chk_tenant_max_projects;
ALTER TABLE objectified.tenant ADD CONSTRAINT chk_tenant_max_projects CHECK (
    max_projects IS NULL OR max_projects >= 0
);

ALTER TABLE objectified.tenant DROP CONSTRAINT IF EXISTS chk_tenant_max_versions_per_project;
ALTER TABLE objectified.tenant ADD CONSTRAINT chk_tenant_max_versions_per_project CHECK (
    max_versions_per_project IS NULL OR max_versions_per_project >= 0
);

ALTER TABLE objectified.api_key
    ADD COLUMN IF NOT EXISTS rate_limit_requests_per_minute INTEGER NULL;

COMMENT ON COLUMN objectified.api_key.rate_limit_requests_per_minute IS
    'Optional RPM override for this key; NULL inherits tenant then global default.';

ALTER TABLE objectified.api_key DROP CONSTRAINT IF EXISTS chk_api_key_rate_limit_rpm;
ALTER TABLE objectified.api_key ADD CONSTRAINT chk_api_key_rate_limit_rpm CHECK (
    rate_limit_requests_per_minute IS NULL
    OR (rate_limit_requests_per_minute >= 1 AND rate_limit_requests_per_minute <= 1000000)
);
