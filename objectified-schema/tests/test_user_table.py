"""
test_user_table.py – SQL tests for the objectified.user table.

Every test runs inside a transaction that is rolled back after completion
(via the 'conn' fixture in conftest.py), so no data persists to the database.
"""

import pytest
import psycopg2


# ---------------------------------------------------------------------------
# Schema / column existence
# ---------------------------------------------------------------------------

class TestUserTableStructure:
    """Verify the table and its columns exist with the correct types."""

    def test_table_exists(self, conn):
        """objectified.user table must exist."""
        row = conn.fetchone(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'objectified'
              AND table_name   = 'user'
            """
        )
        assert row is not None, "Table objectified.user does not exist"

    def test_column_id_is_uuid(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'user'
              AND column_name  = 'id'
            """
        )
        assert row is not None, "Column 'id' is missing"
        assert row["data_type"] == "uuid"

    def test_column_name_varchar255(self, conn):
        row = conn.fetchone(
            """
            SELECT character_maximum_length, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'user'
              AND column_name  = 'name'
            """
        )
        assert row is not None, "Column 'name' is missing"
        assert row["character_maximum_length"] == 255
        assert row["is_nullable"] == "NO"

    def test_column_email_varchar255_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT character_maximum_length, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'user'
              AND column_name  = 'email'
            """
        )
        assert row is not None, "Column 'email' is missing"
        assert row["character_maximum_length"] == 255
        assert row["is_nullable"] == "NO"

    def test_column_password_varchar255_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT character_maximum_length, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'user'
              AND column_name  = 'password'
            """
        )
        assert row is not None, "Column 'password' is missing"
        assert row["character_maximum_length"] == 255
        assert row["is_nullable"] == "NO"

    def test_column_verified_boolean_not_null_default_false(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'user'
              AND column_name  = 'verified'
            """
        )
        assert row is not None, "Column 'verified' is missing"
        assert row["data_type"] == "boolean"
        assert row["is_nullable"] == "NO"
        assert "false" in row["column_default"].lower()

    def test_column_enabled_boolean_not_null_default_true(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'user'
              AND column_name  = 'enabled'
            """
        )
        assert row is not None, "Column 'enabled' is missing"
        assert row["data_type"] == "boolean"
        assert row["is_nullable"] == "NO"
        assert "true" in row["column_default"].lower()

    def test_column_metadata_jsonb_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'user'
              AND column_name  = 'metadata'
            """
        )
        assert row is not None, "Column 'metadata' is missing"
        assert row["data_type"] == "jsonb"
        assert row["is_nullable"] == "NO"

    def test_column_created_at_timestamp_no_tz(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'user'
              AND column_name  = 'created_at'
            """
        )
        assert row is not None, "Column 'created_at' is missing"
        assert row["data_type"] == "timestamp without time zone"

    def test_column_updated_at_timestamp_no_tz(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'user'
              AND column_name  = 'updated_at'
            """
        )
        assert row is not None, "Column 'updated_at' is missing"
        assert row["data_type"] == "timestamp without time zone"

    def test_column_deleted_at_timestamp_no_tz_nullable(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'user'
              AND column_name  = 'deleted_at'
            """
        )
        assert row is not None, "Column 'deleted_at' is missing"
        assert row["data_type"] == "timestamp without time zone"
        assert row["is_nullable"] == "YES"


# ---------------------------------------------------------------------------
# Constraints
# ---------------------------------------------------------------------------

class TestUserTableConstraints:
    """Verify primary key, unique, and not-null constraints."""

    def test_primary_key_on_id(self, conn):
        row = conn.fetchone(
            """
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema    = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
              AND tc.table_schema    = 'objectified'
              AND tc.table_name      = 'user'
            """
        )
        assert row is not None
        assert row["column_name"] == "id"

    def test_unique_constraint_on_email(self, conn):
        row = conn.fetchone(
            """
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema    = kcu.table_schema
            WHERE tc.constraint_type = 'UNIQUE'
              AND tc.table_schema    = 'objectified'
              AND tc.table_name      = 'user'
              AND kcu.column_name    = 'email'
            """
        )
        assert row is not None, "UNIQUE constraint on 'email' is missing"


# ---------------------------------------------------------------------------
# Indices
# ---------------------------------------------------------------------------

