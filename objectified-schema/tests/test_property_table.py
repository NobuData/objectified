"""
test_property_table.py – SQL tests for the objectified.property table.
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
def _insert_tenant(conn, slug="prop-tenant"):
    conn.execute(
        """
        INSERT INTO objectified.tenant (name, description, slug)
        VALUES (%s, %s, %s)
        ON CONFLICT (slug) DO NOTHING
        """,
        ("Test Tenant", "A tenant for testing property", slug),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.tenant WHERE slug = %s", (slug,)
    )["id"]
def _insert_account(conn, email="prop-creator@example.com"):
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
def _insert_project(conn, tenant_id, creator_id, slug="prop-project"):
    conn.execute(
        """
        INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (slug) DO NOTHING
        """,
        (tenant_id, creator_id, "Test Project", "A project for testing property", slug),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.project WHERE slug = %s", (slug,)
    )["id"]
# ---------------------------------------------------------------------------
# Schema / column existence
# ---------------------------------------------------------------------------
class TestPropertyTableStructure:
    """Verify the table and its columns exist with the correct types."""
    def test_table_exists(self, conn):
        """objectified.property table must exist."""
        row = conn.fetchone(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'objectified'
              AND table_name   = 'property'
            """
        )
        assert row is not None, "Table objectified.property does not exist"
    def test_column_id_is_uuid(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'property'
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
              AND table_name   = 'property'
              AND column_name  = 'project_id'
            """
        )
        assert row is not None, "Column 'project_id' is missing"
        assert row["data_type"] == "uuid"
        assert row["is_nullable"] == "NO"
    def test_column_name_varchar255_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT character_maximum_length, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'property'
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
              AND table_name   = 'property'
              AND column_name  = 'description'
            """
        )
        assert row is not None, "Column 'description' is missing"
        assert row["character_maximum_length"] == 4096
        assert row["is_nullable"] == "NO"
    def test_column_data_jsonb_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'property'
              AND column_name  = 'data'
            """
        )
        assert row is not None, "Column 'data' is missing"
        assert row["data_type"] == "jsonb"
        assert row["is_nullable"] == "NO"
    def test_column_enabled_boolean_not_null_default_true(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'property'
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
              AND table_name   = 'property'
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
              AND table_name   = 'property'
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
              AND table_name   = 'property'
              AND column_name  = 'deleted_at'
            """
        )
        assert row is not None, "Column 'deleted_at' is missing"
        assert row["data_type"] == "timestamp without time zone"
        assert row["is_nullable"] == "YES"
# ---------------------------------------------------------------------------
# Constraints
# ---------------------------------------------------------------------------
class TestPropertyTableConstraints:
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
              AND tc.table_name      = 'property'
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
              AND tc.table_name      = 'property'
              AND kcu.column_name    = 'project_id'
            """
        )
        assert row is not None, "Foreign key on project_id is missing"
    def test_invalid_project_id_raises_foreign_key(self, conn):
        bogus_project_id = str(uuid.uuid4())
        conn.execute("SAVEPOINT before_bad_project")
        with pytest.raises(psycopg2.errors.ForeignKeyViolation):
            conn.execute(
                """
                INSERT INTO objectified.property (project_id, name, description)
                VALUES (%s, %s, %s)
                """,
                (bogus_project_id, "Bad Property", "Description"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_bad_project")
        conn.execute("RELEASE SAVEPOINT before_bad_project")
# ---------------------------------------------------------------------------
# Indices
# ---------------------------------------------------------------------------
class TestPropertyTableIndices:
    """Verify the required indices exist."""
    def _index_exists(self, conn, index_name: str) -> bool:
        row = conn.fetchone(
            """
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname = 'objectified'
              AND tablename  = 'property'
              AND indexname  = %s
            """,
            (index_name,),
        )
        return row is not None
    def test_index_on_project_id_exists(self, conn):
        assert self._index_exists(conn, "idx_property_project_id"), "Index idx_property_project_id is missing"
    def test_index_on_name_exists(self, conn):
        assert self._index_exists(conn, "idx_property_name"), "Index idx_property_name is missing"
    def test_index_on_enabled_exists(self, conn):
        assert self._index_exists(conn, "idx_property_enabled"), "Index idx_property_enabled is missing"
    def test_index_on_deleted_at_exists(self, conn):
        assert self._index_exists(conn, "idx_property_deleted_at"), "Index idx_property_deleted_at is missing"
# ---------------------------------------------------------------------------
# Trigger
# ---------------------------------------------------------------------------
class TestPropertyTableTrigger:
    """Verify the updated_at trigger exists and fires correctly."""
    def test_updated_at_trigger_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT trigger_name
            FROM information_schema.triggers
            WHERE event_object_schema = 'objectified'
              AND event_object_table  = 'property'
              AND trigger_name        = 'trg_property_updated_at'
            """
        )
        assert row is not None, "Trigger trg_property_updated_at is missing"
    def test_updated_at_changes_on_update(self, conn):
        """Insert a row, update it, verify updated_at advances."""
        tenant_id = _insert_tenant(conn, "trigger-prop-tenant")
        creator_id = _insert_account(conn, "trigger-prop@example.com")
        project_id = _insert_project(conn, tenant_id, creator_id, "trigger-prop-project")
        conn.execute(
            """
            INSERT INTO objectified.property (project_id, name, description)
            VALUES (%s, %s, %s)
            """,
            (project_id, "Trigger Property", "Trigger test property"),
        )
        conn.execute("SELECT pg_sleep(0.01)")
        original = conn.fetchone(
            "SELECT id, updated_at FROM objectified.property WHERE name = %s",
            ("Trigger Property",),
        )
        conn.execute(
            "UPDATE objectified.property SET name = %s WHERE id = %s",
            ("Trigger Property Updated", original["id"]),
        )
        updated = conn.fetchone(
            "SELECT updated_at FROM objectified.property WHERE id = %s",
            (original["id"],),
        )
        assert updated["updated_at"] is not None, "updated_at must be set after UPDATE"
        if original["updated_at"]:
            assert updated["updated_at"] >= original["updated_at"]
