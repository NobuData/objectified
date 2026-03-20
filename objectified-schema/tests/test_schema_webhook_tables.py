"""SQL tests for schema_webhook tables (GH-135)."""

import uuid

import psycopg2
import pytest


def _insert_account(conn, suffix: str) -> str:
    email = f"wh-{suffix}-{uuid.uuid4().hex[:8]}@example.com"
    conn.execute(
        """
        INSERT INTO objectified.account (name, email, password)
        VALUES (%s, %s, %s)
        """,
        ("WH User", email, "x"),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.account WHERE email = %s", (email,)
    )["id"]


def _insert_tenant(conn, suffix: str) -> str:
    slug = f"wh-tenant-{suffix}-{uuid.uuid4().hex[:8]}"
    conn.execute(
        """
        INSERT INTO objectified.tenant (name, description, slug)
        VALUES (%s, %s, %s)
        """,
        ("WH Tenant", "d", slug),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.tenant WHERE slug = %s", (slug,)
    )["id"]


def _insert_project(conn, tenant_id: str, creator_id: str, suffix: str) -> str:
    slug = f"wh-proj-{suffix}-{uuid.uuid4().hex[:8]}"
    conn.execute(
        """
        INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (tenant_id, creator_id, "WH Project", "d", slug),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.project WHERE slug = %s", (slug,)
    )["id"]


class TestSchemaWebhookTables:
    def test_tables_exist(self, conn):
        for t in ("schema_webhook", "schema_webhook_delivery"):
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

    def test_webhook_invalid_event_rejected(self, conn):
        aid = _insert_account(conn, "inv")
        tid = _insert_tenant(conn, "inv")
        pid = _insert_project(conn, tid, aid, "inv")
        with pytest.raises(psycopg2.errors.CheckViolation):
            conn.execute(
                """
                INSERT INTO objectified.schema_webhook (project_id, url, events)
                VALUES (%s, 'https://example.com/hook', ARRAY['unknown.event']::TEXT[])
                """,
                (pid,),
            )

    def test_delivery_cascade_on_webhook_delete(self, conn):
        aid = _insert_account(conn, "cas")
        tid = _insert_tenant(conn, "cas")
        pid = _insert_project(conn, tid, aid, "cas")
        wid = conn.fetchone(
            """
            INSERT INTO objectified.schema_webhook (project_id, url, events)
            VALUES (%s, 'https://example.com/h', ARRAY['schema.committed']::TEXT[])
            RETURNING id
            """,
            (pid,),
        )["id"]
        did = conn.fetchone(
            """
            INSERT INTO objectified.schema_webhook_delivery
                (webhook_id, event_type, payload, status)
            VALUES (%s, 'schema.committed', '{}'::jsonb, 'pending')
            RETURNING id
            """,
            (wid,),
        )["id"]
        conn.execute("DELETE FROM objectified.schema_webhook WHERE id = %s", (wid,))
        gone = conn.fetchone(
            "SELECT 1 AS ok FROM objectified.schema_webhook_delivery WHERE id = %s",
            (did,),
        )
        assert gone is None
