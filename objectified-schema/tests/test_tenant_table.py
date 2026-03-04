"""
test_tenant_table.py – SQL tests for the objectified.tenant table.

Every test runs inside a transaction that is rolled back after completion
(via the 'conn' fixture in conftest.py), so no data persists to the database.
"""

import pytest
import psycopg2


# ---------------------------------------------------------------------------
# Schema / column existence
# ---------------------------------------------------------------------------

class TestTenantTableStructure:
    """Verify the table and its columns exist with the correct types."""

    def test_table_exists(self, conn):
        """objectified.tenant table must exist."""
        row = conn.fetchone(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'objectified'
              AND table_name   = 'tenant'
            """
        )
        assert row is not None, "Table objectified.tenant does not exist"

    def test_column_id_is_uuid(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'tenant'
              AND column_name  = 'id'
            """
        )
        assert row is not None, "Column 'id' is missing"
        assert row["data_type"] == "uuid"

    def test_column_name_varchar80_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT character_maximum_length, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'tenant'
              AND column_name  = 'name'
            """
        )
        assert row is not None, "Column 'name' is missing"
        assert row["character_maximum_length"] == 80
        assert row["is_nullable"] == "NO"

    def test_column_description_varchar4096_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT character_maximum_length, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'tenant'
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
              AND table_name   = 'tenant'
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
              AND table_name   = 'tenant'
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
              AND table_name   = 'tenant'
              AND column_name  = 'metadata'
            """
        )
        assert row is not None, "Column 'metadata' is missing"
        assert row["data_type"] == "jsonb"
        assert row["is_nullable"] == "NO"

    def test_column_created_at_timestamp_no_tz(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'tenant'
              AND column_name  = 'created_at'
            """
        )
        assert row is not None, "Column 'created_at' is missing"
        assert row["data_type"] == "timestamp without time zone"

    def test_column_updated_at_timestamp_no_tz_nullable(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'tenant'
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
              AND table_name   = 'tenant'
              AND column_name  = 'deleted_at'
            """
        )
        assert row is not None, "Column 'deleted_at' is missing"
        assert row["data_type"] == "timestamp without time zone"
        assert row["is_nullable"] == "YES"


# ---------------------------------------------------------------------------
# Constraints
# ---------------------------------------------------------------------------

