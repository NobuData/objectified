"""
test_tenant_user_table.py – SQL tests for the objectified.tenant_user table.

Every test runs inside a transaction that is rolled back after completion
(via the 'conn' fixture in conftest.py), so no data persists to the database.
"""

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
        ("Test Tenant", "A tenant for testing tenant_user", slug),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.tenant WHERE slug = %s", (slug,)
    )["id"]


def _insert_account(conn, email="testuser@example.com"):
    conn.execute(
        """
        INSERT INTO objectified.account (name, email, password)
        VALUES (%s, %s, %s)
        ON CONFLICT (email) DO NOTHING
        """,
        ("Test User", email, "hashed_password"),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.account WHERE email = %s", (email,)
    )["id"]


# ---------------------------------------------------------------------------
# Schema / column existence
# ---------------------------------------------------------------------------

class TestTenantUserTableStructure:
    """Verify the table and its columns exist with the correct types."""

    def test_table_exists(self, conn):
        """objectified.tenant_user table must exist."""
        row = conn.fetchone(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'objectified'
              AND table_name   = 'tenant_user'
            """
        )
        assert row is not None, "Table objectified.tenant_user does not exist"

    def test_column_id_is_uuid_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'tenant_user'
              AND column_name  = 'id'
            """
        )
        assert row is not None, "Column 'id' is missing"
        assert row["data_type"] == "uuid"
        assert row["is_nullable"] == "NO"

    def test_column_tenant_id_is_uuid_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'tenant_user'
              AND column_name  = 'tenant_id'
            """
        )
        assert row is not None, "Column 'tenant_id' is missing"
        assert row["data_type"] == "uuid"
        assert row["is_nullable"] == "NO"

    def test_column_account_id_is_uuid_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'tenant_user'
              AND column_name  = 'account_id'
            """
        )
        assert row is not None, "Column 'account_id' is missing"
        assert row["data_type"] == "uuid"
        assert row["is_nullable"] == "NO"

    def test_column_access_level_is_enum_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT udt_name, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'tenant_user'
              AND column_name  = 'access_level'
            """
        )
        assert row is not None, "Column 'access_level' is missing"
        assert row["udt_name"] == "tenant_access_level"
        assert row["is_nullable"] == "NO"
        assert "member" in row["column_default"].lower()

    def test_column_created_at_timestamp_no_tz(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'tenant_user'
              AND column_name  = 'created_at'
            """
        )
        assert row is not None, "Column 'created_at' is missing"
        assert row["data_type"] == "timestamp without time zone"

    def test_column_updated_at_timestamp_no_tz(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'tenant_user'
              AND column_name  = 'updated_at'
            """
        )
        assert row is not None, "Column 'updated_at' is missing"
        assert row["data_type"] == "timestamp without time zone"

    def test_enum_type_values(self, conn):
        """Verify ENUM type has exactly 'member' and 'administrator' values."""
        rows = conn.fetchall(
            """
            SELECT enumlabel
            FROM pg_enum
            JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
            WHERE pg_type.typname = 'tenant_access_level'
            ORDER BY enumsortorder
            """
        )
        labels = [r["enumlabel"] for r in rows]
        assert "member" in labels, "'member' ENUM value is missing"
        assert "administrator" in labels, "'administrator' ENUM value is missing"
        assert len(labels) == 2, f"Expected 2 ENUM values, got {len(labels)}: {labels}"


# ---------------------------------------------------------------------------
# Constraints
# ---------------------------------------------------------------------------

class TestTenantUserTableConstraints:
    """Verify primary key, foreign key constraints."""

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
              AND tc.table_name      = 'tenant_user'
            """
        )
        assert row is not None
        assert row["column_name"] == "id"

    def test_foreign_key_tenant_id_references_tenant(self, conn):
        row = conn.fetchone(
            """
            SELECT kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema    = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
              ON ccu.constraint_name = tc.constraint_name
             AND ccu.table_schema    = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema    = 'objectified'
              AND tc.table_name      = 'tenant_user'
              AND kcu.column_name    = 'tenant_id'
            """
        )
        assert row is not None, "Foreign key on 'tenant_id' is missing"
        assert row["foreign_table_name"] == "tenant"
        assert row["foreign_column_name"] == "id"

    def test_foreign_key_account_id_references_account(self, conn):
        row = conn.fetchone(
            """
            SELECT kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema    = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
              ON ccu.constraint_name = tc.constraint_name
             AND ccu.table_schema    = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema    = 'objectified'
              AND tc.table_name      = 'tenant_user'
              AND kcu.column_name    = 'account_id'
            """
        )
        assert row is not None, "Foreign key on 'account_id' is missing"
        assert row["foreign_table_name"] == "account"
        assert row["foreign_column_name"] == "id"

    def test_invalid_tenant_id_raises_foreign_key_violation(self, conn):
        """Inserting a tenant_user with a non-existent tenant_id must fail."""
        account_id = _insert_account(conn, email="fk-test-account@example.com")
        conn.execute("SAVEPOINT before_bad_fk")
        with pytest.raises(psycopg2.errors.ForeignKeyViolation):
            conn.execute(
                """
                INSERT INTO objectified.tenant_user (tenant_id, account_id)
                VALUES (uuidv7(), %s)
                """,
                (account_id,),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_bad_fk")
        conn.execute("RELEASE SAVEPOINT before_bad_fk")

    def test_invalid_account_id_raises_foreign_key_violation(self, conn):
        """Inserting a tenant_user with a non-existent account_id must fail."""
        tenant_id = _insert_tenant(conn, slug="fk-test-tenant")
        conn.execute("SAVEPOINT before_bad_account_fk")
        with pytest.raises(psycopg2.errors.ForeignKeyViolation):
            conn.execute(
                """
                INSERT INTO objectified.tenant_user (tenant_id, account_id)
                VALUES (%s, uuidv7())
                """,
                (tenant_id,),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_bad_account_fk")
        conn.execute("RELEASE SAVEPOINT before_bad_account_fk")

    def test_missing_tenant_id_raises_not_null(self, conn):
        account_id = _insert_account(conn, email="null-tenant-test@example.com")
        conn.execute("SAVEPOINT before_null_tenant")
        with pytest.raises(psycopg2.errors.NotNullViolation):
            conn.execute(
                "INSERT INTO objectified.tenant_user (account_id) VALUES (%s)",
                (account_id,),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_null_tenant")
        conn.execute("RELEASE SAVEPOINT before_null_tenant")

    def test_missing_account_id_raises_not_null(self, conn):
        tenant_id = _insert_tenant(conn, slug="null-account-tenant")
        conn.execute("SAVEPOINT before_null_account")
        with pytest.raises(psycopg2.errors.NotNullViolation):
            conn.execute(
                "INSERT INTO objectified.tenant_user (tenant_id) VALUES (%s)",
                (tenant_id,),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_null_account")
        conn.execute("RELEASE SAVEPOINT before_null_account")

    def test_unique_constraint_on_tenant_account_exists(self, conn):
        """UNIQUE constraint uq_tenant_user_tenant_account must exist."""
        row = conn.fetchone(
            """
            SELECT constraint_name
            FROM information_schema.table_constraints
            WHERE constraint_type = 'UNIQUE'
              AND table_schema    = 'objectified'
              AND table_name      = 'tenant_user'
              AND constraint_name = 'uq_tenant_user_tenant_account'
            """
        )
        assert row is not None, "UNIQUE constraint 'uq_tenant_user_tenant_account' is missing"

    def test_duplicate_tenant_account_pair_rejected(self, conn):
        """Inserting the same (tenant_id, account_id) pair twice must raise UniqueViolation."""
        tenant_id = _insert_tenant(conn, slug="unique-pair-tenant")
        account_id = _insert_account(conn, email="unique-pair@example.com")

        conn.execute(
            "INSERT INTO objectified.tenant_user (tenant_id, account_id) VALUES (%s, %s)",
            (tenant_id, account_id),
        )
        conn.execute("SAVEPOINT before_duplicate_pair")
        with pytest.raises(psycopg2.errors.UniqueViolation):
            conn.execute(
                "INSERT INTO objectified.tenant_user (tenant_id, account_id) VALUES (%s, %s)",
                (tenant_id, account_id),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_duplicate_pair")
        conn.execute("RELEASE SAVEPOINT before_duplicate_pair")


# ---------------------------------------------------------------------------
# Indices
# ---------------------------------------------------------------------------

class TestTenantUserTableIndices:
    """Verify the required indices exist."""

    def _index_exists(self, conn, index_name: str) -> bool:
        row = conn.fetchone(
            """
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname = 'objectified'
              AND tablename  = 'tenant_user'
              AND indexname  = %s
            """,
            (index_name,),
        )
        return row is not None

    def test_index_on_tenant_id_exists(self, conn):
        assert self._index_exists(conn, "idx_tenant_user_tenant_id"), \
            "Index idx_tenant_user_tenant_id is missing"

    def test_index_on_account_id_exists(self, conn):
        assert self._index_exists(conn, "idx_tenant_user_account_id"), \
            "Index idx_tenant_user_account_id is missing"

    def test_index_on_access_level_exists(self, conn):
        assert self._index_exists(conn, "idx_tenant_user_access_level"), \
            "Index idx_tenant_user_access_level is missing"


# ---------------------------------------------------------------------------
# Trigger
# ---------------------------------------------------------------------------

class TestTenantUserTableTrigger:
    """Verify the updated_at trigger exists and fires correctly."""

    def test_updated_at_trigger_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT trigger_name
            FROM information_schema.triggers
            WHERE event_object_schema = 'objectified'
              AND event_object_table  = 'tenant_user'
              AND trigger_name        = 'trg_tenant_user_updated_at'
            """
        )
        assert row is not None, "Trigger trg_tenant_user_updated_at is missing"

    def test_updated_at_changes_on_update(self, conn):
        """Insert a row, update it, verify updated_at advances."""
        tenant_id = _insert_tenant(conn, slug="trigger-test-tenant")
        account_id = _insert_account(conn, email="trigger-test@example.com")

        conn.execute(
            """
            INSERT INTO objectified.tenant_user (tenant_id, account_id)
            VALUES (%s, %s)
            """,
            (tenant_id, account_id),
        )
        conn.execute("SELECT pg_sleep(0.01)")

        original = conn.fetchone(
            """
            SELECT updated_at FROM objectified.tenant_user
            WHERE tenant_id = %s AND account_id = %s
            """,
            (tenant_id, account_id),
        )

        conn.execute(
            """
            UPDATE objectified.tenant_user
            SET access_level = 'administrator'
            WHERE tenant_id = %s AND account_id = %s
            """,
            (tenant_id, account_id),
        )

        updated = conn.fetchone(
            """
            SELECT updated_at FROM objectified.tenant_user
            WHERE tenant_id = %s AND account_id = %s
            """,
            (tenant_id, account_id),
        )

        assert updated["updated_at"] is not None, "updated_at must be set after UPDATE"
        assert updated["updated_at"] >= original["updated_at"]


# ---------------------------------------------------------------------------
# Data integrity – insert / query / access levels
# ---------------------------------------------------------------------------

class TestTenantUserTableDataIntegrity:
    """Functional tests for CRUD behaviour. All data is rolled back after each test."""

    def test_insert_minimal_tenant_user_defaults_to_member(self, conn):
        tenant_id = _insert_tenant(conn, slug="data-test-tenant")
        account_id = _insert_account(conn, email="data-test@example.com")

        conn.execute(
            """
            INSERT INTO objectified.tenant_user (tenant_id, account_id)
            VALUES (%s, %s)
            """,
            (tenant_id, account_id),
        )
        row = conn.fetchone(
            """
            SELECT * FROM objectified.tenant_user
            WHERE tenant_id = %s AND account_id = %s
            """,
            (tenant_id, account_id),
        )
        assert row is not None
        assert row["tenant_id"] == tenant_id
        assert row["account_id"] == account_id
        assert row["access_level"] == "member"
        assert row["created_at"] is not None
        assert row["id"] is not None

    def test_insert_with_administrator_access_level(self, conn):
        tenant_id = _insert_tenant(conn, slug="admin-test-tenant")
        account_id = _insert_account(conn, email="admin-test@example.com")

        conn.execute(
            """
            INSERT INTO objectified.tenant_user (tenant_id, account_id, access_level)
            VALUES (%s, %s, 'administrator')
            """,
            (tenant_id, account_id),
        )
        row = conn.fetchone(
            """
            SELECT access_level FROM objectified.tenant_user
            WHERE tenant_id = %s AND account_id = %s
            """,
            (tenant_id, account_id),
        )
        assert row is not None
        assert row["access_level"] == "administrator"

    def test_invalid_access_level_rejected(self, conn):
        """An access_level value not in the ENUM must be rejected."""
        tenant_id = _insert_tenant(conn, slug="enum-test-tenant")
        account_id = _insert_account(conn, email="enum-test@example.com")

        conn.execute("SAVEPOINT before_bad_enum")
        with pytest.raises(psycopg2.errors.InvalidTextRepresentation):
            conn.execute(
                """
                INSERT INTO objectified.tenant_user (tenant_id, account_id, access_level)
                VALUES (%s, %s, 'superuser')
                """,
                (tenant_id, account_id),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_bad_enum")
        conn.execute("RELEASE SAVEPOINT before_bad_enum")

    def test_multiple_accounts_can_belong_to_same_tenant(self, conn):
        tenant_id = _insert_tenant(conn, slug="multi-account-tenant")
        account_id_1 = _insert_account(conn, email="multi-account-1@example.com")
        account_id_2 = _insert_account(conn, email="multi-account-2@example.com")

        conn.execute(
            "INSERT INTO objectified.tenant_user (tenant_id, account_id) VALUES (%s, %s)",
            (tenant_id, account_id_1),
        )
        conn.execute(
            "INSERT INTO objectified.tenant_user (tenant_id, account_id) VALUES (%s, %s)",
            (tenant_id, account_id_2),
        )
        rows = conn.fetchall(
            "SELECT account_id FROM objectified.tenant_user WHERE tenant_id = %s",
            (tenant_id,),
        )
        account_ids = [str(r["account_id"]) for r in rows]
        assert str(account_id_1) in account_ids
        assert str(account_id_2) in account_ids

    def test_same_account_can_belong_to_multiple_tenants(self, conn):
        account_id = _insert_account(conn, email="multi-tenant-account@example.com")
        tenant_id_1 = _insert_tenant(conn, slug="multi-tenant-1")
        tenant_id_2 = _insert_tenant(conn, slug="multi-tenant-2")

        conn.execute(
            "INSERT INTO objectified.tenant_user (tenant_id, account_id) VALUES (%s, %s)",
            (tenant_id_1, account_id),
        )
        conn.execute(
            "INSERT INTO objectified.tenant_user (tenant_id, account_id) VALUES (%s, %s)",
            (tenant_id_2, account_id),
        )
        rows = conn.fetchall(
            "SELECT tenant_id FROM objectified.tenant_user WHERE account_id = %s",
            (account_id,),
        )
        tenant_ids = [str(r["tenant_id"]) for r in rows]
        assert str(tenant_id_1) in tenant_ids
        assert str(tenant_id_2) in tenant_ids

    def test_created_at_is_set_on_insert(self, conn):
        from datetime import datetime, timezone, timedelta

        tenant_id = _insert_tenant(conn, slug="created-at-test-tenant")
        account_id = _insert_account(conn, email="created-at-test@example.com")

        before = datetime.now(timezone.utc).replace(tzinfo=None)
        conn.execute(
            "INSERT INTO objectified.tenant_user (tenant_id, account_id) VALUES (%s, %s)",
            (tenant_id, account_id),
        )
        after = datetime.now(timezone.utc).replace(tzinfo=None)

        row = conn.fetchone(
            "SELECT created_at FROM objectified.tenant_user WHERE tenant_id = %s AND account_id = %s",
            (tenant_id, account_id),
        )
        assert row is not None
        assert row["created_at"] is not None
        assert before <= row["created_at"] <= after + timedelta(seconds=1)

    def test_no_data_persists_after_rollback(self, conn):
        """Sanity check: row inserted is visible within the same transaction."""
        tenant_id = _insert_tenant(conn, slug="rollback-check-tenant")
        account_id = _insert_account(conn, email="rollback-check@example.com")

        conn.execute(
            "INSERT INTO objectified.tenant_user (tenant_id, account_id) VALUES (%s, %s)",
            (tenant_id, account_id),
        )
        row = conn.fetchone(
            "SELECT id FROM objectified.tenant_user WHERE tenant_id = %s AND account_id = %s",
            (tenant_id, account_id),
        )
        assert row is not None, "Row should be visible within the same transaction"
        # After this test completes, the fixture issues rollback, removing the row.

