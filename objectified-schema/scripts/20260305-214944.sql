-- Ticket #11: Create class property join table
-- Schema: objectified
-- Uses: uuidv7() for primary key, WITHOUT TIME ZONE for all timestamps

SET search_path TO objectified, public;

-- Drop previous class_property table if it exists
DROP TABLE IF EXISTS objectified.class_property CASCADE;

-- class_property table: join table linking classes to properties
-- A class can have many properties; each property within a class has a unique name.
-- The 'data' column stores a possibly overridden or copied JSON Schema 2020-12 definition.
CREATE TABLE objectified.class_property (
    id          UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    class_id    UUID NOT NULL REFERENCES objectified.class(id),
    property_id UUID NOT NULL REFERENCES objectified.property(id),
    name        VARCHAR(255) NOT NULL,
    description VARCHAR(4096) NOT NULL,
    data        JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT uq_class_property_class_name UNIQUE (class_id, name)
);

-- Indices for memory-based quick lookups
CREATE INDEX idx_class_property_class_id
    ON objectified.class_property (class_id);

CREATE INDEX idx_class_property_property_id
    ON objectified.class_property (property_id);

CREATE INDEX idx_class_property_name
    ON objectified.class_property (name);