class TestTenantTableConstraints:
    """Verify primary key, unique, check, and not-null constraints."""

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
              AND tc.table_name      = 'tenant'
            """
        )
        assert row is not None
        assert row["column_name"] == "id"

    def test_unique_constraint_on_slug(self, conn):
        row = conn.fetchone(
            """
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema    = kcu.table_schema
            WHERE tc.constraint_type = 'UNIQUE'
              AND tc.table_schema    = 'objectified'
              AND tc.table_name      = 'tenant'
              AND kcu.column_name    = 'slug'
            """
        )
        assert row is not None, "UNIQUE constraint on 'slug' is missing"

    def test_check_constraint_slug_format_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT constraint_name
            FROM information_schema.table_constraints
            WHERE constraint_type = 'CHECK'
              AND table_schema    = 'objectified'
              AND table_name      = 'tenant'
              AND constraint_name = 'tenant_slug_format'
            """
        )
        assert row is not None, "CHECK constraint 'tenant_slug_format' is missing"

    def test_slug_valid_format_accepted(self, conn):
        """A valid lowercase-alphanumeric-hyphen slug should insert without error."""
        conn.execute(
            """
            INSERT INTO objectified.tenant (name, description, slug)
            VALUES (%s, %s, %s)
            """,
            ("Acme Corp", "A description of Acme Corp", "acme-corp"),
        )
        row = conn.fetchone(
            "SELECT slug FROM objectified.tenant WHERE slug = %s",
            ("acme-corp",),
        )
        assert row is not None
        assert row["slug"] == "acme-corp"

    def test_slug_invalid_uppercase_rejected(self, conn):
        """Uppercase characters in slug must be rejected by the check constraint."""
        conn.execute("SAVEPOINT before_bad_slug")
        with pytest.raises(psycopg2.errors.CheckViolation):
            conn.execute(
                """
                INSERT INTO objectified.tenant (name, description, slug)
                VALUES (%s, %s, %s)
                """,
                ("Bad Corp", "A description", "Bad-Corp"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_bad_slug")
        conn.execute("RELEASE SAVEPOINT before_bad_slug")

    def test_slug_invalid_leading_hyphen_rejected(self, conn):
        """Slug starting with a hyphen must be rejected."""
        conn.execute("SAVEPOINT before_leading_hyphen")
        with pytest.raises(psycopg2.errors.CheckViolation):
            conn.execute(
                """
                INSERT INTO objectified.tenant (name, description, slug)
                VALUES (%s, %s, %s)
                """,
                ("Bad Corp", "A description", "-bad"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_leading_hyphen")
        conn.execute("RELEASE SAVEPOINT before_leading_hyphen")

    def test_slug_invalid_trailing_hyphen_rejected(self, conn):
        """Slug ending with a hyphen must be rejected."""
        conn.execute("SAVEPOINT before_trailing_hyphen")
        with pytest.raises(psycopg2.errors.CheckViolation):
            conn.execute(
                """
                INSERT INTO objectified.tenant (name, description, slug)
                VALUES (%s, %s, %s)
                """,
                ("Bad Corp", "A description", "bad-"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_trailing_hyphen")
        conn.execute("RELEASE SAVEPOINT before_trailing_hyphen")

    def test_slug_invalid_consecutive_hyphens_rejected(self, conn):
        """Slug with consecutive hyphens must be rejected."""
        conn.execute("SAVEPOINT before_double_hyphen")
        with pytest.raises(psycopg2.errors.CheckViolation):
            conn.execute(
                """
                INSERT INTO objectified.tenant (name, description, slug)
                VALUES (%s, %s, %s)
                """,
                ("Bad Corp", "A description", "bad--corp"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_double_hyphen")
        conn.execute("RELEASE SAVEPOINT before_double_hyphen")

    def test_slug_unique_constraint_raises(self, conn):
        """Duplicate slug must be rejected by the unique constraint."""
        conn.execute(
            """
            INSERT INTO objectified.tenant (name, description, slug)
            VALUES (%s, %s, %s)
            """,
            ("Tenant One", "First tenant", "my-tenant"),
        )
        conn.execute("SAVEPOINT before_duplicate_slug")
        with pytest.raises(psycopg2.errors.UniqueViolation):
            conn.execute(
                """
                INSERT INTO objectified.tenant (name, description, slug)
                VALUES (%s, %s, %s)
                """,
                ("Tenant Two", "Second tenant with same slug", "my-tenant"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_duplicate_slug")
        conn.execute("RELEASE SAVEPOINT before_duplicate_slug")


# ---------------------------------------------------------------------------
# Indices
# ---------------------------------------------------------------------------

class TestTenantTableIndices:
    """Verify the required indices exist."""

    def _index_exists(self, conn, index_name: str) -> bool:
        row = conn.fetchone(
            """
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname = 'objectified'
              AND tablename  = 'tenant'
              AND indexname  = %s
            """,
            (index_name,),
        )
        return row is not None

    def test_index_on_name_exists(self, conn):
        assert self._index_exists(conn, "idx_tenant_name"), "Index idx_tenant_name is missing"

    def test_index_on_enabled_exists(self, conn):
        assert self._index_exists(conn, "idx_tenant_enabled"), "Index idx_tenant_enabled is missing"

    def test_index_on_deleted_at_exists(self, conn):
        assert self._index_exists(conn, "idx_tenant_deleted_at"), "Index idx_tenant_deleted_at is missing"


# ---------------------------------------------------------------------------
# Trigger
# ---------------------------------------------------------------------------

class TestTenantTableTrigger:
    """Verify the updated_at trigger exists and fires correctly."""

    def test_updated_at_trigger_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT trigger_name
            FROM information_schema.triggers
            WHERE event_object_schema = 'objectified'
              AND event_object_table  = 'tenant'
              AND trigger_name        = 'trg_tenant_updated_at'
            """
        )
        assert row is not None, "Trigger trg_tenant_updated_at is missing"

    def test_updated_at_changes_on_update(self, conn):
        """Insert a row, update it, verify updated_at advances."""
        conn.execute(
            """
            INSERT INTO objectified.tenant (name, description, slug)
            VALUES (%s, %s, %s)
            """,
            ("Trigger Tenant", "A trigger test tenant", "trigger-tenant"),
        )
        conn.execute("SELECT pg_sleep(0.01)")

        original = conn.fetchone(
            "SELECT updated_at FROM objectified.tenant WHERE slug = %s",
            ("trigger-tenant",),
        )

        conn.execute(
            "UPDATE objectified.tenant SET name = %s WHERE slug = %s",
            ("Trigger Tenant Updated", "trigger-tenant"),
        )

        updated = conn.fetchone(
            "SELECT updated_at FROM objectified.tenant WHERE slug = %s",
            ("trigger-tenant",),
        )

        assert updated["updated_at"] is not None, "updated_at must be set after UPDATE"
        assert updated["updated_at"] >= original["updated_at"] if original["updated_at"] else True


# ---------------------------------------------------------------------------
# Data integrity – insert / query / soft-delete
# ---------------------------------------------------------------------------

class TestTenantTableDataIntegrity:
    """Functional tests for CRUD behaviour. All data is rolled back after each test."""

    def test_insert_minimal_tenant(self, conn):
        conn.execute(
            """
            INSERT INTO objectified.tenant (name, description, slug)
            VALUES (%s, %s, %s)
            """,
            ("Acme Corp", "Long formal name for Acme Corp", "acme-corp"),
        )
        row = conn.fetchone(
            "SELECT * FROM objectified.tenant WHERE slug = %s",
            ("acme-corp",),
        )
        assert row is not None
        assert row["name"] == "Acme Corp"
        assert row["description"] == "Long formal name for Acme Corp"
        assert row["slug"] == "acme-corp"
        assert row["enabled"] is True
        assert row["metadata"] == {}
        assert row["deleted_at"] is None
        assert row["id"] is not None

    def test_default_metadata_is_empty_object(self, conn):
        conn.execute(
            """
            INSERT INTO objectified.tenant (name, description, slug)
            VALUES (%s, %s, %s)
            """,
            ("Beta Corp", "Beta Corp formal name", "beta-corp"),
        )
        row = conn.fetchone(
            "SELECT metadata FROM objectified.tenant WHERE slug = %s",
            ("beta-corp",),
        )
        assert row["metadata"] == {}

    def test_metadata_stores_arbitrary_json(self, conn):
        import json
        payload = {"region": "us-west-2", "tier": "premium"}
        conn.execute(
            """
            INSERT INTO objectified.tenant (name, description, slug, metadata)
            VALUES (%s, %s, %s, %s)
            """,
            ("Gamma Corp", "Gamma Corp formal name", "gamma-corp", json.dumps(payload)),
        )
        row = conn.fetchone(
            "SELECT metadata FROM objectified.tenant WHERE slug = %s",
            ("gamma-corp",),
        )
        assert row["metadata"]["region"] == "us-west-2"
        assert row["metadata"]["tier"] == "premium"

    def test_soft_delete_sets_deleted_at_and_enabled(self, conn):
        conn.execute(
            """
            INSERT INTO objectified.tenant (name, description, slug)
            VALUES (%s, %s, %s)
            """,
            ("Delta Corp", "Delta Corp formal name", "delta-corp"),
        )
        conn.execute(
            """
            UPDATE objectified.tenant
            SET deleted_at = CURRENT_TIMESTAMP,
                enabled    = false
            WHERE slug = %s
            """,
            ("delta-corp",),
        )
        row = conn.fetchone(
            "SELECT deleted_at, enabled FROM objectified.tenant WHERE slug = %s",
            ("delta-corp",),
        )
        assert row["deleted_at"] is not None
        assert row["enabled"] is False

    def test_soft_deleted_tenant_excluded_by_partial_index(self, conn):
        """
        A soft-deleted tenant should NOT appear in queries filtered by deleted_at IS NULL.
        """
        conn.execute(
            """
            INSERT INTO objectified.tenant (name, description, slug)
            VALUES (%s, %s, %s)
            """,
            ("Epsilon Corp", "Epsilon Corp formal name", "epsilon-corp"),
        )
        conn.execute(
            """
            UPDATE objectified.tenant
            SET deleted_at = CURRENT_TIMESTAMP, enabled = false
            WHERE slug = %s
            """,
            ("epsilon-corp",),
        )
        row = conn.fetchone(
            """
            SELECT id FROM objectified.tenant
            WHERE slug = %s AND deleted_at IS NULL
            """,
            ("epsilon-corp",),
        )
        assert row is None, "Soft-deleted tenant must not appear in active tenant queries"

    def test_name_missing_raises_not_null(self, conn):
        conn.execute("SAVEPOINT before_noname")
        with pytest.raises(psycopg2.errors.NotNullViolation):
            conn.execute(
                """
                INSERT INTO objectified.tenant (description, slug)
                VALUES (%s, %s)
                """,
                ("No name tenant description", "no-name-slug"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_noname")
        conn.execute("RELEASE SAVEPOINT before_noname")

    def test_description_missing_raises_not_null(self, conn):
        conn.execute("SAVEPOINT before_nodesc")
        with pytest.raises(psycopg2.errors.NotNullViolation):
            conn.execute(
                """
                INSERT INTO objectified.tenant (name, slug)
                VALUES (%s, %s)
                """,
                ("No Desc Corp", "no-desc-slug"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_nodesc")
        conn.execute("RELEASE SAVEPOINT before_nodesc")

    def test_slug_missing_raises_not_null(self, conn):
        conn.execute("SAVEPOINT before_noslug")
        with pytest.raises(psycopg2.errors.NotNullViolation):
            conn.execute(
                """
                INSERT INTO objectified.tenant (name, description)
                VALUES (%s, %s)
                """,
                ("No Slug Corp", "A description without slug"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_noslug")
        conn.execute("RELEASE SAVEPOINT before_noslug")

    def test_no_data_persists_after_rollback(self, conn):
        """
        Sanity check: row inserted within this test is visible within the same
        transaction but will be gone after the fixture rolls back.
        """
        conn.execute(
            """
            INSERT INTO objectified.tenant (name, description, slug)
            VALUES (%s, %s, %s)
            """,
            ("Rollback Corp", "Rollback test tenant", "rollback-corp"),
        )
        row = conn.fetchone(
            "SELECT id FROM objectified.tenant WHERE slug = %s",
            ("rollback-corp",),
        )
        assert row is not None, "Row should be visible within the same transaction"
        # After this test completes the fixture issues rollback, removing the row.

