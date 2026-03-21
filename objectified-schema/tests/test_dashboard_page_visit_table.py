"""
test_dashboard_page_visit_table.py — SQL tests for objectified.dashboard_page_visit (GitHub #188).
"""


class TestDashboardPageVisitTableStructure:
    """Verify the table exists with expected columns."""

    def test_table_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'objectified'
              AND table_name = 'dashboard_page_visit'
            """
        )
        assert row is not None

    def test_columns(self, conn):
        rows = conn.fetchall(
            """
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name = 'dashboard_page_visit'
            ORDER BY ordinal_position
            """
        )
        names = {r["column_name"]: r["data_type"] for r in rows}
        assert "id" in names
        assert "tenant_id" in names
        assert "account_id" in names
        assert "route_path" in names
        assert "visited_at" in names
