-- GitHub #203: Publish target/channel, publish history audit trail.

SET search_path TO objectified, public;

ALTER TABLE objectified.version
    ADD COLUMN IF NOT EXISTS publish_target VARCHAR(64) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS objectified.version_publish_event (
    id UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    version_id UUID NOT NULL REFERENCES objectified.version (id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES objectified.project (id) ON DELETE CASCADE,
    event_type VARCHAR(16) NOT NULL,
    target VARCHAR(64) DEFAULT NULL,
    visibility VARCHAR(16) DEFAULT NULL,
    note TEXT DEFAULT NULL,
    actor_id UUID DEFAULT NULL REFERENCES objectified.account (id) ON DELETE SET NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc', clock_timestamp()),
    CONSTRAINT chk_version_publish_event_type CHECK (event_type IN ('publish', 'unpublish'))
);

CREATE INDEX IF NOT EXISTS idx_version_publish_event_version_created
    ON objectified.version_publish_event (version_id, created_at DESC);
