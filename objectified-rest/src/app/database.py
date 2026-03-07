"""Minimal database interface for objectified schema.

Used by auth and future CRUD services. Objectified schema uses
objectified.account, objectified.tenant, objectified.tenant_account, etc.
"""

from typing import Any, Optional

from app.config import settings


class Database:
    """Database connection and query interface for objectified schema."""

    def __init__(self) -> None:
        self._connection: Any = None

    def connect(self) -> Any:
        """Establish database connection."""
        if self._connection is None or getattr(
            self._connection, "closed", True
        ):
            try:
                import psycopg2
                from psycopg2.extras import RealDictCursor

                self._connection = psycopg2.connect(
                    settings.effective_database_url,
                    cursor_factory=RealDictCursor,
                )
            except Exception:
                self._connection = None
        return self._connection

    def close(self) -> None:
        """Close database connection."""
        if self._connection and not getattr(self._connection, "closed", True):
            try:
                self._connection.close()
            except Exception:
                pass
            self._connection = None

    def execute_query(
        self, query: str, params: Optional[tuple] = None
    ) -> list[dict[str, Any]]:
        """Execute a SELECT query and return results as list of dicts."""
        conn = self.connect()
        if conn is None:
            return []
        try:
            with conn.cursor() as cursor:
                cursor.execute(query, params or ())
                return cursor.fetchall()
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
            return []

    def validate_api_key(self, api_key: str) -> Optional[dict[str, Any]]:
        """
        Validate an API key and return tenant information.

        When objectified.api_keys (or equivalent) exists, implement lookup
        and return dict with tenant_id, tenant_slug, tenant_name. For now
        returns None (no API key table in initial schema).
        """
        if not api_key or len(api_key) < 12:
            return None
        # Placeholder: no api_keys table in objectified schema yet
        return None


db = Database()
