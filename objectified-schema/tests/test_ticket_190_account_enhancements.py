"""
SQL tests for GitHub #190: account last_login / deactivation fields and lifecycle audit table.
"""


class TestAccountTicket190Columns:
    """objectified.account columns for activity and deactivation metadata."""

    def test_last_login_at_exists_nullable(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name = 'account'
              AND column_name = 'last_login_at'
            """
        )
        assert row is not None
        assert row["data_type"] == "timestamp without time zone"
        assert row["is_nullable"] == "YES"

    def test_deactivation_reason_exists_nullable(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name = 'account'
              AND column_name = 'deactivation_reason'
            """
        )
        assert row is not None
        assert row["data_type"] == "text"
        assert row["is_nullable"] == "YES"

    def test_deactivated_by_exists_nullable(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name = 'account'
              AND column_name = 'deactivated_by'
            """
        )
        assert row is not None
        assert row["data_type"] == "uuid"
        assert row["is_nullable"] == "YES"


class TestAccountLifecycleEventTable:
    """objectified.account_lifecycle_event append-only audit rows."""

    def test_table_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'objectified'
              AND table_name = 'account_lifecycle_event'
            """
        )
        assert row is not None

    def test_core_columns(self, conn):
        rows = conn.fetchall(
            """
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name = 'account_lifecycle_event'
            """
        )
        by_name = {r["column_name"]: r for r in rows}
        assert "id" in by_name
        assert "account_id" in by_name
        assert "event_type" in by_name
        assert "reason" in by_name
        assert "actor_id" in by_name
        assert "created_at" in by_name
        assert by_name["event_type"]["is_nullable"] == "NO"
        assert by_name["account_id"]["is_nullable"] == "NO"
