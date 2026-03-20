-- GH-135 follow-up: tighten schema_webhook_delivery constraints and add processing state.
-- 1. Add CHECK constraint on event_type so only known event names are stored.
-- 2. Extend status CHECK to include 'processing' for concurrent-safe delivery workers.

SET search_path TO objectified, public;

-- Allow workers to claim a delivery atomically before POSTing.
ALTER TABLE objectified.schema_webhook_delivery
    DROP CONSTRAINT chk_schema_webhook_delivery_status;

ALTER TABLE objectified.schema_webhook_delivery
    ADD CONSTRAINT chk_schema_webhook_delivery_status CHECK (
        LOWER(status) IN ('pending', 'processing', 'delivered', 'dead')
    );

-- Ensure only known event types can be enqueued.
ALTER TABLE objectified.schema_webhook_delivery
    ADD CONSTRAINT chk_schema_webhook_delivery_event_type CHECK (
        event_type IN (
            'schema.committed',
            'schema.published',
            'schema.branch_created'
        )
    );
