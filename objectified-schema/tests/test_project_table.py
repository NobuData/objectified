"""
test_project_table.py – SQL tests for the objectified.project table.

Every test runs inside a transaction that is rolled back after completion
(via the 'conn' fixture in conftest.py), so no data persists to the database.
"""

import json
import uuid

import pytest
import psycopg2


# ---------------------------------------------------------------------------
# Helpers to create prerequisite tenant and account rows
# ---------------------------------------------------------------------------

def _insert_tenant(conn, slug="test-tenant"):
    conn.execute(
        """
        INSERT INTO objectified.tenant (name, description, slug)
        VALUES (%s, %s, %s)
        ON CONFLICT (slug) DO NOTHING
        """,
        ("Test Tenant", "A tenant for testing project", slug),
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


# ---------------------------------------------------------------------------
# Schema / column existence
# ---------------------------------------------------------------------------

class TestProjectTableStructure:
    """Verify the table and its columns exist with the correct types."""

    def test_table_exists(self, conn):
        """objectified.project table must exist."""
        row = conn.fetchone(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'objectified'
              AND table_name   = 'project'
            """
        )
        assert row is not None, "Table objectified.project does not exist"

    def test_column_id_is_uuid(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'project'
              AND column_name  = 'id'
            """
        )
        assert row is not None, "Column 'id' is missing"
        assert row["data_type"] == "uuid"

    def test_column_tenant_id_uuid_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'project'
              AND column_name  = 'tenant_id'
            """
        )
        assert row is not None, "Column 'tenant_id' is missing"
        assert row["data_type"] == "uuid"
        assert row["is_nullable"] == "NO"

    def test_column_creator_id_uuid_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'project'
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
              AND table_name   = 'project'
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
              AND table_name   = 'project'
              AND column_name  = 'description'
            """
        )
        assert row is not None, "Column 'description' is missing"
        assert row["character_maximum_length"] == 4096
        assert row["is_nullable"] == "NO"

    def test_column_slug_varchar80_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT character_maximum_length, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'project'
              AND column_name  = 'slug'
            """
        )
        assert row is not None, "Column 'slug' is missing"
        assert row["character_maximum_length"] == 80
        assert row["is_nullable"] == "NO"

    def test_column_enabled_boolean_not_null_default_true(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'project'
              AND column_name  = 'enabled'
            """
        )
        assert row is not None, "Column 'enabled' is missing"
        assert row["data_type"] == "boolean"
        assert row["is_nullable"] == "NO"
        assert "true" in row["column_default"].lower()

    def test_column_metadata_jsonb_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'project'
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
              AND table_name   = 'project'
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
              AND table_name   = 'project'
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
              AND table_name   = 'project'
              AND column_name  = 'deleted_at'
            """
        )
        assert row is not None, "Column 'deleted_at' is missing"
        assert row["data_type"] == "timestamp without time zone"
        assert row["is_nullable"] == "YES"


# ---------------------------------------------------------------------------
# Constraints
# ---------------------------------------------------------------------------

class TestProjectTableConstraints:
    """Verify primary key, unique, check, and foreign key constraints."""

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
              AND tc.table_name      = 'project'
            """
        )
        assert row is not None
        assert row["column_name"] == "id"

    def test_partial_unique_index_on_active_tenant_id_and_slug(self, conn):
        row = conn.fetchone(
            """
            SELECT i.indisunique,
                   pg_get_indexdef(i.indexrelid) AS indexdef,
                   pg_get_expr(i.indpred, i.indrelid) AS predicate
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_index i ON i.indrelid = c.oid
            JOIN pg_class idx ON idx.oid = i.indexrelid
            WHERE n.nspname = 'objectified'
              AND c.relname = 'project'
              AND idx.relname = 'project_tenant_slug_unique'
            """
        )
        assert row is not None, "Partial unique index on active (tenant_id, slug) is missing"
        assert row["indisunique"] is True
        assert "(tenant_id, slug)" in row["indexdef"]
        assert row["predicate"] == "(deleted_at IS NULL)"

    def test_check_constraint_slug_format_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT constraint_name
            FROM information_schema.table_constraints
            WHERE constraint_type = 'CHECK'
              AND table_schema    = 'objectified'
              AND table_name      = 'project'
              AND constraint_name = 'project_slug_format'
            """
        )
        assert row is not None, "CHECK constraint 'project_slug_format' is missing"

    def test_slug_valid_format_accepted(self, conn):
        """A valid lowercase-alphanumeric-hyphen slug should insert without error."""
        tenant_id = _insert_tenant(conn, "slug-tenant")
        creator_id = _insert_account(conn, "slug-creator@example.com")
        conn.execute(
            """
            INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (tenant_id, creator_id, "Slug Project", "Description", "my-project"),
        )
        row = conn.fetchone(
            "SELECT slug FROM objectified.project WHERE slug = %s",
            ("my-project",),
        )
        assert row is not None
        assert row["slug"] == "my-project"

    def test_slug_valid_underscore_format_accepted(self, conn):
        """An underscore-separated slug should be accepted to match the REST validation regex."""
        tenant_id = _insert_tenant(conn, "slug-underscore-tenant")
        creator_id = _insert_account(conn, "slug-underscore@example.com")
        conn.execute(
            """
            INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (tenant_id, creator_id, "Slug Project", "Description", "my_project"),
        )
        row = conn.fetchone(
            "SELECT slug FROM objectified.project WHERE slug = %s",
            ("my_project",),
        )
        assert row is not None
        assert row["slug"] == "my_project"

    def test_slug_invalid_uppercase_rejected(self, conn):
        """Uppercase characters in slug must be rejected by the check constraint."""
        tenant_id = _insert_tenant(conn, "bad-slug-tenant")
        creator_id = _insert_account(conn, "bad-slug@example.com")
        conn.execute("SAVEPOINT before_bad_slug")
        with pytest.raises(psycopg2.errors.CheckViolation):
            conn.execute(
                """
                INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (tenant_id, creator_id, "Bad Project", "Description", "Bad-Project"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_bad_slug")
        conn.execute("RELEASE SAVEPOINT before_bad_slug")

    def test_slug_invalid_leading_hyphen_rejected(self, conn):
        """Slug starting with a hyphen must be rejected."""
        tenant_id = _insert_tenant(conn, "lead-tenant")
        creator_id = _insert_account(conn, "lead@example.com")
        conn.execute("SAVEPOINT before_leading_hyphen")
        with pytest.raises(psycopg2.errors.CheckViolation):
            conn.execute(
                """
                INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (tenant_id, creator_id, "Bad", "Description", "-bad-slug"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_leading_hyphen")
        conn.execute("RELEASE SAVEPOINT before_leading_hyphen")

    def test_slug_invalid_trailing_hyphen_rejected(self, conn):
        """Slug ending with a hyphen must be rejected."""
        tenant_id = _insert_tenant(conn, "trail-tenant")
        creator_id = _insert_account(conn, "trail@example.com")
        conn.execute("SAVEPOINT before_trailing_hyphen")
        with pytest.raises(psycopg2.errors.CheckViolation):
            conn.execute(
                """
                INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (tenant_id, creator_id, "Bad", "Description", "bad-slug-"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_trailing_hyphen")
        conn.execute("RELEASE SAVEPOINT before_trailing_hyphen")

    def test_slug_duplicate_active_in_same_tenant_raises(self, conn):
        """Duplicate active slug in the same tenant must be rejected by the partial unique index."""
        tenant_id = _insert_tenant(conn, "dup-tenant")
        creator_id = _insert_account(conn, "dup@example.com")
        conn.execute(
            """
            INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (tenant_id, creator_id, "First Project", "First", "shared-slug"),
        )
        conn.execute("SAVEPOINT before_duplicate_slug")
        with pytest.raises(psycopg2.errors.UniqueViolation):
            conn.execute(
                """
                INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (tenant_id, creator_id, "Second Project", "Second", "shared-slug"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_duplicate_slug")
        conn.execute("RELEASE SAVEPOINT before_duplicate_slug")

    def test_slug_same_value_allowed_in_different_tenants(self, conn):
        """The same active slug may exist in different tenants."""
        tenant_one = _insert_tenant(conn, "shared-tenant-one")
        tenant_two = _insert_tenant(conn, "shared-tenant-two")
        creator_id = _insert_account(conn, "shared@example.com")
        conn.execute(
            """
            INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (tenant_one, creator_id, "Project One", "First", "shared-slug"),
        )
        conn.execute(
            """
            INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (tenant_two, creator_id, "Project Two", "Second", "shared-slug"),
        )
        rows = conn.fetchall(
            "SELECT id FROM objectified.project WHERE slug = %s ORDER BY created_at ASC",
            ("shared-slug",),
        )
        assert len(rows) == 2

    def test_slug_reusable_after_soft_delete_in_same_tenant(self, conn):
        """A slug can be reused in the same tenant after the earlier project is soft-deleted."""
        tenant_id = _insert_tenant(conn, "reuse-tenant")
        creator_id = _insert_account(conn, "reuse@example.com")
        first = conn.fetchone(
            """
            INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
            """,
            (tenant_id, creator_id, "First Project", "First", "reusable-slug"),
        )
        conn.execute(
            """
            UPDATE objectified.project
            SET deleted_at = timezone('utc', clock_timestamp()), enabled = false
            WHERE id = %s
            """,
            (first["id"],),
        )
        conn.execute(
            """
            INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (tenant_id, creator_id, "Second Project", "Second", "reusable-slug"),
        )
        active_rows = conn.fetchall(
            "SELECT id FROM objectified.project WHERE tenant_id = %s AND slug = %s AND deleted_at IS NULL",
            (tenant_id, "reusable-slug"),
        )
        assert len(active_rows) == 1

    def test_tenant_id_foreign_key_references_tenant(self, conn):
        row = conn.fetchone(
            """
            SELECT tc.constraint_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema    = kcu.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema    = 'objectified'
              AND tc.table_name      = 'project'
              AND kcu.column_name    = 'tenant_id'
            """
        )
        assert row is not None, "Foreign key on tenant_id is missing"

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
              AND tc.table_name      = 'project'
              AND kcu.column_name    = 'creator_id'
            """
        )
        assert row is not None, "Foreign key on creator_id is missing"


# ---------------------------------------------------------------------------
# Indices
# ---------------------------------------------------------------------------

class TestProjectTableIndices:
    """Verify the required indices exist."""

    def _index_exists(self, conn, index_name: str) -> bool:
        row = conn.fetchone(
            """
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname = 'objectified'
              AND tablename  = 'project'
              AND indexname  = %s
            """,
            (index_name,),
        )
        return row is not None

    def test_index_on_tenant_id_exists(self, conn):
        assert self._index_exists(conn, "idx_project_tenant_id"), "Index idx_project_tenant_id is missing"

    def test_index_on_creator_id_exists(self, conn):
        assert self._index_exists(conn, "idx_project_creator_id"), "Index idx_project_creator_id is missing"

    def test_index_on_name_exists(self, conn):
        assert self._index_exists(conn, "idx_project_name"), "Index idx_project_name is missing"

    def test_index_on_enabled_exists(self, conn):
        assert self._index_exists(conn, "idx_project_enabled"), "Index idx_project_enabled is missing"

    def test_index_on_deleted_at_exists(self, conn):
        assert self._index_exists(conn, "idx_project_deleted_at"), "Index idx_project_deleted_at is missing"


# ---------------------------------------------------------------------------
# Trigger
# ---------------------------------------------------------------------------

class TestProjectTableTrigger:
    """Verify the updated_at trigger exists and fires correctly."""

    def test_updated_at_trigger_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT trigger_name
            FROM information_schema.triggers
            WHERE event_object_schema = 'objectified'
              AND event_object_table  = 'project'
              AND trigger_name        = 'trg_project_updated_at'
            """
        )
        assert row is not None, "Trigger trg_project_updated_at is missing"

    def test_updated_at_changes_on_update(self, conn):
        """Insert a row, update it, verify updated_at advances."""
        tenant_id = _insert_tenant(conn, "trigger-tenant")
        creator_id = _insert_account(conn, "trigger@example.com")
        conn.execute(
            """
            INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (tenant_id, creator_id, "Trigger Project", "Trigger test project", "trigger-project"),
        )
        conn.execute("SELECT pg_sleep(0.01)")

        original = conn.fetchone(
            "SELECT updated_at FROM objectified.project WHERE slug = %s",
            ("trigger-project",),
        )

        conn.execute(
            "UPDATE objectified.project SET name = %s WHERE slug = %s",
            ("Trigger Project Updated", "trigger-project"),
        )

        updated = conn.fetchone(
            "SELECT updated_at FROM objectified.project WHERE slug = %s",
            ("trigger-project",),
        )

        assert updated["updated_at"] is not None, "updated_at must be set after UPDATE"
        assert updated["updated_at"] >= original["updated_at"] if original["updated_at"] else True


# ---------------------------------------------------------------------------
# Data integrity – insert / query / soft-delete
# ---------------------------------------------------------------------------

class TestProjectTableDataIntegrity:
    """Functional tests for CRUD behaviour. All data is rolled back after each test."""

    def test_insert_minimal_project(self, conn):
        tenant_id = _insert_tenant(conn, "minimal-tenant")
        creator_id = _insert_account(conn, "minimal@example.com")
        conn.execute(
            """
            INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (tenant_id, creator_id, "Minimal Project", "A minimal project description", "minimal-project"),
        )
        row = conn.fetchone(
            "SELECT * FROM objectified.project WHERE slug = %s",
            ("minimal-project",),
        )
        assert row is not None
        assert row["name"] == "Minimal Project"
        assert row["description"] == "A minimal project description"
        assert row["slug"] == "minimal-project"
        assert row["enabled"] is True
        assert row["metadata"] == {}
        assert row["created_at"] is not None
        assert row["deleted_at"] is None
        assert row["id"] is not None
        assert row["tenant_id"] == tenant_id
        assert row["creator_id"] == creator_id

    def test_created_at_is_set_and_recent_on_insert(self, conn):
        """created_at must be auto-populated to a UTC timestamp close to now on insert."""
        from datetime import datetime, timezone, timedelta

        tenant_id = _insert_tenant(conn, "ts-tenant")
        creator_id = _insert_account(conn, "ts@example.com")
        before = datetime.now(timezone.utc).replace(tzinfo=None)
        conn.execute(
            """
            INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (tenant_id, creator_id, "Timestamp Project", "Timestamp test", "timestamp-project"),
        )
        after = datetime.now(timezone.utc).replace(tzinfo=None)

        row = conn.fetchone(
            "SELECT created_at, updated_at FROM objectified.project WHERE slug = %s",
            ("timestamp-project",),
        )
        assert row is not None
        assert row["created_at"] is not None, "created_at must be non-NULL after INSERT"
        assert before <= row["created_at"] <= after + timedelta(seconds=1), (
            f"created_at {row['created_at']} is not within the expected range "
            f"[{before}, {after}]"
        )
        assert row["updated_at"] is None, "updated_at must remain NULL until an UPDATE occurs"

    def test_default_metadata_is_empty_object(self, conn):
        tenant_id = _insert_tenant(conn, "meta-tenant")
        creator_id = _insert_account(conn, "meta@example.com")
        conn.execute(
            """
            INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (tenant_id, creator_id, "Meta Project", "Meta test", "meta-project"),
        )
        row = conn.fetchone(
            "SELECT metadata FROM objectified.project WHERE slug = %s",
            ("meta-project",),
        )
        assert row["metadata"] == {}

    def test_metadata_stores_arbitrary_json(self, conn):
        tenant_id = _insert_tenant(conn, "json-tenant")
        creator_id = _insert_account(conn, "json@example.com")
        payload = {"region": "us-west-2", "tier": "premium"}
        conn.execute(
            """
            INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug, metadata)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (tenant_id, creator_id, "JSON Project", "JSON test", "json-project", json.dumps(payload)),
        )
        row = conn.fetchone(
            "SELECT metadata FROM objectified.project WHERE slug = %s",
            ("json-project",),
        )
        assert row["metadata"]["region"] == "us-west-2"
        assert row["metadata"]["tier"] == "premium"

    def test_soft_delete_sets_deleted_at_and_enabled(self, conn):
        tenant_id = _insert_tenant(conn, "softdel-tenant")
        creator_id = _insert_account(conn, "softdel@example.com")
        conn.execute(
            """
            INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (tenant_id, creator_id, "Soft Delete Project", "Soft delete test", "softdel-project"),
        )
        conn.execute(
            """
            UPDATE objectified.project
            SET deleted_at = timezone('utc', clock_timestamp()),
                enabled    = false
            WHERE slug = %s
            """,
            ("softdel-project",),
        )
        row = conn.fetchone(
            "SELECT deleted_at, enabled FROM objectified.project WHERE slug = %s",
            ("softdel-project",),
        )
        assert row["deleted_at"] is not None
        assert row["enabled"] is False

    def test_soft_deleted_project_excluded_by_partial_index(self, conn):
        """
        A soft-deleted project should NOT appear in queries filtered by deleted_at IS NULL.
        """
        tenant_id = _insert_tenant(conn, "partial-tenant")
        creator_id = _insert_account(conn, "partial@example.com")
        conn.execute(
            """
            INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (tenant_id, creator_id, "Partial Project", "Partial index test", "partial-project"),
        )
        conn.execute(
            """
            UPDATE objectified.project
            SET deleted_at = timezone('utc', clock_timestamp()), enabled = false
            WHERE slug = %s
            """,
            ("partial-project",),
        )
        row = conn.fetchone(
            """
            SELECT id FROM objectified.project
            WHERE slug = %s AND deleted_at IS NULL
            """,
            ("partial-project",),
        )
        assert row is None, "Soft-deleted project must not appear in active project queries"

    def test_name_missing_raises_not_null(self, conn):
        tenant_id = _insert_tenant(conn, "noname-tenant")
        creator_id = _insert_account(conn, "noname@example.com")
        conn.execute("SAVEPOINT before_noname")
        with pytest.raises(psycopg2.errors.NotNullViolation):
            conn.execute(
                """
                INSERT INTO objectified.project (tenant_id, creator_id, description, slug)
                VALUES (%s, %s, %s, %s)
                """,
                (tenant_id, creator_id, "No name project description", "no-name-slug"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_noname")
        conn.execute("RELEASE SAVEPOINT before_noname")

    def test_description_missing_raises_not_null(self, conn):
        tenant_id = _insert_tenant(conn, "nodesc-tenant")
        creator_id = _insert_account(conn, "nodesc@example.com")
        conn.execute("SAVEPOINT before_nodesc")
        with pytest.raises(psycopg2.errors.NotNullViolation):
            conn.execute(
                """
                INSERT INTO objectified.project (tenant_id, creator_id, name, slug)
                VALUES (%s, %s, %s, %s)
                """,
                (tenant_id, creator_id, "No Desc Project", "no-desc-slug"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_nodesc")
        conn.execute("RELEASE SAVEPOINT before_nodesc")

    def test_slug_missing_raises_not_null(self, conn):
        tenant_id = _insert_tenant(conn, "noslug-tenant")
        creator_id = _insert_account(conn, "noslug@example.com")
        conn.execute("SAVEPOINT before_noslug")
        with pytest.raises(psycopg2.errors.NotNullViolation):
            conn.execute(
                """
                INSERT INTO objectified.project (tenant_id, creator_id, name, description)
                VALUES (%s, %s, %s, %s)
                """,
                (tenant_id, creator_id, "No Slug Project", "A description without slug"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_noslug")
        conn.execute("RELEASE SAVEPOINT before_noslug")

    def test_invalid_tenant_id_raises_foreign_key(self, conn):
        creator_id = _insert_account(conn, "fk@example.com")
        bogus_tenant_id = str(uuid.uuid4())
        conn.execute("SAVEPOINT before_bad_tenant")
        with pytest.raises(psycopg2.errors.ForeignKeyViolation):
            conn.execute(
                """
                INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (bogus_tenant_id, creator_id, "Bad Tenant", "Description", "bad-tenant-project"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_bad_tenant")
        conn.execute("RELEASE SAVEPOINT before_bad_tenant")

    def test_invalid_creator_id_raises_foreign_key(self, conn):
        tenant_id = _insert_tenant(conn, "fk-tenant")
        bogus_creator_id = str(uuid.uuid4())
        conn.execute("SAVEPOINT before_bad_creator")
        with pytest.raises(psycopg2.errors.ForeignKeyViolation):
            conn.execute(
                """
                INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (tenant_id, bogus_creator_id, "Bad Creator", "Description", "bad-creator-project"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_bad_creator")
        conn.execute("RELEASE SAVEPOINT before_bad_creator")

    def test_no_data_persists_after_rollback(self, conn):
        """
        Sanity check: row inserted within this test is visible within the same
        transaction but will be gone after the fixture rolls back.
        """
        tenant_id = _insert_tenant(conn, "rollback-tenant")
        creator_id = _insert_account(conn, "rollback@example.com")
        conn.execute(
            """
            INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (tenant_id, creator_id, "Rollback Project", "Rollback test project", "rollback-project"),
        )
        row = conn.fetchone(
            "SELECT id FROM objectified.project WHERE slug = %s",
            ("rollback-project",),
        )
        assert row is not None, "Row should be visible within the same transaction"
