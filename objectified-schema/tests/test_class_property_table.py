"""
test_class_property_table.py – SQL tests for the objectified.class_property join table.

Every test runs inside a transaction that is rolled back after completion
(via the 'conn' fixture in conftest.py), so no data persists to the database.
"""

import json
import uuid

import pytest
import psycopg2


# ---------------------------------------------------------------------------
# Helpers to create prerequisite rows (tenant, account, project, version,
# class, and property)
# ---------------------------------------------------------------------------

def _insert_tenant(conn, slug="cp-tenant"):
    conn.execute(
        """
        INSERT INTO objectified.tenant (name, description, slug)
        VALUES (%s, %s, %s)
        ON CONFLICT (slug) DO NOTHING
        """,
        ("Test Tenant", "A tenant for class_property tests", slug),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.tenant WHERE slug = %s", (slug,)
    )["id"]


def _insert_account(conn, email="cp-creator@example.com"):
    conn.execute(
        """
        INSERT INTO objectified.account (name, email, password)
        VALUES (%s, %s, %s)
        ON CONFLICT ( (LOWER(email)) ) DO NOTHING
        """,
        ("Test Creator", email, "hashed_password"),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.account WHERE email = %s", (email,)
    )["id"]


def _insert_project(conn, slug="cp-project"):
    tenant_id = _insert_tenant(conn, f"cp-tenant-{slug}")
    creator_id = _insert_account(conn, f"cp-creator-{slug}@example.com")
    conn.execute(
        """
        INSERT INTO objectified.project (tenant_id, creator_id, name, description, slug)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (slug) DO NOTHING
        """,
        (tenant_id, creator_id, "Test Project", "Project for class_property tests", slug),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.project WHERE slug = %s", (slug,)
    )["id"]


def _insert_version(conn, project_slug="cp-version-project", version_name="1.0.0"):
    project_id = _insert_project(conn, project_slug)
    creator_id = _insert_account(conn, f"cp-version-{project_slug}@example.com")
    conn.execute(
        """
        INSERT INTO objectified.version (project_id, creator_id, name, description)
        VALUES (%s, %s, %s, %s)
        """,
        (project_id, creator_id, version_name, "Version for class_property tests"),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.version WHERE name = %s AND project_id = %s",
        (version_name, project_id),
    )["id"]


def _insert_class(conn, version_id, name="TestClass"):
    conn.execute(
        """
        INSERT INTO objectified.class (version_id, name, description)
        VALUES (%s, %s, %s)
        """,
        (version_id, name, f"Description of {name}"),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.class WHERE name = %s AND version_id = %s",
        (name, version_id),
    )["id"]


def _insert_property(conn, project_slug="cp-prop-project", name="TestProperty"):
    project_id = _insert_project(conn, project_slug)
    conn.execute(
        """
        INSERT INTO objectified.property (project_id, name, description)
        VALUES (%s, %s, %s)
        """,
        (project_id, name, f"Description of {name}"),
    )
    return conn.fetchone(
        "SELECT id FROM objectified.property WHERE name = %s AND project_id = %s",
        (name, project_id),
    )["id"]


def _make_class_and_property(conn, suffix="base"):
    """Return (class_id, property_id) for use in tests."""
    version_id = _insert_version(conn, f"cp-{suffix}-version-project", "1.0.0")
    class_id = _insert_class(conn, version_id, f"CPClass-{suffix}")
    property_id = _insert_property(conn, f"cp-{suffix}-prop-project", f"CPProperty-{suffix}")
    return class_id, property_id


# ---------------------------------------------------------------------------
# Schema / column existence
# ---------------------------------------------------------------------------