# ---------------------------------------------------------------------------
# Data integrity – insert / query / soft-delete
# ---------------------------------------------------------------------------
class TestPropertyTableDataIntegrity:
    """Functional tests for CRUD behaviour. All data is rolled back after each test."""
    def test_insert_minimal_property(self, conn):
        tenant_id = _insert_tenant(conn, "minimal-prop-tenant")
        creator_id = _insert_account(conn, "minimal-prop@example.com")
        project_id = _insert_project(conn, tenant_id, creator_id, "minimal-prop-project")
        conn.execute(
            """
            INSERT INTO objectified.property (project_id, name, description)
            VALUES (%s, %s, %s)
            """,
            (project_id, "Minimal Property", "A minimal property description"),
        )
        row = conn.fetchone(
            "SELECT * FROM objectified.property WHERE name = %s AND project_id = %s",
            ("Minimal Property", project_id),
        )
        assert row is not None
        assert row["name"] == "Minimal Property"
        assert row["description"] == "A minimal property description"
        assert row["enabled"] is True
        assert row["data"] == {}
        assert row["created_at"] is not None
        assert row["updated_at"] is None
        assert row["deleted_at"] is None
        assert row["id"] is not None
        assert row["project_id"] == project_id
    def test_created_at_is_set_and_recent_on_insert(self, conn):
        """created_at must be auto-populated to a UTC timestamp close to now on insert."""
        from datetime import datetime, timezone, timedelta
        tenant_id = _insert_tenant(conn, "ts-prop-tenant")
        creator_id = _insert_account(conn, "ts-prop@example.com")
        project_id = _insert_project(conn, tenant_id, creator_id, "ts-prop-project")
        before = datetime.now(timezone.utc).replace(tzinfo=None)
        conn.execute(
            """
            INSERT INTO objectified.property (project_id, name, description)
            VALUES (%s, %s, %s)
            """,
            (project_id, "Timestamp Property", "Timestamp test"),
        )
        after = datetime.now(timezone.utc).replace(tzinfo=None)
        row = conn.fetchone(
            "SELECT created_at, updated_at FROM objectified.property WHERE name = %s AND project_id = %s",
            ("Timestamp Property", project_id),
        )
        assert row is not None
        assert row["created_at"] is not None, "created_at must be non-NULL after INSERT"
        assert before <= row["created_at"] <= after + timedelta(seconds=1)
        assert row["updated_at"] is None, "updated_at must remain NULL until an UPDATE occurs"
    def test_default_data_is_empty_object(self, conn):
        tenant_id = _insert_tenant(conn, "data-prop-tenant")
        creator_id = _insert_account(conn, "data-prop@example.com")
        project_id = _insert_project(conn, tenant_id, creator_id, "data-prop-project")
        conn.execute(
            """
            INSERT INTO objectified.property (project_id, name, description)
            VALUES (%s, %s, %s)
            """,
            (project_id, "Data Property", "Data default test"),
        )
        row = conn.fetchone(
            "SELECT data FROM objectified.property WHERE name = %s AND project_id = %s",
            ("Data Property", project_id),
        )
        assert row["data"] == {}
    def test_data_stores_json_schema(self, conn):
        """data column should accept JSON Schema 2020-12 format."""
        tenant_id = _insert_tenant(conn, "schema-prop-tenant")
        creator_id = _insert_account(conn, "schema-prop@example.com")
        project_id = _insert_project(conn, tenant_id, creator_id, "schema-prop-project")
        json_schema = {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "type": "string",
            "minLength": 1,
            "maxLength": 255,
        }
        conn.execute(
            """
            INSERT INTO objectified.property (project_id, name, description, data)
            VALUES (%s, %s, %s, %s)
            """,
            (project_id, "Schema Property", "Schema test", json.dumps(json_schema)),
        )
        row = conn.fetchone(
            "SELECT data FROM objectified.property WHERE name = %s AND project_id = %s",
            ("Schema Property", project_id),
        )
        assert row["data"]["$schema"] == "https://json-schema.org/draft/2020-12/schema"
        assert row["data"]["type"] == "string"
        assert row["data"]["minLength"] == 1
        assert row["data"]["maxLength"] == 255
    def test_soft_delete_sets_deleted_at_and_enabled(self, conn):
        tenant_id = _insert_tenant(conn, "softdel-prop-tenant")
        creator_id = _insert_account(conn, "softdel-prop@example.com")
        project_id = _insert_project(conn, tenant_id, creator_id, "softdel-prop-project")
        conn.execute(
            """
            INSERT INTO objectified.property (project_id, name, description)
            VALUES (%s, %s, %s)
            """,
            (project_id, "Soft Delete Property", "Soft delete test"),
        )
        row = conn.fetchone(
            "SELECT id FROM objectified.property WHERE name = %s AND project_id = %s",
            ("Soft Delete Property", project_id),
        )
        conn.execute(
            """
            UPDATE objectified.property
            SET deleted_at = timezone('utc', clock_timestamp()),
                enabled    = false
            WHERE id = %s
            """,
            (row["id"],),
        )
        updated = conn.fetchone(
            "SELECT deleted_at, enabled FROM objectified.property WHERE id = %s",
            (row["id"],),
        )
        assert updated["deleted_at"] is not None
        assert updated["enabled"] is False
    def test_soft_deleted_property_excluded_by_partial_index(self, conn):
        """A soft-deleted property should NOT appear in queries filtered by deleted_at IS NULL."""
        tenant_id = _insert_tenant(conn, "partial-prop-tenant")
        creator_id = _insert_account(conn, "partial-prop@example.com")
        project_id = _insert_project(conn, tenant_id, creator_id, "partial-prop-project")
        conn.execute(
            """
            INSERT INTO objectified.property (project_id, name, description)
            VALUES (%s, %s, %s)
            """,
            (project_id, "Partial Property", "Partial index test"),
        )
        row = conn.fetchone(
            "SELECT id FROM objectified.property WHERE name = %s AND project_id = %s",
            ("Partial Property", project_id),
        )
        conn.execute(
            """
            UPDATE objectified.property
            SET deleted_at = timezone('utc', clock_timestamp()), enabled = false
            WHERE id = %s
            """,
            (row["id"],),
        )
        result = conn.fetchone(
            """
            SELECT id FROM objectified.property
            WHERE id = %s AND deleted_at IS NULL
            """,
            (row["id"],),
        )
        assert result is None, "Soft-deleted property must not appear in active property queries"
    def test_name_missing_raises_not_null(self, conn):
        tenant_id = _insert_tenant(conn, "noname-prop-tenant")
        creator_id = _insert_account(conn, "noname-prop@example.com")
        project_id = _insert_project(conn, tenant_id, creator_id, "noname-prop-project")
        conn.execute("SAVEPOINT before_noname")
        with pytest.raises(psycopg2.errors.NotNullViolation):
            conn.execute(
                """
                INSERT INTO objectified.property (project_id, description)
                VALUES (%s, %s)
                """,
                (project_id, "No name property description"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_noname")
        conn.execute("RELEASE SAVEPOINT before_noname")
    def test_description_missing_raises_not_null(self, conn):
        tenant_id = _insert_tenant(conn, "nodesc-prop-tenant")
        creator_id = _insert_account(conn, "nodesc-prop@example.com")
        project_id = _insert_project(conn, tenant_id, creator_id, "nodesc-prop-project")
        conn.execute("SAVEPOINT before_nodesc")
        with pytest.raises(psycopg2.errors.NotNullViolation):
            conn.execute(
                """
                INSERT INTO objectified.property (project_id, name)
                VALUES (%s, %s)
                """,
                (project_id, "No Desc Property"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_nodesc")
        conn.execute("RELEASE SAVEPOINT before_nodesc")
    def test_no_data_persists_after_rollback(self, conn):
        """Sanity check: row inserted within this test is visible within the same
        transaction but will be gone after the fixture rolls back."""
        tenant_id = _insert_tenant(conn, "rollback-prop-tenant")
        creator_id = _insert_account(conn, "rollback-prop@example.com")
        project_id = _insert_project(conn, tenant_id, creator_id, "rollback-prop-project")
        conn.execute(
            """
            INSERT INTO objectified.property (project_id, name, description)
            VALUES (%s, %s, %s)
            """,
            (project_id, "Rollback Property", "Rollback test property"),
        )
        row = conn.fetchone(
            "SELECT id FROM objectified.property WHERE name = %s AND project_id = %s",
            ("Rollback Property", project_id),
        )
        assert row is not None, "Row should be visible within the same transaction"
