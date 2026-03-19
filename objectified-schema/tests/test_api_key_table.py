"""
test_api_key_table.py – SQL tests for the objectified.api_key table.

Every test runs inside a transaction that is rolled back after completion
(via the 'conn' fixture in conftest.py), so no data persists to the database.
"""

import json
import uuid

import psycopg2
import pytest


# ---------------------------------------------------------------------------
# Helpers to create prerequisite tenant and account rows
# ---------------------------------------------------------------------------


def _insert_tenant(conn, slug="api-key-tenant"):
    conn.execute(
        """
        INSERT INTO objectified.tenant (name, description, slug)
        VALUES (%s, %s, %s)
        ON CONFLICT (slug) DO NOTHING
        """,
        ("API Key Tenant", "A tenant for testing API keys", slug),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.tenant WHERE slug = %s", (slug,)
    )["id"]



def _insert_account(conn, email="api-key-owner@example.com"):
    conn.execute(
        """
        INSERT INTO objectified.account (name, email, password)
        VALUES (%s, %s, %s)
        ON CONFLICT ( (LOWER(email)) ) DO NOTHING
        """,
        ("API Key Owner", email, "hashed_password"),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.account WHERE email = %s", (email,)
    )["id"]


# ---------------------------------------------------------------------------
# Structure
# ---------------------------------------------------------------------------


class TestApiKeyTableStructure:
    """Verify the table and its columns exist with the correct types."""

    def test_table_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'objectified'
              AND table_name   = 'api_key'
            """
        )
        assert row is not None, "Table objectified.api_key does not exist"

    @pytest.mark.parametrize(
        ("column_name", "data_type", "nullable"),
        [
            ("id", "uuid", "NO"),
            ("tenant_id", "uuid", "NO"),
            ("account_id", "uuid", "NO"),
            ("name", "character varying", "NO"),
            ("key_hash", "character varying", "NO"),
            ("key_prefix", "character varying", "NO"),
            ("expires_at", "timestamp without time zone", "YES"),
            ("last_used", "timestamp without time zone", "YES"),
            ("enabled", "boolean", "NO"),
            ("metadata", "jsonb", "NO"),
            ("scope_role", "character varying", "NO"),
            ("project_id", "uuid", "YES"),
            ("created_at", "timestamp without time zone", "NO"),
            ("updated_at", "timestamp without time zone", "YES"),
            ("deleted_at", "timestamp without time zone", "YES"),
        ],
    )
    def test_column_exists_with_expected_shape(self, conn, column_name, data_type, nullable):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'api_key'
              AND column_name  = %s
            """,
            (column_name,),
        )
        assert row is not None, f"Column '{column_name}' is missing"
        assert row["data_type"] == data_type
        assert row["is_nullable"] == nullable


# ---------------------------------------------------------------------------
# Constraints and indices
# ---------------------------------------------------------------------------


class TestApiKeyTableConstraints:
    """Verify primary key, unique, foreign key, and trigger behavior."""

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
              AND tc.table_name      = 'api_key'
            """
        )
        assert row is not None
        assert row["column_name"] == "id"

    def test_unique_constraint_on_key_hash(self, conn):
        row = conn.fetchone(
            """
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema    = kcu.table_schema
            WHERE tc.constraint_type = 'UNIQUE'
              AND tc.table_schema    = 'objectified'
              AND tc.table_name      = 'api_key'
              AND kcu.column_name    = 'key_hash'
            """
        )
        assert row is not None, "UNIQUE constraint on key_hash is missing"

    def test_foreign_keys_exist(self, conn):
        rows = conn.fetchall(
            """
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema    = kcu.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema    = 'objectified'
              AND tc.table_name      = 'api_key'
            ORDER BY kcu.column_name ASC
            """
        )
        assert [r["column_name"] for r in rows] == ["account_id", "project_id", "tenant_id"]

    def test_updated_at_trigger_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT trigger_name
            FROM information_schema.triggers
            WHERE event_object_schema = 'objectified'
              AND event_object_table  = 'api_key'
              AND trigger_name        = 'trg_api_key_updated_at'
            """
        )
        assert row is not None, "Trigger trg_api_key_updated_at is missing"

    @pytest.mark.parametrize(
        "index_name",
        [
            "idx_api_key_tenant_id",
            "idx_api_key_account_id",
            "idx_api_key_key_prefix",
            "idx_api_key_enabled",
            "idx_api_key_expires_at",
            "idx_api_key_deleted_at",
            "idx_api_key_project_id",
        ],
    )
    def test_expected_indexes_exist(self, conn, index_name):
        row = conn.fetchone(
            """
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname = 'objectified'
              AND tablename  = 'api_key'
              AND indexname  = %s
            """,
            (index_name,),
        )
        assert row is not None, f"Index {index_name} is missing"


# ---------------------------------------------------------------------------
# Data integrity
# ---------------------------------------------------------------------------


