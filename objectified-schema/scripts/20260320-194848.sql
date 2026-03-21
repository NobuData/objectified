-- GitHub #190: User last activity, deactivation reason/audit, lifecycle events.

SET search_path TO objectified, public;

ALTER TABLE objectified.account
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL;

ALTER TABLE objectified.account
    ADD COLUMN IF NOT EXISTS deactivation_reason TEXT DEFAULT NULL;

ALTER TABLE objectified.account
    ADD COLUMN IF NOT EXISTS deactivated_by UUID DEFAULT NULL
        REFERENCES objectified.account (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_account_last_login_at
    ON objectified.account (last_login_at DESC NULLS LAST)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS objectified.account_lifecycle_event (
    id           UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    account_id   UUID NOT NULL REFERENCES objectified.account (id),
    event_type   VARCHAR(32) NOT NULL,
    reason       TEXT DEFAULT NULL,
    actor_id     UUID DEFAULT NULL REFERENCES objectified.account (id) ON DELETE SET NULL,
    created_at   TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc', clock_timestamp())
);

CREATE INDEX IF NOT EXISTS idx_account_lifecycle_event_account
    ON objectified.account_lifecycle_event (account_id, created_at DESC);
