-- Migration: Dashboard page visit audit log (optional compliance; GitHub #188)
-- Append-only rows when DASHBOARD_PAGE_VISIT_AUDIT_ENABLED=true on objectified-rest.

SET search_path TO objectified, public;

CREATE TABLE IF NOT EXISTS objectified.dashboard_page_visit (
    id          UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    tenant_id   UUID REFERENCES objectified.tenant(id),
    account_id  UUID REFERENCES objectified.account(id),
    route_path  TEXT NOT NULL,
    visited_at  TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc', clock_timestamp())
);

CREATE INDEX IF NOT EXISTS idx_dashboard_page_visit_tenant_visited
    ON objectified.dashboard_page_visit (tenant_id, visited_at DESC);

CREATE INDEX IF NOT EXISTS idx_dashboard_page_visit_account_visited
    ON objectified.dashboard_page_visit (account_id, visited_at DESC);
