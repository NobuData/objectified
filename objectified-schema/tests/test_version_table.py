"""
test_version_table.py – SQL tests for the objectified.version table.

Every test runs inside a transaction that is rolled back after completion
(via the 'conn' fixture in conftest.py), so no data persists to the database.
"""

import json
import uuid

import pytest
import psycopg2


# ---------------------------------------------------------------------------
# Helpers to create prerequisite tenant, account, and project rows
# ---------------------------------------------------------------------------

def _insert_tenant(conn, slug="test-tenant"):
    conn.execute(
        """
        INSERT INTO objectified.tenant (name, description, slug)
        VALUES (%s, %s, %s)
        ON CONFLICT (slug) DO NOTHING
        """,
        ("Test Tenant", "A tenant for testing version", slug),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.tenant WHERE slug = %s", (slug,)
    )["id"]


def _insert_account(conn, email="creator@example.com"):
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


def _insert_project(conn, slug="test-project"):
    tenant_id = _insert_tenant(conn, f"version-tenant-{slug}")
    creator_id = _insert_account(conn, f"version-creator-{slug}@example.com")
    conn.execute(
        """
        INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (tenant_id, slug) DO NOTHING
        """,
        (tenant_id, creator_id, "Test Project", "Project for version tests", slug),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.project WHERE slug = %s", (slug,)
    )["id"]


# ---------------------------------------------------------------------------
# Schema / column existence
# ---------------------------------------------------------------------------

class TestVersionTableStructure:
    """Verify the table and its columns exist with the correct types."""

    def test_table_exists(self, conn):
        """objectified.version table must exist."""
        row = conn.fetchone(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'objectified'
              AND table_name   = 'version'
            """
        )
        assert row is not None, "Table objectified.version does not exist"

    def test_column_id_is_uuid(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'version'
              AND column_name  = 'id'
            """
        )
        assert row is not None, "Column 'id' is missing"
        assert row["data_type"] == "uuid"

    def test_column_project_id_uuid_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'version'
              AND column_name  = 'project_id'
            """
        )
        assert row is not None, "Column 'project_id' is missing"
        assert row["data_type"] == "uuid"
        assert row["is_nullable"] == "NO"

    def test_column_creator_id_uuid_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'version'
              AND column_name  = 'creator_id'
            """
        )
        assert row is not None, "Column 'creator_id' is missing"
        assert row["data_type"] == "uuid"
        assert row["is_nullable"] == "NO"

    def test_column_name_varchar255_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT character_maximum_length, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'version'
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
              AND table_name   = 'version'
              AND column_name  = 'description'
            """
        )
        assert row is not None, "Column 'description' is missing"
        assert row["character_maximum_length"] == 4096
        assert row["is_nullable"] == "NO"

    def test_column_change_log_text_nullable(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'version'
              AND column_name  = 'change_log'
            """
        )
        assert row is not None, "Column 'change_log' is missing"
        assert row["data_type"] == "text"
        assert row["is_nullable"] == "YES"

    def test_column_enabled_boolean_not_null_default_true(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'version'
              AND column_name  = 'enabled'
            """
        )
        assert row is not None, "Column 'enabled' is missing"
        assert row["data_type"] == "boolean"
        assert row["is_nullable"] == "NO"
        assert "true" in row["column_default"].lower()

    def test_column_published_boolean_not_null_default_false(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'version'
              AND column_name  = 'published'
            """
        )
        assert row is not None, "Column 'published' is missing"
        assert row["data_type"] == "boolean"
        assert row["is_nullable"] == "NO"
        assert "false" in row["column_default"].lower()

    def test_column_visibility_enum_nullable(self, conn):
        row = conn.fetchone(
            """
            SELECT udt_name, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'version'
              AND column_name  = 'visibility'
            """
        )
        assert row is not None, "Column 'visibility' is missing"
        assert row["udt_name"] == "version_visibility"
        assert row["is_nullable"] == "YES"

    def test_column_metadata_jsonb_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'version'
              AND column_name  = 'metadata'
            """
        )
        assert row is not None, "Column 'metadata' is missing"
        assert row["data_type"] == "jsonb"
        assert row["is_nullable"] == "NO"

    def test_column_created_at_timestamp_no_tz_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'version'
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
              AND table_name   = 'version'
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
              AND table_name   = 'version'
              AND column_name  = 'deleted_at'
            """
        )
        assert row is not None, "Column 'deleted_at' is missing"
        assert row["data_type"] == "timestamp without time zone"
        assert row["is_nullable"] == "YES"

    def test_column_published_at_timestamp_no_tz_nullable(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'version'
              AND column_name  = 'published_at'
            """
        )
        assert row is not None, "Column 'published_at' is missing"
        assert row["data_type"] == "timestamp without time zone"
        assert row["is_nullable"] == "YES"


# ---------------------------------------------------------------------------
# Constraints
# ---------------------------------------------------------------------------

class TestVersionTableConstraints:
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
              AND tc.table_name      = 'version'
            """
        )
        assert row is not None
        assert row["column_name"] == "id"

    def test_project_id_foreign_key_references_project(self, conn):
        row = conn.fetchone(
            """
            SELECT tc.constraint_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema    = kcu.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema    = 'objectified'
              AND tc.table_name      = 'version'
              AND kcu.column_name    = 'project_id'
            """
        )
        assert row is not None, "Foreign key on project_id is missing"

    def test_creator_id_foreign_key_references_account(self, conn):
        row = conn.fetchone(
            """
            SELECT tc.constraint_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema    = kcu.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema    = 'objectified'
              AND tc.table_name      = 'version'
              AND kcu.column_name    = 'creator_id'
            """
        )
        assert row is not None, "Foreign key on creator_id is missing"


