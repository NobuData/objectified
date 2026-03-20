"""SQL tests for schema promotion workflow (GH-137)."""

import uuid

import psycopg2
import pytest


def _insert_account(conn, suffix: str) -> str:
    email = f"sp-{suffix}-{uuid.uuid4().hex[:8]}@example.com"
    conn.execute(
        """
        INSERT INTO objectified.account (name, email, password)
        VALUES (%s, %s, %s)
        """,
        ("SP User", email, "x"),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.account WHERE email = %s", (email,)
    )["id"]


def _insert_tenant(conn, suffix: str) -> str:
    slug = f"sp-tenant-{suffix}-{uuid.uuid4().hex[:8]}"
    conn.execute(
        """
        INSERT INTO objectified.tenant (name, description, slug)
        VALUES (%s, %s, %s)
        """,
        ("SP Tenant", "d", slug),
    )
    return conn.fetchone("SELECT id FROM objectified.tenant WHERE slug = %s", (slug,))[
        "id"
    ]


def _insert_project(conn, tenant_id: str, creator_id: str, suffix: str) -> str:
    slug = f"sp-proj-{suffix}-{uuid.uuid4().hex[:8]}"
    conn.execute(
        """
        INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (tenant_id, creator_id, "SP Project", "d", slug),
    )
    return conn.fetchone("SELECT id FROM objectified.project WHERE slug = %s", (slug,))[
        "id"
    ]


def _insert_published_version(conn, project_id: str, creator_id: str) -> str:
    return conn.fetchone(
        """
        INSERT INTO objectified.version
            (project_id, creator_id, name, description, published, visibility, published_at)
        VALUES
            (%s, %s, 'v1.0', 'desc', true, 'public', timezone('utc', clock_timestamp()))
        RETURNING id
        """,
        (project_id, creator_id),
    )["id"]


class TestSchemaPromotionTables:
    def test_tables_exist(self, conn):
        for t in ("schema_live_version", "schema_promotion"):
            row = conn.fetchone(
                """
                SELECT 1 AS ok
                FROM information_schema.tables
                WHERE table_schema = 'objectified'
                  AND LOWER(table_name) = LOWER(%s)
                """,
                (t,),
            )
            assert row and row["ok"] == 1

    def test_enum_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT t.typname
            FROM pg_type t
            JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = 'objectified'
              AND t.typname = 'schema_environment'
            """
        )
        assert row is not None

    def test_unique_project_env(self, conn):
        aid = _insert_account(conn, "uniq")
        tid = _insert_tenant(conn, "uniq")
        pid = _insert_project(conn, tid, aid, "uniq")
        vid = _insert_published_version(conn, pid, aid)

        conn.execute(
            """
            INSERT INTO objectified.schema_live_version (project_id, environment, version_id, promoted_by)
            VALUES (%s, 'dev', %s, %s)
            """,
            (pid, vid, aid),
        )
        with pytest.raises(psycopg2.errors.UniqueViolation):
            conn.execute(
                """
                INSERT INTO objectified.schema_live_version (project_id, environment, version_id, promoted_by)
                VALUES (%s, 'dev', %s, %s)
                """,
                (pid, vid, aid),
            )

    def test_schema_promotion_insert_and_refs(self, conn):
        aid = _insert_account(conn, "hist")
        tid = _insert_tenant(conn, "hist")
        pid = _insert_project(conn, tid, aid, "hist")

        v_from = _insert_published_version(conn, pid, aid)
        v_to = _insert_published_version(conn, pid, aid)

        row = conn.fetchone(
            """
            INSERT INTO objectified.schema_promotion
                (project_id, environment, from_version_id, to_version_id, promoted_by, metadata)
            VALUES
                (%s, 'staging', %s, %s, %s, '{}'::jsonb)
            RETURNING id
            """,
            (pid, v_from, v_to, aid),
        )

        assert row is not None and "id" in row

