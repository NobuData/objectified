-- Migration: Extend version_history operation check for commit/push/merge (GH-40)
-- Ensures version_history can store full snapshots for COMMIT, PUSH, MERGE so that
-- POST /v1/versions/{id}/commit, push, GET pull, POST merge are fully supported.
--
-- version_history already stores:
--   - For INSERT/UPDATE/DELETE: full version row in old_data/new_data.
--   - For COMMIT/PUSH/MERGE (this migration): new_data holds full schema snapshot
--     (classes + canvas_metadata) from version_snapshot; pull/merge use
--     objectified.version_snapshot full snapshots and compute deltas in application.
-- Full snapshots are sufficient for pull (diff since revision) and merge (three-way
-- or two-way with schema-merge semantics).

SET search_path TO objectified, public;

-- Extend allowed operations to include COMMIT, PUSH, MERGE (used by version commit routes).
ALTER TABLE objectified.version_history
    DROP CONSTRAINT IF EXISTS version_history_operation_check;

ALTER TABLE objectified.version_history
    ADD CONSTRAINT version_history_operation_check
    CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE', 'COMMIT', 'PUSH', 'MERGE'));
