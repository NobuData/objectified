"""
test_version_snapshot_table.py – SQL tests for the objectified.version_snapshot table.

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


def _insert_tenant(conn, slug="vs-tenant"):
    conn.execute(
        """
        INSERT INTO objectified.tenant (name, description, slug)
        VALUES (%s, %s, %s)
        ON CONFLICT (slug) DO NOTHING
        """,
        ("VS Tenant", "A tenant for version snapshot tests", slug),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.tenant WHERE slug = %s", (slug,)
    )["id"]


def _insert_account(conn, email="vs@example.com"):
    conn.execute(
        """
        INSERT INTO objectified.account (name, email, password)
        VALUES (%s, %s, %s)
        ON CONFLICT ( (LOWER(email)) ) DO NOTHING
        """,
        ("VS User", email, "hashed_password"),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.account WHERE LOWER(email) = LOWER(%s)", (email,)
    )["id"]


def _insert_project(conn, slug="vs-project"):
    tenant_id = _insert_tenant(conn, f"vs-tenant-{slug}")
    creator_id = _insert_account(conn, f"vs-{slug}@example.com")
    row = conn.fetchone(
        """
        INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id, tenant_id, creator_id
        """,
        (tenant_id, creator_id, "VS Project", "Project for version snapshot tests", slug),
    )
    return row


def _insert_version(conn, project_id, creator_id, name="v1.0"):
    return conn.fetchone(
        """
        INSERT INTO objectified.version (project_id, creator_id, name, description)
        VALUES (%s, %s, %s, %s)
        RETURNING id
        """,
        (project_id, creator_id, name, "Version for snapshot tests"),
    )["id"]


# ---------------------------------------------------------------------------
# Structure
# ---------------------------------------------------------------------------


class TestVersionSnapshotTableStructure:
    """Verify the table and its columns exist with the correct types."""

    def test_table_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'objectified'
              AND table_name   = 'version_snapshot'
            """
        )
        assert row is not None, "Table objectified.version_snapshot does not exist"

    @pytest.mark.parametrize(
        ("column_name", "data_type", "nullable"),
        [
            ("id", "uuid", "NO"),
            ("version_id", "uuid", "NO"),
            ("project_id", "uuid", "NO"),
            ("committed_by", "uuid", "YES"),
            ("revision", "integer", "NO"),
            ("label", "character varying", "YES"),
            ("description", "character varying", "YES"),
            ("snapshot", "jsonb", "NO"),
            ("created_at", "timestamp without time zone", "NO"),
        ],
    )
    def test_column_exists_with_expected_shape(self, conn, column_name, data_type, nullable):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'version_snapshot'
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


class TestVersionSnapshotTableConstraints:
    """Verify primary key, foreign keys, unique constraint, and indices."""

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
              AND tc.table_name      = 'version_snapshot'
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
              AND tc.table_name      = 'version_snapshot'
            ORDER BY kcu.column_name ASC
            """
        )
        assert [r["column_name"] for r in rows] == ["committed_by", "project_id", "version_id"]

    def test_unique_version_revision_constraint_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT conname
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'objectified'
              AND t.relname = 'version_snapshot'
              AND c.conname = 'version_snapshot_version_revision_unique'
            """
        )
        assert row is not None, "UNIQUE constraint version_snapshot_version_revision_unique is missing"

    @pytest.mark.parametrize(
        "index_name",
        [
            "idx_version_snapshot_version_id",
            "idx_version_snapshot_project_id",
            "idx_version_snapshot_created_at",
        ],
    )
    def test_expected_indexes_exist(self, conn, index_name):
        row = conn.fetchone(
            """
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname = 'objectified'
              AND tablename  = 'version_snapshot'
              AND indexname  = %s
            """,
            (index_name,),
        )
        assert row is not None, f"Index {index_name} is missing"


# ---------------------------------------------------------------------------
# Data integrity
# ---------------------------------------------------------------------------


