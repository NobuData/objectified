-- Add UNIQUE constraint on (version_id, name) for active classes
-- Enforces one class name per version; soft-deleted rows excluded so names can be reused.
-- Related: REST class create/update 409 handling (objectified-rest), Ticket #27

SET search_path TO objectified, public;

-- Partial unique index: only active classes (deleted_at IS NULL) must have unique (version_id, name)
CREATE UNIQUE INDEX uq_class_version_name_active
    ON objectified.class (version_id, name)
    WHERE deleted_at IS NULL;
