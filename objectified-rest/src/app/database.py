"""Minimal database interface for objectified schema.

Used by auth and future CRUD services. Objectified schema uses
objectified.account, objectified.tenant, objectified.tenant_account, etc.

Note: This scaffolding uses a single shared connection. FastAPI is async;
concurrent requests sharing one psycopg2 connection can share cursors and
transaction state, leading to data corruption or errors. When implementing
real CRUD/database operations, use a connection pool (e.g.
psycopg2.pool.ThreadedConnectionPool or async psycopg/asyncpg).
"""

import logging
from typing import Any, Optional

from app.config import settings

logger = logging.getLogger(__name__)


class Database:
    """Database connection and query interface for objectified schema.

    Uses a single shared connection (scaffolding only). For production or
    real CRUD, switch to a connection pool—see module docstring.
    """

    def __init__(self) -> None:
        self._connection: Any = None  # single connection; not safe for concurrent requests

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
                logger.exception("Database connection failed")
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
            except Exception as rollback_err:
                logger.exception("Rollback failed after query error: %s", rollback_err)
            logger.exception("Query failed: %s", query[:200] if query else "")
            return []

    def execute_mutation(
        self,
        query: str,
        params: Optional[tuple] = None,
        returning: bool = True,
    ) -> Optional[dict[str, Any]]:
        """Execute an INSERT/UPDATE/DELETE with optional RETURNING clause.

        Args:
            query: SQL statement; include RETURNING ... to get back a row.
            params: Query parameters.
            returning: If True, fetchone() is called and the row returned.

        Returns:
            The first returned row as a dict, or None if not found / no RETURNING.
        """
        conn = self.connect()
        if conn is None:
            return None
        try:
            with conn.cursor() as cursor:
                cursor.execute(query, params or ())
                conn.commit()
                if returning:
                    return cursor.fetchone()
                return None
        except Exception:
            try:
                conn.rollback()
            except Exception as rollback_err:
                logger.exception("Rollback failed after mutation error: %s", rollback_err)
            logger.exception("Mutation failed: %s", query[:200] if query else "")
            raise

    def validate_api_key(self, api_key: str) -> Optional[dict[str, Any]]:
        """
        Validate an API key and return tenant and account information.

        Looks up the SHA-256 hash of the raw key in objectified.api_key.
        Returns None if the key is unknown, expired, disabled, or revoked.

        On success, records the last_used timestamp and returns a dict with:
            tenant_id, tenant_slug, tenant_name, account_id, key_id
        """
        import hashlib
        import datetime

        if not api_key or len(api_key) < 12:
            return None

        key_hash = hashlib.sha256(api_key.encode()).hexdigest()

        rows = self.execute_query(
            """
            SELECT ak.id AS key_id,
                   ak.tenant_id,
                   ak.account_id,
                   ak.enabled,
                   ak.expires_at,
                   t.slug AS tenant_slug,
                   t.name AS tenant_name
            FROM objectified.api_key ak
            JOIN objectified.tenant t ON t.id = ak.tenant_id
            WHERE ak.key_hash = %s
              AND ak.deleted_at IS NULL
              AND t.deleted_at IS NULL
            LIMIT 1
            """,
            (key_hash,),
        )
        if not rows:
            return None

        row = rows[0]

        if not row.get("enabled"):
            return None

        expires_at = row.get("expires_at")
        if expires_at is not None:
            now = datetime.datetime.now(datetime.timezone.utc)
            # expires_at may be timezone-naive (stored WITHOUT TIME ZONE as UTC)
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=datetime.timezone.utc)
            if now > expires_at:
                return None

        # Best-effort update of last_used; do not fail validation on error
        try:
            self.execute_mutation(
                """
                UPDATE objectified.api_key
                SET last_used = timezone('utc', clock_timestamp())
                WHERE id = %s
                """,
                (row["key_id"],),
                returning=False,
            )
        except Exception:
            logger.warning("validate_api_key: failed to update last_used for key %s", row["key_id"])

        return {
            "key_id": str(row["key_id"]),
            "tenant_id": str(row["tenant_id"]),
            "tenant_slug": row["tenant_slug"],
            "tenant_name": row["tenant_name"],
            "account_id": str(row["account_id"]),
        }


db = Database()
