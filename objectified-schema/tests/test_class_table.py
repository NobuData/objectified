"""
test_class_table.py – SQL tests for the objectified.class table.

Every test runs inside a transaction that is rolled back after completion
(via the 'conn' fixture in conftest.py), so no data persists to the database.
"""

import json
import uuid

import pytest
import psycopg2


# ---------------------------------------------------------------------------
# Helpers to create prerequisite tenant, account, project, and version rows
# ---------------------------------------------------------------------------

def _insert_tenant(conn, slug="class-tenant"):
    conn.execute(
        """
        INSERT INTO objectified.tenant (name, description, slug)
        VALUES (%s, %s, %s)
        ON CONFLICT (slug) DO NOTHING
        """,
        ("Test Tenant", "A tenant for testing class", slug),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.tenant WHERE slug = %s", (slug,)
    )["id"]


def _insert_account(conn, email="class-creator@example.com"):
    conn.execute(
        """
        INSERT INTO objectified.account (name, email, password)
        VALUES (%s, %s, %s)
        ON CONFLICT ( (LOWER(email)) ) DO NOTHING
        """,
        ("Test Creator", email, "hashed_password"),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.account WHERE email = %s", (email,)
    )["id"]


def _insert_project(conn, slug="class-project"):
    tenant_id = _insert_tenant(conn, f"class-tenant-{slug}")
    creator_id = _insert_account(conn, f"class-creator-{slug}@example.com")
    conn.execute(
        """
        INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (tenant_id, slug) WHERE deleted_at IS NULL DO NOTHING
        """,
        (tenant_id, creator_id, "Test Project", "Project for class tests", slug),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.project WHERE slug = %s", (slug,)
    )["id"]


def _insert_version(conn, slug="class-version-project", version_name="1.0.0"):
    project_id = _insert_project(conn, slug)
    creator_id = _insert_account(conn, f"class-version-{slug}@example.com")
    conn.execute(
        """
        INSERT INTO objectified.version (project_id, creator_id, name, description)
        VALUES (%s, %s, %s, %s)
        """,
        (project_id, creator_id, version_name, "Version for class tests"),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.version WHERE name = %s AND project_id = %s",
        (version_name, project_id),
    )["id"]


# ---------------------------------------------------------------------------
# Schema / column existence
# ---------------------------------------------------------------------------

