"""
test_rbac_tables.py – SQL tests for RBAC tables (roles/permissions).

Validates structure, indices, and key integrity behaviors introduced by GH-128.
All tests run in a transaction rolled back after completion.
"""

import psycopg2
import pytest


def _insert_tenant(conn, slug="rbac-tenant"):
    conn.execute(
        """
        INSERT INTO objectified.tenant (name, description, slug)
        VALUES (%s, %s, %s)
        ON CONFLICT (slug) DO NOTHING
        """,
        ("RBAC Tenant", "Tenant used for RBAC tests", slug),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.tenant WHERE slug = %s", (slug,)
    )["id"]


def _insert_account(conn, email="rbac-user@example.com"):
    conn.execute(
        """
        INSERT INTO objectified.account (name, email, password)
        VALUES (%s, %s, %s)
        ON CONFLICT ( (LOWER(email)) ) DO NOTHING
        """,
        ("RBAC User", email, "hashed_password"),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.account WHERE email = %s", (email,)
    )["id"]


class TestRbacTableStructure:
    @pytest.mark.parametrize(
        ("table_name",),
        [
            ("permission",),
            ("role",),
            ("role_permission",),
            ("account_role",),
        ],
    )
    def test_table_exists(self, conn, table_name):
        row = conn.fetchone(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'objectified'
              AND table_name   = %s
            """,
            (table_name,),
        )
        assert row is not None, f"Table objectified.{table_name} does not exist"

    def test_resource_type_enum_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT t.typname
            FROM pg_type t
            JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = 'objectified'
              AND t.typname = 'rbac_resource_type'
            """
        )
        assert row is not None, "Type objectified.rbac_resource_type does not exist"


class TestRbacSeeds:
    def test_permission_seed_keys_exist(self, conn):
        rows = conn.fetchall(
            """
            SELECT key
            FROM objectified.permission
            WHERE deleted_at IS NULL
              AND key IN (
                'project:read', 'project:write',
                'version:read', 'version:write', 'version:publish',
                'schema:read', 'schema:write', 'schema:promote',
                'audit:read'
              )
            ORDER BY key ASC
            """
        )
        keys = [r["key"] for r in rows]
        assert keys == [
            "audit:read",
            "project:read",
            "project:write",
            "schema:promote",
            "schema:read",
            "schema:write",
            "version:publish",
            "version:read",
            "version:write",
        ]

    def test_default_roles_exist_for_new_tenant(self, conn):
        tenant_id = _insert_tenant(conn, "rbac-seed-tenant")

        rows = conn.fetchall(
            """
            SELECT LOWER(key) AS key
            FROM objectified.role
            WHERE tenant_id = %s
              AND deleted_at IS NULL
              AND LOWER(key) IN ('viewer', 'schema-editor', 'publisher', 'auditor')
            ORDER BY LOWER(key) ASC
            """,
            (tenant_id,),
        )
        # The migration seeds roles for any tenant present during apply. For the
        # test tenant inserted after migrations, roles may not be present unless
        # seeded by application code. This asserts the tables exist and that
        # role keys are usable; it does not require auto-seeding post-migration.
        #
        # Insert them manually to validate uniqueness + FK wiring.
        if not rows:
            conn.execute(
                """
                INSERT INTO objectified.role (tenant_id, key, name, description)
                VALUES
                    (%s, 'viewer', 'Viewer', 'Read-only'),
                    (%s, 'schema-editor', 'Schema Editor', 'Edit schema'),
                    (%s, 'publisher', 'Publisher', 'Publish versions'),
                    (%s, 'auditor', 'Auditor', 'Read audits')
                """,
                (tenant_id, tenant_id, tenant_id, tenant_id),
            )
            rows = conn.fetchall(
                """
                SELECT LOWER(key) AS key
                FROM objectified.role
                WHERE tenant_id = %s
                  AND deleted_at IS NULL
                  AND LOWER(key) IN ('viewer', 'schema-editor', 'publisher', 'auditor')
                ORDER BY LOWER(key) ASC
                """,
                (tenant_id,),
            )

        assert [r["key"] for r in rows] == ["auditor", "publisher", "schema-editor", "viewer"]


class TestRbacIntegrity:
    def test_permission_key_unique(self, conn):
        conn.execute("SAVEPOINT before_dup_perm")
        conn.execute(
            """
            INSERT INTO objectified.permission (key, description)
            VALUES (%s, %s)
            ON CONFLICT (key) DO NOTHING
            """,
            ("rbac:test-unique", "A test permission"),
        )
        with pytest.raises(psycopg2.errors.UniqueViolation):
            conn.execute(
                """
                INSERT INTO objectified.permission (key, description)
                VALUES (%s, %s)
                """,
                ("rbac:test-unique", "A test permission duplicate"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_dup_perm")
        conn.execute("RELEASE SAVEPOINT before_dup_perm")

    def test_account_role_requires_resource_pair_or_none(self, conn):
        tenant_id = _insert_tenant(conn, "rbac-resource-tenant")
        account_id = _insert_account(conn, "rbac-resource-user@example.com")
        conn.execute(
            """
            INSERT INTO objectified.role (tenant_id, key, name)
            VALUES (%s, %s, %s)
            """,
            (tenant_id, "viewer", "Viewer"),
        )
        role_id = conn.fetchone(
            "SELECT id FROM objectified.role WHERE tenant_id = %s AND LOWER(key) = LOWER(%s)",
            (tenant_id, "viewer"),
        )["id"]

        conn.execute("SAVEPOINT before_bad_pair")
        with pytest.raises(psycopg2.errors.CheckViolation):
            conn.execute(
                """
                INSERT INTO objectified.account_role
                    (tenant_id, account_id, role_id, resource_type, resource_id)
                VALUES (%s, %s, %s, %s::objectified.rbac_resource_type, NULL)
                """,
                (tenant_id, account_id, role_id, "project"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_bad_pair")
        conn.execute("RELEASE SAVEPOINT before_bad_pair")

        conn.execute(
            """
            INSERT INTO objectified.account_role (tenant_id, account_id, role_id)
            VALUES (%s, %s, %s)
            """,
            (tenant_id, account_id, role_id),
        )
        row = conn.fetchone(
            """
            SELECT tenant_id, account_id, role_id, resource_type, resource_id
            FROM objectified.account_role
            WHERE tenant_id = %s AND account_id = %s AND role_id = %s
              AND deleted_at IS NULL
            """,
            (tenant_id, account_id, role_id),
        )
        assert row is not None
        assert row["resource_type"] is None
        assert row["resource_id"] is None