class TestApiKeyTableDataIntegrity:
    """Verify inserts, uniqueness, and soft-delete behavior."""

    def test_insert_minimal_api_key(self, conn):
        tenant_id = _insert_tenant(conn, "api-key-minimal-tenant")
        account_id = _insert_account(conn, "api-key-minimal@example.com")
        conn.execute(
            """
            INSERT INTO objectified.api_key (tenant_id, account_id, name, key_hash, key_prefix)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (tenant_id, account_id, "CLI Key", "hash-001", "ok_12345"),
        )
        row = conn.fetchone(
            "SELECT * FROM objectified.api_key WHERE key_hash = %s",
            ("hash-001",),
        )
        assert row is not None
        assert row["tenant_id"] == tenant_id
        assert row["account_id"] == account_id
        assert row["enabled"] is True
        assert row["metadata"] == {}
        assert row["deleted_at"] is None
        assert str(row["scope_role"]).lower() == "full"
        assert row["project_id"] is None

    def test_duplicate_key_hash_raises_unique_violation(self, conn):
        tenant_id = _insert_tenant(conn, "api-key-dup-tenant")
        account_id = _insert_account(conn, "api-key-dup@example.com")
        conn.execute(
            """
            INSERT INTO objectified.api_key (tenant_id, account_id, name, key_hash, key_prefix)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (tenant_id, account_id, "First", "dup-hash", "ok_dup1"),
        )
        conn.execute("SAVEPOINT before_duplicate_hash")
        with pytest.raises(psycopg2.errors.UniqueViolation):
            conn.execute(
                """
                INSERT INTO objectified.api_key (tenant_id, account_id, name, key_hash, key_prefix)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (tenant_id, account_id, "Second", "dup-hash", "ok_dup2"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_duplicate_hash")
        conn.execute("RELEASE SAVEPOINT before_duplicate_hash")

    def test_metadata_stores_arbitrary_json(self, conn):
        tenant_id = _insert_tenant(conn, "api-key-meta-tenant")
        account_id = _insert_account(conn, "api-key-meta@example.com")
        payload = {"scope": "build", "rotation_days": 30}
        conn.execute(
            """
            INSERT INTO objectified.api_key
                (tenant_id, account_id, name, key_hash, key_prefix, metadata)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (tenant_id, account_id, "Meta Key", "hash-meta", "ok_meta", json.dumps(payload)),
        )
        row = conn.fetchone(
            "SELECT metadata FROM objectified.api_key WHERE key_hash = %s",
            ("hash-meta",),
        )
        assert row["metadata"] == payload

    def test_soft_delete_sets_deleted_at_and_enabled(self, conn):
        tenant_id = _insert_tenant(conn, "api-key-softdel-tenant")
        account_id = _insert_account(conn, "api-key-softdel@example.com")
        conn.execute(
            """
            INSERT INTO objectified.api_key (tenant_id, account_id, name, key_hash, key_prefix)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (tenant_id, account_id, "Soft Delete Key", "hash-softdel", "ok_soft"),
        )
        conn.execute(
            """
            UPDATE objectified.api_key
            SET deleted_at = timezone('utc', clock_timestamp()), enabled = false
            WHERE key_hash = %s
            """,
            ("hash-softdel",),
        )
        row = conn.fetchone(
            "SELECT deleted_at, enabled FROM objectified.api_key WHERE key_hash = %s",
            ("hash-softdel",),
        )
        assert row["deleted_at"] is not None
        assert row["enabled"] is False

    def test_invalid_foreign_keys_raise(self, conn):
        bogus_tenant_id = str(uuid.uuid4())
        bogus_account_id = str(uuid.uuid4())
        conn.execute("SAVEPOINT before_bad_fks")
        with pytest.raises(psycopg2.errors.ForeignKeyViolation):
            conn.execute(
                """
                INSERT INTO objectified.api_key (tenant_id, account_id, name, key_hash, key_prefix)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (bogus_tenant_id, bogus_account_id, "Bad", "hash-bad", "ok_bad"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_bad_fks")
        conn.execute("RELEASE SAVEPOINT before_bad_fks")

    def test_invalid_scope_role_raises_check_violation(self, conn):
        tenant_id = _insert_tenant(conn, "api-key-bad-scope-tenant")
        account_id = _insert_account(conn, "api-key-bad-scope@example.com")
        conn.execute("SAVEPOINT before_bad_scope")
        with pytest.raises(psycopg2.errors.CheckViolation):
            conn.execute(
                """
                INSERT INTO objectified.api_key
                    (tenant_id, account_id, name, key_hash, key_prefix, scope_role)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (tenant_id, account_id, "Bad scope", "hash-badscope", "ok_badsc", "superuser"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_bad_scope")
        conn.execute("RELEASE SAVEPOINT before_bad_scope")

    def test_invalid_project_id_raises_foreign_key_violation(self, conn):
        tenant_id = _insert_tenant(conn, "api-key-bad-project-tenant")
        account_id = _insert_account(conn, "api-key-bad-project@example.com")
        bogus_project_id = str(uuid.uuid4())
        conn.execute("SAVEPOINT before_bad_project_fk")
        with pytest.raises(psycopg2.errors.ForeignKeyViolation):
            conn.execute(
                """
                INSERT INTO objectified.api_key
                    (tenant_id, account_id, project_id, name, key_hash, key_prefix)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    tenant_id,
                    account_id,
                    bogus_project_id,
                    "Bad project",
                    "hash-badproj",
                    "ok_badproj",
                ),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_bad_project_fk")
        conn.execute("RELEASE SAVEPOINT before_bad_project_fk")

    def test_project_id_can_be_null(self, conn):
        tenant_id = _insert_tenant(conn, "api-key-null-project-tenant")
        account_id = _insert_account(conn, "api-key-null-project@example.com")
        conn.execute(
            """
            INSERT INTO objectified.api_key
                (tenant_id, account_id, project_id, name, key_hash, key_prefix)
            VALUES (%s, %s, NULL, %s, %s, %s)
            """,
            (
                tenant_id,
                account_id,
                "Null project",
                "hash-nullproj",
                "ok_nullproj",
            ),
        )
        row = conn.fetchone(
            "SELECT project_id FROM objectified.api_key WHERE key_hash = %s",
            ("hash-nullproj",),
        )
        assert row["project_id"] is None