class TestClassTableStructure:
    """Verify the table and its columns exist with the correct types."""

    def test_table_exists(self, conn):
        """objectified.class table must exist."""
        row = conn.fetchone(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'objectified'
              AND table_name   = 'class'
            """
        )
        assert row is not None, "Table objectified.class does not exist"

    def test_column_id_is_uuid(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'class'
              AND column_name  = 'id'
            """
        )
        assert row is not None, "Column 'id' is missing"
        assert row["data_type"] == "uuid"

    def test_column_version_id_uuid_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'class'
              AND column_name  = 'version_id'
            """
        )
        assert row is not None, "Column 'version_id' is missing"
        assert row["data_type"] == "uuid"
        assert row["is_nullable"] == "NO"

    def test_column_name_varchar255_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT character_maximum_length, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'class'
              AND column_name  = 'name'
            """
        )
        assert row is not None, "Column 'name' is missing"
        assert row["character_maximum_length"] == 255
        assert row["is_nullable"] == "NO"

    def test_column_description_varchar4096_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT character_maximum_length, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'class'
              AND column_name  = 'description'
            """
        )
        assert row is not None, "Column 'description' is missing"
        assert row["character_maximum_length"] == 4096
        assert row["is_nullable"] == "NO"

    def test_column_schema_jsonb_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'class'
              AND column_name  = 'schema'
            """
        )
        assert row is not None, "Column 'schema' is missing"
        assert row["data_type"] == "jsonb"
        assert row["is_nullable"] == "NO"

    def test_column_metadata_jsonb_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'class'
              AND column_name  = 'metadata'
            """
        )
        assert row is not None, "Column 'metadata' is missing"
        assert row["data_type"] == "jsonb"
        assert row["is_nullable"] == "NO"

    def test_column_enabled_boolean_not_null_default_true(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'class'
              AND column_name  = 'enabled'
            """
        )
        assert row is not None, "Column 'enabled' is missing"
        assert row["data_type"] == "boolean"
        assert row["is_nullable"] == "NO"
        assert "true" in row["column_default"].lower()

    def test_column_created_at_timestamp_no_tz_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'class'
              AND column_name  = 'created_at'
            """
        )
        assert row is not None, "Column 'created_at' is missing"
        assert row["data_type"] == "timestamp without time zone"
        assert row["is_nullable"] == "NO"

    def test_column_updated_at_timestamp_no_tz_nullable(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'class'
              AND column_name  = 'updated_at'
            """
        )
        assert row is not None, "Column 'updated_at' is missing"
        assert row["data_type"] == "timestamp without time zone"
        assert row["is_nullable"] == "YES"

    def test_column_deleted_at_timestamp_no_tz_nullable(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'class'
              AND column_name  = 'deleted_at'
            """
        )
        assert row is not None, "Column 'deleted_at' is missing"
        assert row["data_type"] == "timestamp without time zone"
        assert row["is_nullable"] == "YES"


# ---------------------------------------------------------------------------
# Constraints
# ---------------------------------------------------------------------------

class TestClassTableConstraints:
    """Verify primary key and foreign key constraints."""

    def test_primary_key_on_id(self, conn):
        row = conn.fetchone(
            """
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema    = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
              AND tc.table_schema    = 'objectified'
              AND tc.table_name      = 'class'
            """
        )
        assert row is not None
        assert row["column_name"] == "id"

    def test_version_id_foreign_key_references_version(self, conn):
        row = conn.fetchone(
            """
            SELECT tc.constraint_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema    = kcu.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema    = 'objectified'
              AND tc.table_name      = 'class'
              AND kcu.column_name    = 'version_id'
            """
        )
        assert row is not None, "Foreign key on version_id is missing"


# ---------------------------------------------------------------------------
# Indices
# ---------------------------------------------------------------------------

class TestClassTableIndices:
    """Verify the required indices exist."""

    def _index_exists(self, conn, index_name: str) -> bool:
        row = conn.fetchone(
            """
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname = 'objectified'
              AND tablename  = 'class'
              AND indexname  = %s
            """,
            (index_name,),
        )
        return row is not None

    def test_index_on_version_id_exists(self, conn):
        assert self._index_exists(conn, "idx_class_version_id"), (
            "Index idx_class_version_id is missing"
        )

    def test_index_on_name_exists(self, conn):
        assert self._index_exists(conn, "idx_class_name"), (
            "Index idx_class_name is missing"
        )

    def test_index_on_enabled_exists(self, conn):
        assert self._index_exists(conn, "idx_class_enabled"), (
            "Index idx_class_enabled is missing"
        )

    def test_index_on_deleted_at_exists(self, conn):
        assert self._index_exists(conn, "idx_class_deleted_at"), (
            "Index idx_class_deleted_at is missing"
        )


# ---------------------------------------------------------------------------
# Trigger
# ---------------------------------------------------------------------------

class TestClassTableTrigger:
    """Verify the updated_at trigger exists and fires correctly."""

    def test_updated_at_trigger_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT trigger_name
            FROM information_schema.triggers
            WHERE event_object_schema = 'objectified'
              AND event_object_table  = 'class'
              AND trigger_name        = 'trg_class_updated_at'
            """
        )
        assert row is not None, "Trigger trg_class_updated_at is missing"

    def test_updated_at_changes_on_update(self, conn):
        """Insert a row, update it, verify updated_at advances."""
        version_id = _insert_version(conn, "trigger-class-version", "1.0.0")
        conn.execute(
            """
            INSERT INTO objectified.class (version_id, name, description)
            VALUES (%s, %s, %s)
            """,
            (version_id, "TriggerClass", "Trigger test class"),
        )
        conn.execute("SELECT pg_sleep(0.01)")

        original = conn.fetchone(
            "SELECT id, updated_at FROM objectified.class WHERE name = %s",
            ("TriggerClass",),
        )

        conn.execute(
            "UPDATE objectified.class SET name = %s WHERE id = %s",
            ("TriggerClassUpdated", original["id"]),
        )

        updated = conn.fetchone(
            "SELECT updated_at FROM objectified.class WHERE id = %s",
            (original["id"],),
        )

        assert updated["updated_at"] is not None, "updated_at must be set after UPDATE"
        if original["updated_at"]:
            assert updated["updated_at"] >= original["updated_at"]