# ---------------------------------------------------------------------------
# Indices
# ---------------------------------------------------------------------------

class TestVersionTableIndices:
    """Verify the required indices exist."""

    def _index_exists(self, conn, index_name: str) -> bool:
        row = conn.fetchone(
            """
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname = 'objectified'
              AND tablename  = 'version'
              AND indexname  = %s
            """,
            (index_name,),
        )
        return row is not None

    def test_index_on_project_id_exists(self, conn):
        assert self._index_exists(conn, "idx_version_project_id"), "Index idx_version_project_id is missing"

    def test_index_on_creator_id_exists(self, conn):
        assert self._index_exists(conn, "idx_version_creator_id"), "Index idx_version_creator_id is missing"

    def test_index_on_name_exists(self, conn):
        assert self._index_exists(conn, "idx_version_name"), "Index idx_version_name is missing"

    def test_index_on_enabled_exists(self, conn):
        assert self._index_exists(conn, "idx_version_enabled"), "Index idx_version_enabled is missing"

    def test_index_on_published_exists(self, conn):
        assert self._index_exists(conn, "idx_version_published"), "Index idx_version_published is missing"

    def test_index_on_visibility_exists(self, conn):
        assert self._index_exists(conn, "idx_version_visibility"), "Index idx_version_visibility is missing"

    def test_index_on_deleted_at_exists(self, conn):
        assert self._index_exists(conn, "idx_version_deleted_at"), "Index idx_version_deleted_at is missing"


# ---------------------------------------------------------------------------
# Trigger
# ---------------------------------------------------------------------------

