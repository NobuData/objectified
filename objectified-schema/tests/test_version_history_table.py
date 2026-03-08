"""
test_version_history_table.py – SQL tests for the objectified.version_history table.

Every test runs inside a transaction that is rolled back after completion
(via the 'conn' fixture in conftest.py), so no data persists to the database.
"""

import json
import uuid

import psycopg2
import pytest


# ---------------------------------------------------------------------------
# Helpers to create prerequisite rows
# ---------------------------------------------------------------------------


def _insert_tenant(conn, slug="vh-tenant"):
    conn.execute(
        """
        INSERT INTO objectified.tenant (name, description, slug)
        VALUES (%s, %s, %s)
        ON CONFLICT (slug) DO NOTHING
        """,
        ("VH Tenant", "A tenant for version history tests", slug),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.tenant WHERE slug = %s", (slug,)
    )["id"]


def _insert_account(conn, email="vh@example.com"):
    conn.execute(
        """
        INSERT INTO objectified.account (name, email, password)
        VALUES (%s, %s, %s)
        ON CONFLICT ( (LOWER(email)) ) DO NOTHING
        """,
        ("VH User", email, "hashed_password"),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.account WHERE email = %s", (email,)
    )["id"]


def _insert_project(conn, slug="vh-project"):
    tenant_id = _insert_tenant(conn, f"vh-tenant-{slug}")
    creator_id = _insert_account(conn, f"vh-{slug}@example.com")
    row = conn.fetchone(
        """
        INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id, tenant_id, creator_id
        """,
        (tenant_id, creator_id, "VH Project", "Project for version history tests", slug),
    )
    return row


def _insert_version(conn, project_id, creator_id, name="v1.0"):
    return conn.fetchone(
        """
        INSERT INTO objectified.version (project_id, creator_id, name, description)
        VALUES (%s, %s, %s, %s)
        RETURNING id
        """,
        (project_id, creator_id, name, "Version for history tests"),
    )["id"]


# ---------------------------------------------------------------------------
# Structure
# ---------------------------------------------------------------------------