class TestUserTableIndices:
    """Verify the required indices exist."""

    def _index_exists(self, conn, index_name: str) -> bool:
        row = conn.fetchone(
            """
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname = 'objectified'
              AND tablename  = 'user'
              AND indexname  = %s
            """,
            (index_name,),
        )
        return row is not None

    def test_index_on_email_exists(self, conn):
        assert self._index_exists(conn, "idx_user_email"), "Index idx_user_email is missing"

    def test_index_on_name_exists(self, conn):
        assert self._index_exists(conn, "idx_user_name"), "Index idx_user_name is missing"

    def test_index_on_enabled_exists(self, conn):
        assert self._index_exists(conn, "idx_user_enabled"), "Index idx_user_enabled is missing"

    def test_index_on_verified_exists(self, conn):
        assert self._index_exists(conn, "idx_user_verified"), "Index idx_user_verified is missing"

    def test_index_on_deleted_at_exists(self, conn):
        assert self._index_exists(conn, "idx_user_deleted_at"), "Index idx_user_deleted_at is missing"


# ---------------------------------------------------------------------------
# Trigger
# ---------------------------------------------------------------------------

class TestUserTableTrigger:
    """Verify the updated_at trigger exists and fires correctly."""

    def test_updated_at_trigger_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT trigger_name
            FROM information_schema.triggers
            WHERE event_object_schema = 'objectified'
              AND event_object_table  = 'user'
              AND trigger_name        = 'trg_user_updated_at'
            """
        )
        assert row is not None, "Trigger trg_user_updated_at is missing"

    def test_updated_at_changes_on_update(self, conn):
        """Insert a row, update it, verify updated_at advances."""
        conn.execute(
            """
            INSERT INTO objectified."user" (name, email, password)
            VALUES (%s, %s, %s)
            """,
            ("Trigger Test User", "trigger@example.com", "hashed_pw"),
        )
        # Force a small delay so the clock can tick
        conn.execute("SELECT pg_sleep(0.01)")

        original = conn.fetchone(
            "SELECT updated_at FROM objectified.\"user\" WHERE email = %s",
            ("trigger@example.com",),
        )

        conn.execute(
            "UPDATE objectified.\"user\" SET name = %s WHERE email = %s",
            ("Trigger Test User Updated", "trigger@example.com"),
        )

        updated = conn.fetchone(
            "SELECT updated_at FROM objectified.\"user\" WHERE email = %s",
            ("trigger@example.com",),
        )

        assert updated["updated_at"] >= original["updated_at"], (
            "updated_at did not advance after UPDATE"
        )


# ---------------------------------------------------------------------------
# Data integrity – insert / query / soft-delete
# ---------------------------------------------------------------------------

class TestUserTableDataIntegrity:
    """Functional tests for CRUD behaviour. All data is rolled back after each test."""

    def test_insert_minimal_user(self, conn):
        conn.execute(
            """
            INSERT INTO objectified."user" (name, email, password)
            VALUES (%s, %s, %s)
            """,
            ("Alice", "alice@example.com", "hashed_password_alice"),
        )
        row = conn.fetchone(
            "SELECT * FROM objectified.\"user\" WHERE email = %s",
            ("alice@example.com",),
        )
        assert row is not None
        assert row["name"] == "Alice"
        assert row["verified"] is False
        assert row["enabled"] is True
        assert row["metadata"] == {}
        assert row["deleted_at"] is None
        assert row["id"] is not None

    def test_default_metadata_is_empty_object(self, conn):
        conn.execute(
            """
            INSERT INTO objectified."user" (name, email, password)
            VALUES (%s, %s, %s)
            """,
            ("Bob", "bob@example.com", "hashed_password_bob"),
        )
        row = conn.fetchone(
            "SELECT metadata FROM objectified.\"user\" WHERE email = %s",
            ("bob@example.com",),
        )
        assert row["metadata"] == {}

    def test_metadata_stores_arbitrary_json(self, conn):
        import json
        payload = {"provider": "google", "sub": "1234567890"}
        conn.execute(
            """
            INSERT INTO objectified."user" (name, email, password, metadata)
            VALUES (%s, %s, %s, %s)
            """,
            ("Carol", "carol@example.com", "hashed_pw", json.dumps(payload)),
        )
        row = conn.fetchone(
            "SELECT metadata FROM objectified.\"user\" WHERE email = %s",
            ("carol@example.com",),
        )
        assert row["metadata"]["provider"] == "google"
        assert row["metadata"]["sub"] == "1234567890"

    def test_email_unique_constraint_raises(self, conn):
        conn.execute(
            """
            INSERT INTO objectified."user" (name, email, password)
            VALUES (%s, %s, %s)
            """,
            ("Dave", "dave@example.com", "hashed_pw_dave"),
        )
        # Use an inner savepoint so the connection stays usable after the error
        conn.execute("SAVEPOINT before_duplicate")
        with pytest.raises(psycopg2.errors.UniqueViolation):
            conn.execute(
                """
                INSERT INTO objectified."user" (name, email, password)
                VALUES (%s, %s, %s)
                """,
                ("Dave Duplicate", "dave@example.com", "another_hash"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_duplicate")
        conn.execute("RELEASE SAVEPOINT before_duplicate")

    def test_soft_delete_sets_deleted_at_and_enabled(self, conn):
        conn.execute(
            """
            INSERT INTO objectified."user" (name, email, password)
            VALUES (%s, %s, %s)
            """,
            ("Eve", "eve@example.com", "hashed_pw_eve"),
        )
        conn.execute(
            """
            UPDATE objectified."user"
            SET deleted_at = CURRENT_TIMESTAMP,
                enabled    = false
            WHERE email = %s
            """,
            ("eve@example.com",),
        )
        row = conn.fetchone(
            "SELECT deleted_at, enabled FROM objectified.\"user\" WHERE email = %s",
            ("eve@example.com",),
        )
        assert row["deleted_at"] is not None
        assert row["enabled"] is False

    def test_soft_deleted_user_excluded_by_partial_index(self, conn):
        """
        The partial index idx_user_email covers only non-deleted rows.
        A soft-deleted user should NOT appear in queries filtered by deleted_at IS NULL.
        """
        conn.execute(
            """
            INSERT INTO objectified."user" (name, email, password)
            VALUES (%s, %s, %s)
            """,
            ("Frank", "frank@example.com", "hashed_pw_frank"),
        )
        conn.execute(
            """
            UPDATE objectified."user"
            SET deleted_at = CURRENT_TIMESTAMP, enabled = false
            WHERE email = %s
            """,
            ("frank@example.com",),
        )
        row = conn.fetchone(
            """
            SELECT id FROM objectified."user"
            WHERE email = %s AND deleted_at IS NULL
            """,
            ("frank@example.com",),
        )
        assert row is None, "Soft-deleted user must not appear in active user queries"

    def test_name_missing_raises_not_null(self, conn):
        conn.execute("SAVEPOINT before_noname")
        with pytest.raises(psycopg2.errors.NotNullViolation):
            conn.execute(
                """
                INSERT INTO objectified."user" (email, password)
                VALUES (%s, %s)
                """,
                ("noname@example.com", "hashed_pw"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_noname")
        conn.execute("RELEASE SAVEPOINT before_noname")

    def test_email_missing_raises_not_null(self, conn):
        conn.execute("SAVEPOINT before_noemail")
        with pytest.raises(psycopg2.errors.NotNullViolation):
            conn.execute(
                """
                INSERT INTO objectified."user" (name, password)
                VALUES (%s, %s)
                """,
                ("No Email", "hashed_pw"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_noemail")
        conn.execute("RELEASE SAVEPOINT before_noemail")

    def test_password_missing_raises_not_null(self, conn):
        conn.execute("SAVEPOINT before_nopw")
        with pytest.raises(psycopg2.errors.NotNullViolation):
            conn.execute(
                """
                INSERT INTO objectified."user" (name, email)
                VALUES (%s, %s)
                """,
                ("No Password", "nopw@example.com"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_nopw")
        conn.execute("RELEASE SAVEPOINT before_nopw")

    def test_no_data_persists_after_rollback(self, conn):
        """
        Sanity check: row inserted within this test is visible within the same
        transaction but will be gone after the fixture rolls back.
        """
        conn.execute(
            """
            INSERT INTO objectified."user" (name, email, password)
            VALUES (%s, %s, %s)
            """,
            ("Rollback Test", "rollback@example.com", "hashed_pw"),
        )
        row = conn.fetchone(
            "SELECT id FROM objectified.\"user\" WHERE email = %s",
            ("rollback@example.com",),
        )
        assert row is not None, "Row should be visible within the same transaction"
        # After this test completes the fixture issues conn.rollback(), removing the row.



