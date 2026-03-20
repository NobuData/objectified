-- GH-135: Configurable webhooks for schema events (commit, publish, branch).
-- Stores per-project webhook targets, optional HMAC secrets, event subscriptions,
-- and a delivery queue with retry scheduling.

SET search_path TO objectified, public;

CREATE TABLE objectified.schema_webhook (
    id           UUID PRIMARY KEY DEFAULT uuidv7(),
    project_id   UUID NOT NULL REFERENCES objectified.project(id) ON DELETE CASCADE,
    url          TEXT NOT NULL,
    secret       TEXT NULL,
    events       TEXT[] NOT NULL DEFAULT ARRAY[
        'schema.committed',
        'schema.published',
        'schema.branch_created'
    ]::TEXT[],
    enabled      BOOLEAN NOT NULL DEFAULT true,
    description  TEXT NULL,
    metadata     JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMP WITHOUT TIME ZONE DEFAULT timezone('utc', clock_timestamp()) NOT NULL,
    updated_at   TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
    deleted_at   TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
    CONSTRAINT chk_schema_webhook_url_not_empty CHECK (length(trim(url)) > 0),
    CONSTRAINT chk_schema_webhook_events_not_empty CHECK (cardinality(events) > 0),
    CONSTRAINT chk_schema_webhook_events_known CHECK (
        events <@ ARRAY[
            'schema.committed',
            'schema.published',
            'schema.branch_created'
        ]::TEXT[]
    )
);

DROP TRIGGER IF EXISTS trg_schema_webhook_updated_at ON objectified.schema_webhook;
CREATE TRIGGER trg_schema_webhook_updated_at
    BEFORE UPDATE ON objectified.schema_webhook
    FOR EACH ROW
    EXECUTE FUNCTION objectified.set_updated_at();

CREATE INDEX idx_schema_webhook_project_id
    ON objectified.schema_webhook (project_id)
    WHERE deleted_at IS NULL;

CREATE TABLE objectified.schema_webhook_delivery (
    id              UUID PRIMARY KEY DEFAULT uuidv7(),
    webhook_id      UUID NOT NULL REFERENCES objectified.schema_webhook(id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL,
    payload         JSONB NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
        CONSTRAINT chk_schema_webhook_delivery_status CHECK (
            LOWER(status) IN ('pending', 'delivered', 'dead')
        ),
    attempts        INTEGER NOT NULL DEFAULT 0,
    max_attempts    INTEGER NOT NULL DEFAULT 8,
    next_attempt_at TIMESTAMP WITHOUT TIME ZONE NULL,
    last_error      TEXT NULL,
    http_status     INTEGER NULL,
    delivered_at    TIMESTAMP WITHOUT TIME ZONE NULL,
    created_at      TIMESTAMP WITHOUT TIME ZONE DEFAULT timezone('utc', clock_timestamp()) NOT NULL,
    updated_at      TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
    CONSTRAINT chk_schema_webhook_delivery_attempts_nonnegative CHECK (attempts >= 0),
    CONSTRAINT chk_schema_webhook_delivery_max_attempts CHECK (
        max_attempts >= 1 AND max_attempts <= 32
    ),
    CONSTRAINT chk_schema_webhook_delivery_attempts_cap CHECK (attempts <= max_attempts)
);

DROP TRIGGER IF EXISTS trg_schema_webhook_delivery_updated_at ON objectified.schema_webhook_delivery;
CREATE TRIGGER trg_schema_webhook_delivery_updated_at
    BEFORE UPDATE ON objectified.schema_webhook_delivery
    FOR EACH ROW
    EXECUTE FUNCTION objectified.set_updated_at();

CREATE INDEX idx_schema_webhook_delivery_work
    ON objectified.schema_webhook_delivery (created_at ASC)
    WHERE LOWER(status) = 'pending';

CREATE INDEX idx_schema_webhook_delivery_retry
    ON objectified.schema_webhook_delivery (next_attempt_at ASC NULLS FIRST)
    WHERE LOWER(status) = 'pending';

COMMENT ON TABLE objectified.schema_webhook IS
    'Outbound HTTP webhook configuration for schema lifecycle events, scoped to a project.';
COMMENT ON TABLE objectified.schema_webhook_delivery IS
    'Queued webhook delivery with retry scheduling; process via REST process endpoint or worker.';
