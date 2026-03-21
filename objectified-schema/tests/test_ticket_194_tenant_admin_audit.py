"""
SQL tests for GitHub #194: tenant primary administrator column and admin audit events.
"""


class TestTenantPrimaryAdminColumn:
    """objectified.tenant.primary_admin_account_id."""

    def test_column_exists_nullable(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name = 'tenant'
              AND column_name = 'primary_admin_account_id'
            """
        )
        assert row is not None
        assert row["data_type"] == "uuid"
        assert row["is_nullable"] == "YES"


class TestTenantAdminAuditEventTable:
    """objectified.tenant_admin_audit_event append-only audit rows."""

    def test_table_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'objectified'
              AND table_name = 'tenant_admin_audit_event'
            """
        )
        assert row is not None

    def test_core_columns(self, conn):
        rows = conn.fetchall(
            """
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name = 'tenant_admin_audit_event'
            """
        )
        by_name = {r["column_name"]: r for r in rows}
        assert "id" in by_name
        assert "tenant_id" in by_name
        assert "event_type" in by_name
        assert "actor_account_id" in by_name
        assert "target_account_id" in by_name
        assert "previous_primary_account_id" in by_name
        assert "metadata" in by_name
        assert "created_at" in by_name
        assert by_name["event_type"]["is_nullable"] == "NO"
        assert by_name["tenant_id"]["is_nullable"] == "NO"
