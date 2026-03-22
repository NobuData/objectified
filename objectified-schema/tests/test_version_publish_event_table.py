"""
test_version_publish_event_table.py – SQL tests for version publish audit (GitHub #203).

Runs in a transaction rolled back after each test (see conftest.py).
"""

import pytest


class TestVersionPublishTargetColumn:
    """objectified.version.publish_target for active publish channel."""

    def test_column_publish_target_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable, character_maximum_length
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'version'
              AND column_name  = 'publish_target'
            """
        )
        assert row is not None, "Column objectified.version.publish_target is missing"
        assert row["data_type"] == "character varying"
        assert row["is_nullable"] == "YES"
        assert row["character_maximum_length"] == 64


class TestVersionPublishEventTable:
    """objectified.version_publish_event audit rows."""

    def test_table_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'objectified'
              AND table_name   = 'version_publish_event'
            """
        )
        assert row is not None, "Table objectified.version_publish_event does not exist"

    def test_event_type_constraint_accepts_publish(self, conn):
        conn.execute(
            """
            INSERT INTO objectified.tenant (name, description, slug)
            VALUES ('t-pub-ev', 'x', 't-pub-ev-slug')
            ON CONFLICT (slug) DO NOTHING
            """
        )
        tid = conn.fetchone(
            "SELECT id FROM objectified.tenant WHERE slug = %s", ("t-pub-ev-slug",)
        )["id"]
        conn.execute(
            """
            INSERT INTO objectified.account (name, email, password)
            VALUES ('Pub Ev', 'pub-ev@test.local', 'x')
            ON CONFLICT ( (LOWER(email)) ) DO NOTHING
            """
        )
        aid = conn.fetchone(
            "SELECT id FROM objectified.account WHERE LOWER(email) = LOWER(%s)",
            ("pub-ev@test.local",),
        )["id"]
        conn.execute(
            """
            INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
            VALUES (%s, %s, 'p', 'd', 'pub-ev-proj')
            ON CONFLICT (tenant_id, slug) WHERE deleted_at IS NULL DO NOTHING
            """,
            (tid, aid),
        )
        pid = conn.fetchone(
            "SELECT id FROM objectified.project WHERE slug = %s", ("pub-ev-proj",)
        )["id"]
        conn.execute(
            """
            INSERT INTO objectified.version
                (project_id, creator_id, name, description, published, enabled)
            VALUES (%s, %s, 'v1', 'd', false, true)
            """,
            (pid, aid),
        )
        vid = conn.fetchone(
            "SELECT id FROM objectified.version WHERE project_id = %s AND name = %s",
            (pid, "v1"),
        )["id"]
        conn.execute(
            """
            INSERT INTO objectified.version_publish_event
                (version_id, project_id, event_type, target, visibility, note, actor_id)
            VALUES (%s, %s, 'publish', 'production', 'private', 'note', %s)
            """,
            (vid, pid, aid),
        )
        row = conn.fetchone(
            "SELECT event_type, target FROM objectified.version_publish_event WHERE version_id = %s",
            (vid,),
        )
        assert row["event_type"] == "publish"
        assert row["target"] == "production"

    def test_event_type_constraint_rejects_invalid(self, conn):
        conn.execute(
            """
            INSERT INTO objectified.tenant (name, description, slug)
            VALUES ('t-pub-ev2', 'x', 't-pub-ev2-slug')
            ON CONFLICT (slug) DO NOTHING
            """
        )
        tid = conn.fetchone(
            "SELECT id FROM objectified.tenant WHERE slug = %s", ("t-pub-ev2-slug",)
        )["id"]
        conn.execute(
            """
            INSERT INTO objectified.account (name, email, password)
            VALUES ('Pub Ev2', 'pub-ev2@test.local', 'x')
            ON CONFLICT ( (LOWER(email)) ) DO NOTHING
            """
        )
        aid = conn.fetchone(
            "SELECT id FROM objectified.account WHERE LOWER(email) = LOWER(%s)",
            ("pub-ev2@test.local",),
        )["id"]
        conn.execute(
            """
            INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
            VALUES (%s, %s, 'p2', 'd', 'pub-ev2-proj')
            ON CONFLICT (tenant_id, slug) WHERE deleted_at IS NULL DO NOTHING
            """,
            (tid, aid),
        )
        pid = conn.fetchone(
            "SELECT id FROM objectified.project WHERE slug = %s", ("pub-ev2-proj",)
        )["id"]
        conn.execute(
            """
            INSERT INTO objectified.version
                (project_id, creator_id, name, description, published, enabled)
            VALUES (%s, %s, 'v2', 'd', false, true)
            """,
            (pid, aid),
        )
        vid = conn.fetchone(
            "SELECT id FROM objectified.version WHERE project_id = %s AND name = %s",
            (pid, "v2"),
        )["id"]
        with pytest.raises(Exception):
            conn.execute(
                """
                INSERT INTO objectified.version_publish_event
                    (version_id, project_id, event_type)
                VALUES (%s, %s, 'invalid')
                """,
                (vid, pid),
            )