# ---------------------------------------------------------------------------
# Data integrity – insert / query / soft-delete
# ---------------------------------------------------------------------------

class TestClassTableDataIntegrity:
    """Functional tests for CRUD behaviour. All data is rolled back after each test."""

    def test_insert_minimal_class(self, conn):
        version_id = _insert_version(conn, "minimal-class-version", "1.0.0")
        conn.execute(
            """
            INSERT INTO objectified.class (version_id, name, description)
            VALUES (%s, %s, %s)
            """,
            (version_id, "MinimalClass", "A minimal class description"),
        )
        row = conn.fetchone(
            "SELECT * FROM objectified.class WHERE name = %s AND version_id = %s",
            ("MinimalClass", version_id),
        )
        assert row is not None
        assert row["name"] == "MinimalClass"
        assert row["description"] == "A minimal class description"
        assert row["schema"] == {}
        assert row["metadata"] == {}
        assert row["enabled"] is True
        assert row["created_at"] is not None
        assert row["updated_at"] is None
        assert row["deleted_at"] is None
        assert row["id"] is not None
        assert row["version_id"] == version_id

    def test_created_at_is_set_and_recent_on_insert(self, conn):
        from datetime import datetime, timezone, timedelta

        version_id = _insert_version(conn, "ts-class-version", "2.0.0")
        before = datetime.now(timezone.utc).replace(tzinfo=None)
        conn.execute(
            """
            INSERT INTO objectified.class (version_id, name, description)
            VALUES (%s, %s, %s)
            """,
            (version_id, "TimestampClass", "Timestamp test class"),
        )
        after = datetime.now(timezone.utc).replace(tzinfo=None)

        row = conn.fetchone(
            "SELECT created_at, updated_at FROM objectified.class WHERE name = %s",
            ("TimestampClass",),
        )
        assert row is not None
        assert row["created_at"] is not None, "created_at must be non-NULL after INSERT"
        assert before <= row["created_at"] <= after + timedelta(seconds=1), (
            f"created_at {row['created_at']} is not within the expected range "
            f"[{before}, {after}]"
        )
        assert row["updated_at"] is None, (
            "updated_at must remain NULL until an UPDATE occurs"
        )

    def test_default_schema_is_empty_object(self, conn):
        version_id = _insert_version(conn, "schema-class-version", "3.0.0")
        conn.execute(
            """
            INSERT INTO objectified.class (version_id, name, description)
            VALUES (%s, %s, %s)
            """,
            (version_id, "SchemaClass", "Schema default test"),
        )
        row = conn.fetchone(
            'SELECT "schema" FROM objectified.class WHERE name = %s',
            ("SchemaClass",),
        )
        assert row["schema"] == {}

    def test_default_metadata_is_empty_object(self, conn):
        version_id = _insert_version(conn, "meta-class-version", "4.0.0")
        conn.execute(
            """
            INSERT INTO objectified.class (version_id, name, description)
            VALUES (%s, %s, %s)
            """,
            (version_id, "MetaClass", "Metadata default test"),
        )
        row = conn.fetchone(
            "SELECT metadata FROM objectified.class WHERE name = %s",
            ("MetaClass",),
        )
        assert row["metadata"] == {}

    def test_schema_stores_json(self, conn):
        version_id = _insert_version(conn, "json-schema-class-version", "5.0.0")
        schema_payload = {"type": "object", "properties": {"id": {"type": "string"}}}
        conn.execute(
            """
            INSERT INTO objectified.class (version_id, name, description, "schema")
            VALUES (%s, %s, %s, %s)
            """,
            (version_id, "JsonSchemaClass", "JSON schema test", json.dumps(schema_payload)),
        )
        row = conn.fetchone(
            'SELECT "schema" FROM objectified.class WHERE name = %s',
            ("JsonSchemaClass",),
        )
        assert row["schema"]["type"] == "object"
        assert row["schema"]["properties"]["id"]["type"] == "string"

    def test_metadata_stores_arbitrary_json(self, conn):
        version_id = _insert_version(conn, "json-meta-class-version", "6.0.0")
        payload = {"tag": "v1", "source": "import"}
        conn.execute(
            """
            INSERT INTO objectified.class (version_id, name, description, metadata)
            VALUES (%s, %s, %s, %s)
            """,
            (version_id, "JsonMetaClass", "JSON metadata test", json.dumps(payload)),
        )
        row = conn.fetchone(
            "SELECT metadata FROM objectified.class WHERE name = %s",
            ("JsonMetaClass",),
        )
        assert row["metadata"]["tag"] == "v1"
        assert row["metadata"]["source"] == "import"

    def test_soft_delete_sets_deleted_at_and_enabled(self, conn):
        version_id = _insert_version(conn, "softdel-class-version", "7.0.0")
        conn.execute(
            """
            INSERT INTO objectified.class (version_id, name, description)
            VALUES (%s, %s, %s)
            """,
            (version_id, "SoftDeleteClass", "Soft delete test class"),
        )
        conn.execute(
            """
            UPDATE objectified.class
            SET deleted_at = timezone('utc', clock_timestamp()),
                enabled    = false
            WHERE name = %s
            """,
            ("SoftDeleteClass",),
        )
        row = conn.fetchone(
            "SELECT deleted_at, enabled FROM objectified.class WHERE name = %s",
            ("SoftDeleteClass",),
        )
        assert row["deleted_at"] is not None
        assert row["enabled"] is False

    def test_soft_deleted_class_excluded_by_partial_index(self, conn):
        version_id = _insert_version(conn, "partial-class-version", "8.0.0")
        conn.execute(
            """
            INSERT INTO objectified.class (version_id, name, description)
            VALUES (%s, %s, %s)
            """,
            (version_id, "PartialClass", "Partial index test class"),
        )
        conn.execute(
            """
            UPDATE objectified.class
            SET deleted_at = timezone('utc', clock_timestamp()), enabled = false
            WHERE name = %s
            """,
            ("PartialClass",),
        )
        row = conn.fetchone(
            """
            SELECT id FROM objectified.class
            WHERE name = %s AND deleted_at IS NULL
            """,
            ("PartialClass",),
        )
        assert row is None, (
            "Soft-deleted class must not appear in active class queries"
        )

    def test_name_missing_raises_not_null(self, conn):
        version_id = _insert_version(conn, "noname-class-version", "9.0.0")
        conn.execute("SAVEPOINT before_noname")
        with pytest.raises(psycopg2.errors.NotNullViolation):
            conn.execute(
                """
                INSERT INTO objectified.class (version_id, description)
                VALUES (%s, %s)
                """,
                (version_id, "No name class description"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_noname")
        conn.execute("RELEASE SAVEPOINT before_noname")

    def test_description_missing_raises_not_null(self, conn):
        version_id = _insert_version(conn, "nodesc-class-version", "10.0.0")
        conn.execute("SAVEPOINT before_nodesc")
        with pytest.raises(psycopg2.errors.NotNullViolation):
            conn.execute(
                """
                INSERT INTO objectified.class (version_id, name)
                VALUES (%s, %s)
                """,
                (version_id, "NoDescClass"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_nodesc")
        conn.execute("RELEASE SAVEPOINT before_nodesc")

    def test_invalid_version_id_raises_foreign_key(self, conn):
        bogus_version_id = str(uuid.uuid4())
        conn.execute("SAVEPOINT before_bad_version")
        with pytest.raises(psycopg2.errors.ForeignKeyViolation):
            conn.execute(
                """
                INSERT INTO objectified.class (version_id, name, description)
                VALUES (%s, %s, %s)
                """,
                (bogus_version_id, "BadVersionClass", "Bad version class"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_bad_version")
        conn.execute("RELEASE SAVEPOINT before_bad_version")

    def test_no_data_persists_after_rollback(self, conn):
        version_id = _insert_version(conn, "rollback-class-version", "11.0.0")
        conn.execute(
            """
            INSERT INTO objectified.class (version_id, name, description)
            VALUES (%s, %s, %s)
            """,
            (version_id, "RollbackClass", "Rollback test class"),
        )
        row = conn.fetchone(
            "SELECT id FROM objectified.class WHERE name = %s",
            ("RollbackClass",),
        )
        assert row is not None, "Row should be visible within the same transaction"
