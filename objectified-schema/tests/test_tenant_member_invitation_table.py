"""
test_tenant_member_invitation_table.py – SQL tests for tenant_member_invitation.

Runs against objectified_test; each test uses a rolled-back transaction via conftest.
"""

import psycopg2.errors
import pytest


def _insert_tenant(conn, slug="inv-test-tenant"):
    conn.execute(
        """
        INSERT INTO objectified.tenant (name, description, slug)
        VALUES (%s, %s, %s)
        ON CONFLICT (slug) DO NOTHING
        """,
        ("Invitation Test Tenant", "For invitation tests", slug),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.tenant WHERE slug = %s", (slug,)
    )["id"]


def _insert_account(conn, email="inviter@example.com"):
    conn.execute(
        """
        INSERT INTO objectified.account (name, email, password)
        VALUES (%s, %s, %s)
        ON CONFLICT ( (LOWER(email)) ) DO NOTHING
        """,
        ("Inviter", email, "hashed_password"),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.account WHERE LOWER(email) = LOWER(%s)", (email,)
    )["id"]


def _first_role_for_tenant(conn, tenant_id):
    row = conn.fetchone(
        """
        SELECT id FROM objectified.role
        WHERE tenant_id = %s AND deleted_at IS NULL
        ORDER BY LOWER(key) ASC
        LIMIT 1
        """,
        (tenant_id,),
    )
    return row["id"] if row else None


class TestTenantMemberInvitationTableStructure:
    def test_table_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'objectified'
              AND table_name = 'tenant_member_invitation'
            """
        )
        assert row is not None

    def test_unique_pending_email_per_tenant(self, conn):
        tenant_id = _insert_tenant(conn, slug="inv-uniq-tenant")
        role_id = _first_role_for_tenant(conn, tenant_id)
        if role_id is None:
            pytest.skip("No seeded role for tenant")
        inviter = _insert_account(conn, "uniq-inviter@example.com")
        conn.execute(
            """
            INSERT INTO objectified.tenant_member_invitation
                (tenant_id, email, role_id, invited_by_account_id, last_sent_at)
            VALUES (%s, %s, %s, %s, timezone('utc', clock_timestamp()))
            """,
            (tenant_id, "pending-user@example.com", role_id, inviter),
        )
        with pytest.raises(psycopg2.errors.UniqueViolation):
            conn.execute(
                """
                INSERT INTO objectified.tenant_member_invitation
                    (tenant_id, email, role_id, invited_by_account_id, last_sent_at)
                VALUES (%s, %s, %s, %s, timezone('utc', clock_timestamp()))
                """,
                (tenant_id, "PENDING-USER@example.com", role_id, inviter),
            )