class TestVersionHistoryTableStructure:
    """Verify the table and its columns exist with the correct types."""

    def test_table_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'objectified'
              AND table_name   = 'version_history'
            """
        )
        assert row is not None, "Table objectified.version_history does not exist"

    @pytest.mark.parametrize(
        ("column_name", "data_type", "nullable"),
        [
            ("id", "uuid", "NO"),
            ("version_id", "uuid", "NO"),
            ("project_id", "uuid", "NO"),
            ("changed_by", "uuid", "YES"),
            ("revision", "integer", "NO"),
            ("operation", "character varying", "NO"),
            ("old_data", "jsonb", "YES"),
            ("new_data", "jsonb", "YES"),
            ("changed_at", "timestamp without time zone", "NO"),
        ],
    )
    def test_column_exists_with_expected_shape(self, conn, column_name, data_type, nullable):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'version_history'
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


class TestVersionHistoryTableConstraints:
    """Verify primary key, foreign keys, operation constraint, and unique constraint."""

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
              AND tc.table_name      = 'version_history'
            """
        )
        assert row is not None
        assert row["column_name"] == "id"

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
              AND tc.table_name      = 'version_history'
            ORDER BY kcu.column_name ASC
            """
        )
        assert [r["column_name"] for r in rows] == ["changed_by", "project_id", "version_id"]

    def test_operation_check_constraint_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT conname, pg_get_constraintdef(c.oid) AS definition
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'objectified'
              AND t.relname = 'version_history'
              AND c.conname = 'version_history_operation_check'
            """
        )
        assert row is not None, "CHECK constraint version_history_operation_check is missing"
        assert "INSERT" in row["definition"]
        assert "UPDATE" in row["definition"]
        assert "DELETE" in row["definition"]

    def test_unique_version_revision_constraint_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT conname
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'objectified'
              AND t.relname = 'version_history'
              AND c.conname = 'version_history_version_revision_unique'
            """
        )
        assert row is not None, "UNIQUE constraint version_history_version_revision_unique is missing"

    @pytest.mark.parametrize(
        "index_name",
        [
            "idx_version_history_version_id",
            "idx_version_history_project_id",
            "idx_version_history_changed_at",
        ],
    )
    def test_expected_indexes_exist(self, conn, index_name):
        row = conn.fetchone(
            """
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname = 'objectified'
              AND tablename  = 'version_history'
              AND indexname  = %s
            """,
            (index_name,),
        )
        assert row is not None, f"Index {index_name} is missing"


# ---------------------------------------------------------------------------
# Data integrity
# ---------------------------------------------------------------------------


class TestVersionHistoryTableDataIntegrity:
    """Verify inserts and constraint behavior."""

    def test_insert_history_row(self, conn):
        project = _insert_project(conn, "vh-insert-row")
        version_id = _insert_version(conn, project["id"], project["creator_id"])
        conn.execute(
            """
            INSERT INTO objectified.version_history
                (version_id, project_id, changed_by, revision, operation, old_data, new_data)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                version_id,
                project["id"],
                project["creator_id"],
                1,
                "INSERT",
                None,
                json.dumps({"name": "v1.0", "enabled": True}),
            ),
        )
        row = conn.fetchone(
            "SELECT operation, revision, new_data FROM objectified.version_history WHERE version_id = %s",
            (version_id,),
        )
        assert row is not None
        assert row["operation"] == "INSERT"
        assert row["revision"] == 1
        assert row["new_data"]["name"] == "v1.0"

    def test_duplicate_revision_raises_unique_violation(self, conn):
        project = _insert_project(conn, "vh-dup-revision")
        version_id = _insert_version(conn, project["id"], project["creator_id"])
        conn.execute(
            """
            INSERT INTO objectified.version_history
                (version_id, project_id, changed_by, revision, operation)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (version_id, project["id"], project["creator_id"], 1, "INSERT"),
        )
        conn.execute("SAVEPOINT before_dup_revision")
        with pytest.raises(psycopg2.errors.UniqueViolation):
            conn.execute(
                """
                INSERT INTO objectified.version_history
                    (version_id, project_id, changed_by, revision, operation)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (version_id, project["id"], project["creator_id"], 1, "UPDATE"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_dup_revision")
        conn.execute("RELEASE SAVEPOINT before_dup_revision")

    def test_invalid_operation_raises_check_violation(self, conn):
        project = _insert_project(conn, "vh-invalid-op")
        version_id = _insert_version(conn, project["id"], project["creator_id"])
        conn.execute("SAVEPOINT before_invalid_operation")
        with pytest.raises(psycopg2.errors.CheckViolation):
            conn.execute(
                """
                INSERT INTO objectified.version_history
                    (version_id, project_id, changed_by, revision, operation)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (version_id, project["id"], project["creator_id"], 1, "UPSERT"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_invalid_operation")
        conn.execute("RELEASE SAVEPOINT before_invalid_operation")

    def test_invalid_foreign_key_raises(self, conn):
        project = _insert_project(conn, "vh-bad-fk")
        conn.execute("SAVEPOINT before_bad_history_fk")
        with pytest.raises(psycopg2.errors.ForeignKeyViolation):
            conn.execute(
                """
                INSERT INTO objectified.version_history
                    (version_id, project_id, revision, operation)
                VALUES (%s, %s, %s, %s)
                """,
                (str(uuid.uuid4()), project["id"], 1, "INSERT"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_bad_history_fk")
        conn.execute("RELEASE SAVEPOINT before_bad_history_fk")

    def test_atomic_revision_insert(self, conn):
        """Verify the atomic INSERT...SELECT pattern produces sequential revisions."""
        project = _insert_project(conn, "vh-atomic")
        version_id = _insert_version(conn, project["id"], project["creator_id"])
        for i in range(3):
            conn.execute(
                """
                INSERT INTO objectified.version_history
                    (version_id, project_id, revision, operation)
                SELECT
                    %s,
                    %s,
                    COALESCE((SELECT MAX(revision) FROM objectified.version_history WHERE version_id = %s), 0) + 1,
                    %s
                """,
                (version_id, project["id"], version_id, "UPDATE"),
            )
        rows = conn.fetchall(
            "SELECT revision FROM objectified.version_history WHERE version_id = %s ORDER BY revision ASC",
            (version_id,),
        )
        assert [r["revision"] for r in rows] == [1, 2, 3]