class TestVersionSnapshotTableDataIntegrity:
    """Verify inserts and constraint behavior."""

    def test_insert_snapshot_row(self, conn):
        project = _insert_project(conn, "vs-insert-row")
        version_id = _insert_version(conn, project["id"], project["creator_id"])
        snapshot_data = json.dumps({
            "classes": [
                {
                    "name": "TestClass",
                    "description": "A test class",
                    "properties": [
                        {"name": "field_a", "data": {"type": "string"}}
                    ],
                }
            ]
        })
        conn.execute(
            """
            INSERT INTO objectified.version_snapshot
                (version_id, project_id, committed_by, revision, label, description, snapshot)
            VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
            """,
            (
                version_id,
                project["id"],
                project["creator_id"],
                1,
                "initial",
                "First snapshot",
                snapshot_data,
            ),
        )
        row = conn.fetchone(
            "SELECT revision, label, snapshot FROM objectified.version_snapshot WHERE version_id = %s",
            (version_id,),
        )
        assert row is not None
        assert row["revision"] == 1
        assert row["label"] == "initial"
        assert len(row["snapshot"]["classes"]) == 1
        assert row["snapshot"]["classes"][0]["name"] == "TestClass"

    def test_duplicate_revision_raises_unique_violation(self, conn):
        project = _insert_project(conn, "vs-dup-revision")
        version_id = _insert_version(conn, project["id"], project["creator_id"])
        conn.execute(
            """
            INSERT INTO objectified.version_snapshot
                (version_id, project_id, committed_by, revision, snapshot)
            VALUES (%s, %s, %s, %s, '{}'::jsonb)
            """,
            (version_id, project["id"], project["creator_id"], 1),
        )
        conn.execute("SAVEPOINT before_dup_snapshot_revision")
        with pytest.raises(psycopg2.errors.UniqueViolation):
            conn.execute(
                """
                INSERT INTO objectified.version_snapshot
                    (version_id, project_id, committed_by, revision, snapshot)
                VALUES (%s, %s, %s, %s, '{}'::jsonb)
                """,
                (version_id, project["id"], project["creator_id"], 1),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_dup_snapshot_revision")
        conn.execute("RELEASE SAVEPOINT before_dup_snapshot_revision")

    def test_invalid_foreign_key_raises(self, conn):
        project = _insert_project(conn, "vs-bad-fk")
        conn.execute("SAVEPOINT before_bad_snapshot_fk")
        with pytest.raises(psycopg2.errors.ForeignKeyViolation):
            conn.execute(
                """
                INSERT INTO objectified.version_snapshot
                    (version_id, project_id, revision, snapshot)
                VALUES (%s, %s, %s, '{}'::jsonb)
                """,
                (str(uuid.uuid4()), project["id"], 1),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_bad_snapshot_fk")
        conn.execute("RELEASE SAVEPOINT before_bad_snapshot_fk")

    def test_atomic_revision_insert(self, conn):
        """Verify the atomic INSERT...SELECT pattern produces sequential revisions."""
        project = _insert_project(conn, "vs-atomic")
        version_id = _insert_version(conn, project["id"], project["creator_id"])
        for i in range(3):
            conn.execute(
                """
                INSERT INTO objectified.version_snapshot
                    (version_id, project_id, revision, snapshot)
                SELECT
                    %s,
                    %s,
                    COALESCE((SELECT MAX(revision) FROM objectified.version_snapshot WHERE version_id = %s), 0) + 1,
                    '{}'::jsonb
                """,
                (version_id, project["id"], version_id),
            )
        rows = conn.fetchall(
            "SELECT revision FROM objectified.version_snapshot WHERE version_id = %s ORDER BY revision ASC",
            (version_id,),
        )
        assert [r["revision"] for r in rows] == [1, 2, 3]

    def test_snapshot_nullable_label_and_description(self, conn):
        """Verify that label and description can be NULL."""
        project = _insert_project(conn, "vs-nullable")
        version_id = _insert_version(conn, project["id"], project["creator_id"])
        conn.execute(
            """
            INSERT INTO objectified.version_snapshot
                (version_id, project_id, committed_by, revision, snapshot)
            VALUES (%s, %s, %s, %s, '{}'::jsonb)
            """,
            (version_id, project["id"], project["creator_id"], 1),
        )
        row = conn.fetchone(
            "SELECT label, description FROM objectified.version_snapshot WHERE version_id = %s",
            (version_id,),
        )
        assert row is not None
        assert row["label"] is None
        assert row["description"] is None

    def test_snapshot_nullable_committed_by(self, conn):
        """Verify that committed_by can be NULL (e.g. for API key auth)."""
        project = _insert_project(conn, "vs-nullable-committer")
        version_id = _insert_version(conn, project["id"], project["creator_id"])
        conn.execute(
            """
            INSERT INTO objectified.version_snapshot
                (version_id, project_id, committed_by, revision, snapshot)
            VALUES (%s, %s, NULL, %s, '{}'::jsonb)
            """,
            (version_id, project["id"], 1),
        )
        row = conn.fetchone(
            "SELECT committed_by FROM objectified.version_snapshot WHERE version_id = %s",
            (version_id,),
        )
        assert row is not None
        assert row["committed_by"] is None