class TestClassPropertyTableStructure:
    """Verify the table and its columns exist with the correct types."""

    def test_table_exists(self, conn):
        """objectified.class_property table must exist."""
        row = conn.fetchone(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'objectified'
              AND table_name   = 'class_property'
            """
        )
        assert row is not None, "Table objectified.class_property does not exist"

    def test_column_id_is_uuid(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'class_property'
              AND column_name  = 'id'
            """
        )
        assert row is not None, "Column 'id' is missing"
        assert row["data_type"] == "uuid"

    def test_column_class_id_uuid_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'class_property'
              AND column_name  = 'class_id'
            """
        )
        assert row is not None, "Column 'class_id' is missing"
        assert row["data_type"] == "uuid"
        assert row["is_nullable"] == "NO"

    def test_column_property_id_uuid_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'class_property'
              AND column_name  = 'property_id'
            """
        )
        assert row is not None, "Column 'property_id' is missing"
        assert row["data_type"] == "uuid"
        assert row["is_nullable"] == "NO"

    def test_column_name_varchar255_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT character_maximum_length, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'class_property'
              AND column_name  = 'name'
            """
        )
        assert row is not None, "Column 'name' is missing"
        assert row["character_maximum_length"] == 255
        assert row["is_nullable"] == "NO"

    def test_column_description_varchar4096_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT character_maximum_length, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'class_property'
              AND column_name  = 'description'
            """
        )
        assert row is not None, "Column 'description' is missing"
        assert row["character_maximum_length"] == 4096
        assert row["is_nullable"] == "NO"

    def test_column_data_jsonb_not_null(self, conn):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'class_property'
              AND column_name  = 'data'
            """
        )
        assert row is not None, "Column 'data' is missing"
        assert row["data_type"] == "jsonb"
        assert row["is_nullable"] == "NO"


# ---------------------------------------------------------------------------
# Constraints
# ---------------------------------------------------------------------------

class TestClassPropertyTableConstraints:
    """Verify primary key, foreign key, and unique constraints."""

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
              AND tc.table_name      = 'class_property'
            """
        )
        assert row is not None
        assert row["column_name"] == "id"

    def test_class_id_foreign_key_references_class(self, conn):
        row = conn.fetchone(
            """
            SELECT tc.constraint_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema    = kcu.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema    = 'objectified'
              AND tc.table_name      = 'class_property'
              AND kcu.column_name    = 'class_id'
            """
        )
        assert row is not None, "Foreign key on class_id is missing"

    def test_property_id_foreign_key_references_property(self, conn):
        row = conn.fetchone(
            """
            SELECT tc.constraint_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema    = kcu.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema    = 'objectified'
              AND tc.table_name      = 'class_property'
              AND kcu.column_name    = 'property_id'
            """
        )
        assert row is not None, "Foreign key on property_id is missing"

    def test_unique_constraint_on_class_id_and_name(self, conn):
        """The combination of (class_id, name) must be unique."""
        row = conn.fetchone(
            """
            SELECT tc.constraint_name
            FROM information_schema.table_constraints tc
            WHERE tc.constraint_type = 'UNIQUE'
              AND tc.table_schema    = 'objectified'
              AND tc.table_name      = 'class_property'
              AND tc.constraint_name = 'uq_class_property_class_name'
            """
        )
        assert row is not None, "Unique constraint uq_class_property_class_name is missing"

    def test_duplicate_class_id_and_name_raises_unique_violation(self, conn):
        """Two rows with the same class_id and name must be rejected."""
        class_id, property_id = _make_class_and_property(conn, "dup-name")
        conn.execute(
            """
            INSERT INTO objectified.class_property (class_id, property_id, name, description)
            VALUES (%s, %s, %s, %s)
            """,
            (class_id, property_id, "DupName", "First insertion"),
        )
        conn.execute("SAVEPOINT before_dup")
        with pytest.raises(psycopg2.errors.UniqueViolation):
            conn.execute(
                """
                INSERT INTO objectified.class_property (class_id, property_id, name, description)
                VALUES (%s, %s, %s, %s)
                """,
                (class_id, property_id, "DupName", "Second insertion – same name"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_dup")
        conn.execute("RELEASE SAVEPOINT before_dup")

    def test_same_name_different_class_is_allowed(self, conn):
        """The same property name may exist in different classes."""
        version_id_a = _insert_version(conn, "cp-diff-class-a-version", "1.0.0")
        version_id_b = _insert_version(conn, "cp-diff-class-b-version", "1.0.0")
        class_id_a = _insert_class(conn, version_id_a, "ClassA-DiffClass")
        class_id_b = _insert_class(conn, version_id_b, "ClassB-DiffClass")
        property_id = _insert_property(conn, "cp-shared-prop-project", "SharedProperty")

        conn.execute(
            """
            INSERT INTO objectified.class_property (class_id, property_id, name, description)
            VALUES (%s, %s, %s, %s)
            """,
            (class_id_a, property_id, "shared_name", "In class A"),
        )
        conn.execute(
            """
            INSERT INTO objectified.class_property (class_id, property_id, name, description)
            VALUES (%s, %s, %s, %s)
            """,
            (class_id_b, property_id, "shared_name", "In class B"),
        )
        rows = conn.fetchone(
            """
            SELECT COUNT(*) AS cnt
            FROM objectified.class_property
            WHERE name = 'shared_name'
            """
        )
        assert rows["cnt"] == 2

    def test_invalid_class_id_raises_foreign_key(self, conn):
        """Inserting with a non-existent class_id must raise ForeignKeyViolation."""
        _, property_id = _make_class_and_property(conn, "bad-class-fk")
        bogus_class_id = str(uuid.uuid4())
        conn.execute("SAVEPOINT before_bad_class")
        with pytest.raises(psycopg2.errors.ForeignKeyViolation):
            conn.execute(
                """
                INSERT INTO objectified.class_property (class_id, property_id, name, description)
                VALUES (%s, %s, %s, %s)
                """,
                (bogus_class_id, property_id, "BadClassProp", "Bad class id"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_bad_class")
        conn.execute("RELEASE SAVEPOINT before_bad_class")

    def test_invalid_property_id_raises_foreign_key(self, conn):
        """Inserting with a non-existent property_id must raise ForeignKeyViolation."""
        class_id, _ = _make_class_and_property(conn, "bad-prop-fk")
        bogus_property_id = str(uuid.uuid4())
        conn.execute("SAVEPOINT before_bad_property")
        with pytest.raises(psycopg2.errors.ForeignKeyViolation):
            conn.execute(
                """
                INSERT INTO objectified.class_property (class_id, property_id, name, description)
                VALUES (%s, %s, %s, %s)
                """,
                (class_id, bogus_property_id, "BadPropertyProp", "Bad property id"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_bad_property")
        conn.execute("RELEASE SAVEPOINT before_bad_property")


# ---------------------------------------------------------------------------
# Indices
# ---------------------------------------------------------------------------

class TestClassPropertyTableIndices:
    """Verify the required indices exist."""

    def _index_exists(self, conn, index_name: str) -> bool:
        row = conn.fetchone(
            """
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname = 'objectified'
              AND tablename  = 'class_property'
              AND indexname  = %s
            """,
            (index_name,),
        )
        return row is not None

    def test_index_on_class_id_exists(self, conn):
        assert self._index_exists(conn, "idx_class_property_class_id"), (
            "Index idx_class_property_class_id is missing"
        )

    def test_index_on_property_id_exists(self, conn):
        assert self._index_exists(conn, "idx_class_property_property_id"), (
            "Index idx_class_property_property_id is missing"
        )

    def test_index_on_name_exists(self, conn):
        assert self._index_exists(conn, "idx_class_property_name"), (
            "Index idx_class_property_name is missing"
        )


# ---------------------------------------------------------------------------
# Data integrity – insert / query / delete
# ---------------------------------------------------------------------------

class TestClassPropertyTableDataIntegrity:
    """Functional tests for CRUD behaviour. All data is rolled back after each test."""

    def test_insert_minimal_class_property(self, conn):
        """Insert a row with only required fields and verify defaults."""
        class_id, property_id = _make_class_and_property(conn, "minimal")
        conn.execute(
            """
            INSERT INTO objectified.class_property (class_id, property_id, name, description)
            VALUES (%s, %s, %s, %s)
            """,
            (class_id, property_id, "minimal_prop", "A minimal class property"),
        )
        row = conn.fetchone(
            """
            SELECT *
            FROM objectified.class_property
            WHERE class_id = %s AND name = %s
            """,
            (class_id, "minimal_prop"),
        )
        assert row is not None
        assert row["class_id"] == class_id
        assert row["property_id"] == property_id
        assert row["name"] == "minimal_prop"
        assert row["description"] == "A minimal class property"
        assert row["data"] == {}
        assert row["id"] is not None

    def test_default_data_is_empty_object(self, conn):
        """data must default to '{}'."""
        class_id, property_id = _make_class_and_property(conn, "default-data")
        conn.execute(
            """
            INSERT INTO objectified.class_property (class_id, property_id, name, description)
            VALUES (%s, %s, %s, %s)
            """,
            (class_id, property_id, "default_data_prop", "Default data test"),
        )
        row = conn.fetchone(
            "SELECT data FROM objectified.class_property WHERE class_id = %s AND name = %s",
            (class_id, "default_data_prop"),
        )
        assert row["data"] == {}

    def test_data_stores_json_schema(self, conn):
        """data column should accept and return a JSON Schema 2020-12 payload."""
        class_id, property_id = _make_class_and_property(conn, "json-schema")
        json_schema = {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "type": "integer",
            "minimum": 0,
        }
        conn.execute(
            """
            INSERT INTO objectified.class_property (class_id, property_id, name, description, data)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (class_id, property_id, "schema_prop", "JSON Schema test", json.dumps(json_schema)),
        )
        row = conn.fetchone(
            "SELECT data FROM objectified.class_property WHERE class_id = %s AND name = %s",
            (class_id, "schema_prop"),
        )
        assert row["data"]["$schema"] == "https://json-schema.org/draft/2020-12/schema"
        assert row["data"]["type"] == "integer"
        assert row["data"]["minimum"] == 0

    def test_name_missing_raises_not_null(self, conn):
        """Inserting without a name must raise NotNullViolation."""
        class_id, property_id = _make_class_and_property(conn, "noname")
        conn.execute("SAVEPOINT before_noname")
        with pytest.raises(psycopg2.errors.NotNullViolation):
            conn.execute(
                """
                INSERT INTO objectified.class_property (class_id, property_id, description)
                VALUES (%s, %s, %s)
                """,
                (class_id, property_id, "No name prop"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_noname")
        conn.execute("RELEASE SAVEPOINT before_noname")

    def test_description_missing_raises_not_null(self, conn):
        """Inserting without a description must raise NotNullViolation."""
        class_id, property_id = _make_class_and_property(conn, "nodesc")
        conn.execute("SAVEPOINT before_nodesc")
        with pytest.raises(psycopg2.errors.NotNullViolation):
            conn.execute(
                """
                INSERT INTO objectified.class_property (class_id, property_id, name)
                VALUES (%s, %s, %s)
                """,
                (class_id, property_id, "nodesc_prop"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_nodesc")
        conn.execute("RELEASE SAVEPOINT before_nodesc")

    def test_update_data_column(self, conn):
        """Updating the data column should reflect the new value."""
        class_id, property_id = _make_class_and_property(conn, "update-data")
        conn.execute(
            """
            INSERT INTO objectified.class_property (class_id, property_id, name, description)
            VALUES (%s, %s, %s, %s)
            """,
            (class_id, property_id, "update_prop", "Update data test"),
        )
        row = conn.fetchone(
            "SELECT id FROM objectified.class_property WHERE class_id = %s AND name = %s",
            (class_id, "update_prop"),
        )
        new_data = {"type": "string", "maxLength": 100}
        conn.execute(
            "UPDATE objectified.class_property SET data = %s WHERE id = %s",
            (json.dumps(new_data), row["id"]),
        )
        updated = conn.fetchone(
            "SELECT data FROM objectified.class_property WHERE id = %s",
            (row["id"],),
        )
        assert updated["data"]["type"] == "string"
        assert updated["data"]["maxLength"] == 100

    def test_delete_row(self, conn):
        """Deleting a class_property row should remove it from the table."""
        class_id, property_id = _make_class_and_property(conn, "delete-row")
        conn.execute(
            """
            INSERT INTO objectified.class_property (class_id, property_id, name, description)
            VALUES (%s, %s, %s, %s)
            """,
            (class_id, property_id, "del_prop", "Delete row test"),
        )
        row = conn.fetchone(
            "SELECT id FROM objectified.class_property WHERE class_id = %s AND name = %s",
            (class_id, "del_prop"),
        )
        conn.execute(
            "DELETE FROM objectified.class_property WHERE id = %s",
            (row["id"],),
        )
        result = conn.fetchone(
            "SELECT id FROM objectified.class_property WHERE id = %s",
            (row["id"],),
        )
        assert result is None, "Row should be gone after DELETE"

    def test_multiple_properties_on_same_class(self, conn):
        """A class can have multiple distinct properties."""
        version_id = _insert_version(conn, "cp-multi-prop-version", "1.0.0")
        class_id = _insert_class(conn, version_id, "MultiPropClass")
        property_id_a = _insert_property(conn, "cp-multi-prop-a-project", "PropA")
        property_id_b = _insert_property(conn, "cp-multi-prop-b-project", "PropB")

        conn.execute(
            """
            INSERT INTO objectified.class_property (class_id, property_id, name, description)
            VALUES (%s, %s, %s, %s)
            """,
            (class_id, property_id_a, "prop_a", "First property"),
        )
        conn.execute(
            """
            INSERT INTO objectified.class_property (class_id, property_id, name, description)
            VALUES (%s, %s, %s, %s)
            """,
            (class_id, property_id_b, "prop_b", "Second property"),
        )
        rows = conn.fetchone(
            "SELECT COUNT(*) AS cnt FROM objectified.class_property WHERE class_id = %s",
            (class_id,),
        )
        assert rows["cnt"] == 2

    def test_no_data_persists_after_rollback(self, conn):
        """Sanity check: row inserted within this test is visible within the same
        transaction but will be gone after the fixture rolls back."""
        class_id, property_id = _make_class_and_property(conn, "rollback")
        conn.execute(
            """
            INSERT INTO objectified.class_property (class_id, property_id, name, description)
            VALUES (%s, %s, %s, %s)
            """,
            (class_id, property_id, "rollback_prop", "Rollback test"),
        )
        row = conn.fetchone(
            "SELECT id FROM objectified.class_property WHERE class_id = %s AND name = %s",
            (class_id, "rollback_prop"),
        )
        assert row is not None, "Row should be visible within the same transaction"