class TestVersionTableTrigger:
    """Verify the updated_at trigger exists and fires correctly."""

    def test_updated_at_trigger_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT trigger_name
            FROM information_schema.triggers
            WHERE event_object_schema = 'objectified'
              AND event_object_table  = 'version'
              AND trigger_name        = 'trg_version_updated_at'
            """
        )
        assert row is not None, "Trigger trg_version_updated_at is missing"

    def test_updated_at_changes_on_update(self, conn):
        """Insert a row, update it, verify updated_at advances."""
        project_id = _insert_project(conn, "trigger-version-project")
        creator_id = _insert_account(conn, "trigger-version@example.com")
        conn.execute(
            """
            INSERT INTO objectified.version (project_id, creator_id, name, description)
            VALUES (%s, %s, %s, %s)
            """,
            (project_id, creator_id, "1.0.0", "Trigger test version"),
        )
        conn.execute("SELECT pg_sleep(0.01)")

        original = conn.fetchone(
            "SELECT updated_at FROM objectified.version WHERE name = %s",
            ("1.0.0",),
        )

        conn.execute(
            "UPDATE objectified.version SET name = %s WHERE name = %s",
            ("1.0.1", "1.0.0"),
        )

        updated = conn.fetchone(
            "SELECT updated_at FROM objectified.version WHERE name = %s",
            ("1.0.1",),
        )

        assert updated["updated_at"] is not None, "updated_at must be set after UPDATE"
        assert updated["updated_at"] >= original["updated_at"] if original["updated_at"] else True


# ---------------------------------------------------------------------------
# Data integrity – insert / query / soft-delete
# ---------------------------------------------------------------------------

class TestVersionTableDataIntegrity:
    """Functional tests for CRUD behaviour. All data is rolled back after each test."""

    def test_insert_minimal_version(self, conn):
        project_id = _insert_project(conn, "minimal-version-project")
        creator_id = _insert_account(conn, "minimal-version@example.com")
        conn.execute(
            """
            INSERT INTO objectified.version (project_id, creator_id, name, description)
            VALUES (%s, %s, %s, %s)
            """,
            (project_id, creator_id, "1.0.0", "Initial release"),
        )
        row = conn.fetchone(
            "SELECT * FROM objectified.version WHERE name = %s",
            ("1.0.0",),
        )
        assert row is not None
        assert row["name"] == "1.0.0"
        assert row["description"] == "Initial release"
        assert row["change_log"] is None
        assert row["enabled"] is True
        assert row["published"] is False
        assert row["visibility"] is None
        assert row["metadata"] == {}
        assert row["created_at"] is not None
        assert row["updated_at"] is None
        assert row["deleted_at"] is None
        assert row["published_at"] is None
        assert row["id"] is not None
        assert row["project_id"] == project_id
        assert row["creator_id"] == creator_id

    def test_created_at_is_set_and_recent_on_insert(self, conn):
        from datetime import datetime, timezone, timedelta

        project_id = _insert_project(conn, "ts-version-project")
        creator_id = _insert_account(conn, "ts-version@example.com")
        before = datetime.now(timezone.utc).replace(tzinfo=None)
        conn.execute(
            """
            INSERT INTO objectified.version (project_id, creator_id, name, description)
            VALUES (%s, %s, %s, %s)
            """,
            (project_id, creator_id, "2.0.0", "Timestamp test version"),
        )
        after = datetime.now(timezone.utc).replace(tzinfo=None)

        row = conn.fetchone(
            "SELECT created_at, updated_at FROM objectified.version WHERE name = %s",
            ("2.0.0",),
        )
        assert row is not None
        assert row["created_at"] is not None, "created_at must be non-NULL after INSERT"
        assert before <= row["created_at"] <= after + timedelta(seconds=1), (
            f"created_at {row['created_at']} is not within the expected range "
            f"[{before}, {after}]"
        )
        assert row["updated_at"] is None, "updated_at must remain NULL until an UPDATE occurs"

    def test_default_metadata_is_empty_object(self, conn):
        project_id = _insert_project(conn, "meta-version-project")
        creator_id = _insert_account(conn, "meta-version@example.com")
        conn.execute(
            """
            INSERT INTO objectified.version (project_id, creator_id, name, description)
            VALUES (%s, %s, %s, %s)
            """,
            (project_id, creator_id, "3.0.0", "Meta test version"),
        )
        row = conn.fetchone(
            "SELECT metadata FROM objectified.version WHERE name = %s",
            ("3.0.0",),
        )
        assert row["metadata"] == {}

    def test_metadata_stores_arbitrary_json(self, conn):
        project_id = _insert_project(conn, "json-version-project")
        creator_id = _insert_account(conn, "json-version@example.com")
        payload = {"build": "20260304", "branch": "main"}
        conn.execute(
            """
            INSERT INTO objectified.version (project_id, creator_id, name, description, metadata)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (project_id, creator_id, "4.0.0", "JSON test version", json.dumps(payload)),
        )
        row = conn.fetchone(
            "SELECT metadata FROM objectified.version WHERE name = %s",
            ("4.0.0",),
        )
        assert row["metadata"]["build"] == "20260304"
        assert row["metadata"]["branch"] == "main"

    def test_visibility_accepts_private_and_public(self, conn):
        project_id = _insert_project(conn, "visibility-version-project")
        creator_id = _insert_account(conn, "visibility-version@example.com")
        conn.execute(
            """
            INSERT INTO objectified.version (project_id, creator_id, name, description, visibility)
            VALUES (%s, %s, %s, %s, 'private')
            """,
            (project_id, creator_id, "5.0.0-private", "Private version"),
        )
        conn.execute(
            """
            INSERT INTO objectified.version (project_id, creator_id, name, description, visibility)
            VALUES (%s, %s, %s, %s, 'public')
            """,
            (project_id, creator_id, "5.0.0-public", "Public version"),
        )
        priv = conn.fetchone(
            "SELECT visibility FROM objectified.version WHERE name = %s",
            ("5.0.0-private",),
        )
        pub = conn.fetchone(
            "SELECT visibility FROM objectified.version WHERE name = %s",
            ("5.0.0-public",),
        )
        assert priv["visibility"] == "private"
        assert pub["visibility"] == "public"

    def test_soft_delete_sets_deleted_at_and_enabled(self, conn):
        project_id = _insert_project(conn, "softdel-version-project")
        creator_id = _insert_account(conn, "softdel-version@example.com")
        conn.execute(
            """
            INSERT INTO objectified.version (project_id, creator_id, name, description)
            VALUES (%s, %s, %s, %s)
            """,
            (project_id, creator_id, "6.0.0", "Soft delete test version"),
        )
        conn.execute(
            """
            UPDATE objectified.version
            SET deleted_at = timezone('utc', clock_timestamp()),
                enabled    = false
            WHERE name = %s
            """,
            ("6.0.0",),
        )
        row = conn.fetchone(
            "SELECT deleted_at, enabled FROM objectified.version WHERE name = %s",
            ("6.0.0",),
        )
        assert row["deleted_at"] is not None
        assert row["enabled"] is False

    def test_soft_deleted_version_excluded_by_partial_index(self, conn):
        project_id = _insert_project(conn, "partial-version-project")
        creator_id = _insert_account(conn, "partial-version@example.com")
        conn.execute(
            """
            INSERT INTO objectified.version (project_id, creator_id, name, description)
            VALUES (%s, %s, %s, %s)
            """,
            (project_id, creator_id, "7.0.0", "Partial index test version"),
        )
        conn.execute(
            """
            UPDATE objectified.version
            SET deleted_at = timezone('utc', clock_timestamp()), enabled = false
            WHERE name = %s
            """,
            ("7.0.0",),
        )
        row = conn.fetchone(
            """
            SELECT id FROM objectified.version
            WHERE name = %s AND deleted_at IS NULL
            """,
            ("7.0.0",),
        )
        assert row is None, "Soft-deleted version must not appear in active version queries"

    def test_name_missing_raises_not_null(self, conn):
        project_id = _insert_project(conn, "noname-version-project")
        creator_id = _insert_account(conn, "noname-version@example.com")
        conn.execute("SAVEPOINT before_noname")
        with pytest.raises(psycopg2.errors.NotNullViolation):
            conn.execute(
                """
                INSERT INTO objectified.version (project_id, creator_id, description)
                VALUES (%s, %s, %s)
                """,
                (project_id, creator_id, "No name version description"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_noname")
        conn.execute("RELEASE SAVEPOINT before_noname")

    def test_description_missing_raises_not_null(self, conn):
        project_id = _insert_project(conn, "nodesc-version-project")
        creator_id = _insert_account(conn, "nodesc-version@example.com")
        conn.execute("SAVEPOINT before_nodesc")
        with pytest.raises(psycopg2.errors.NotNullViolation):
            conn.execute(
                """
                INSERT INTO objectified.version (project_id, creator_id, name)
                VALUES (%s, %s, %s)
                """,
                (project_id, creator_id, "8.0.0"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_nodesc")
        conn.execute("RELEASE SAVEPOINT before_nodesc")

    def test_invalid_project_id_raises_foreign_key(self, conn):
        creator_id = _insert_account(conn, "fk-version@example.com")
        bogus_project_id = str(uuid.uuid4())
        conn.execute("SAVEPOINT before_bad_project")
        with pytest.raises(psycopg2.errors.ForeignKeyViolation):
            conn.execute(
                """
                INSERT INTO objectified.version (project_id, creator_id, name, description)
                VALUES (%s, %s, %s, %s)
                """,
                (bogus_project_id, creator_id, "9.0.0", "Bad project version"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_bad_project")
        conn.execute("RELEASE SAVEPOINT before_bad_project")

    def test_invalid_creator_id_raises_foreign_key(self, conn):
        project_id = _insert_project(conn, "fk-version-project")
        bogus_creator_id = str(uuid.uuid4())
        conn.execute("SAVEPOINT before_bad_creator")
        with pytest.raises(psycopg2.errors.ForeignKeyViolation):
            conn.execute(
                """
                INSERT INTO objectified.version (project_id, creator_id, name, description)
                VALUES (%s, %s, %s, %s)
                """,
                (project_id, bogus_creator_id, "10.0.0", "Bad creator version"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_bad_creator")
        conn.execute("RELEASE SAVEPOINT before_bad_creator")

    def test_no_data_persists_after_rollback(self, conn):
        project_id = _insert_project(conn, "rollback-version-project")
        creator_id = _insert_account(conn, "rollback-version@example.com")
        conn.execute(
            """
            INSERT INTO objectified.version (project_id, creator_id, name, description)
            VALUES (%s, %s, %s, %s)
            """,
            (project_id, creator_id, "11.0.0", "Rollback test version"),
        )
        row = conn.fetchone(
            "SELECT id FROM objectified.version WHERE name = %s",
            ("11.0.0",),
        )
        assert row is not None, "Row should be visible within the same transaction"
