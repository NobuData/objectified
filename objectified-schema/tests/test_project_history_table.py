"""
test_project_history_table.py – SQL tests for the objectified.project_history table.

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


def _insert_tenant(conn, slug="project-history-tenant"):
    conn.execute(
        """
        INSERT INTO objectified.tenant (name, description, slug)
        VALUES (%s, %s, %s)
        ON CONFLICT (slug) DO NOTHING
        """,
        ("History Tenant", "A tenant for project history tests", slug),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.tenant WHERE slug = %s", (slug,)
    )["id"]



def _insert_account(conn, email="project-history@example.com"):
    conn.execute(
        """
        INSERT INTO objectified.account (name, email, password)
        VALUES (%s, %s, %s)
        ON CONFLICT ( (LOWER(email)) ) DO NOTHING
        """,
        ("History User", email, "hashed_password"),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.account WHERE email = %s", (email,)
    )["id"]



def _insert_project(conn, slug="history-project"):
    tenant_id = _insert_tenant(conn, f"history-tenant-{slug}")
    creator_id = _insert_account(conn, f"history-{slug}@example.com")
    row = conn.fetchone(
        """
        INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id, tenant_id, creator_id
        """,
        (tenant_id, creator_id, "History Project", "Project for history tests", slug),
    )
    return row


# ---------------------------------------------------------------------------
# Structure
# ---------------------------------------------------------------------------


class TestProjectHistoryTableStructure:
    """Verify the table and its columns exist with the correct types."""

    def test_table_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'objectified'
              AND table_name   = 'project_history'
            """
        )
        assert row is not None, "Table objectified.project_history does not exist"

    @pytest.mark.parametrize(
        ("column_name", "data_type", "nullable"),
        [
            ("id", "uuid", "NO"),
            ("project_id", "uuid", "NO"),
            ("tenant_id", "uuid", "NO"),
            ("changed_by", "uuid", "YES"),
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
              AND table_name   = 'project_history'
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


class TestProjectHistoryTableConstraints:
    """Verify primary key, foreign keys, and operation constraint."""

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
              AND tc.table_name      = 'project_history'
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
              AND tc.table_name      = 'project_history'
            ORDER BY kcu.column_name ASC
            """
        )
        assert [r["column_name"] for r in rows] == ["changed_by", "project_id", "tenant_id"]

    def test_operation_check_constraint_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT conname, pg_get_constraintdef(c.oid) AS definition
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'objectified'
              AND t.relname = 'project_history'
              AND c.conname = 'project_history_operation_check'
            """
        )
        assert row is not None, "CHECK constraint project_history_operation_check is missing"
        assert "INSERT" in row["definition"]
        assert "UPDATE" in row["definition"]
        assert "DELETE" in row["definition"]

    @pytest.mark.parametrize(
        "index_name",
        [
            "idx_project_history_project_id",
            "idx_project_history_tenant_id",
            "idx_project_history_changed_at",
        ],
    )
    def test_expected_indexes_exist(self, conn, index_name):
        row = conn.fetchone(
            """
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname = 'objectified'
              AND tablename  = 'project_history'
              AND indexname  = %s
            """,
            (index_name,),
        )
        assert row is not None, f"Index {index_name} is missing"


# ---------------------------------------------------------------------------
# Data integrity
# ---------------------------------------------------------------------------


class TestProjectHistoryTableDataIntegrity:
    """Verify inserts and constraint behavior."""

    def test_insert_history_row(self, conn):
        project = _insert_project(conn, "history-row-project")
        conn.execute(
            """
            INSERT INTO objectified.project_history
                (project_id, tenant_id, changed_by, operation, old_data, new_data)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                project["id"],
                project["tenant_id"],
                project["creator_id"],
                "INSERT",
                None,
                json.dumps({"slug": "history-row-project", "enabled": True}),
            ),
        )
        row = conn.fetchone(
            "SELECT operation, new_data FROM objectified.project_history WHERE project_id = %s",
            (project["id"],),
        )
        assert row is not None
        assert row["operation"] == "INSERT"
        assert row["new_data"]["slug"] == "history-row-project"

    def test_invalid_operation_raises_check_violation(self, conn):
        project = _insert_project(conn, "history-invalid-op-project")
        conn.execute("SAVEPOINT before_invalid_operation")
        with pytest.raises(psycopg2.errors.CheckViolation):
            conn.execute(
                """
                INSERT INTO objectified.project_history
                    (project_id, tenant_id, changed_by, operation)
                VALUES (%s, %s, %s, %s)
                """,
                (project["id"], project["tenant_id"], project["creator_id"], "UPSERT"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_invalid_operation")
        conn.execute("RELEASE SAVEPOINT before_invalid_operation")

    def test_invalid_foreign_key_raises(self, conn):
        tenant_id = _insert_tenant(conn, "history-bad-fk-tenant")
        conn.execute("SAVEPOINT before_bad_history_fk")
        with pytest.raises(psycopg2.errors.ForeignKeyViolation):
            conn.execute(
                """
                INSERT INTO objectified.project_history
                    (project_id, tenant_id, operation)
                VALUES (%s, %s, %s)
                """,
                (str(uuid.uuid4()), tenant_id, "INSERT"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_bad_history_fk")
        conn.execute("RELEASE SAVEPOINT before_bad_history_fk")

