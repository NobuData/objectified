"""
conftest.py – shared pytest fixtures for objectified-schema SQL tests.

All database interaction is wrapped in a transaction that is rolled back after
each test, so no data ever persists to the database.

Tests use a dedicated test-only database (objectified_test by default). It does
not and cannot interfere with a running application database (e.g. objectified).
If that test database does not exist, the test session creates it and runs
sem-apply against it so the schema is applied before any test runs.

Connection settings are read from environment variables (or a .env file):
  POSTGRES_HOST       (default: localhost)
  POSTGRES_PORT       (default: 5432)
  POSTGRES_USERNAME   (default: postgres)
  POSTGRES_PASSWORD   (default: "")
  POSTGRES_TEST_DB    (default: objectified_test) – test-only DB name; never use your app DB here
"""

import os
import subprocess
from pathlib import Path
from typing import Optional
from urllib.parse import quote_plus

import pytest
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

# Dedicated test database name; must not be the same as a running application database
_TEST_DB = "objectified_test"


def _test_db_name() -> str:
    return os.getenv("POSTGRES_TEST_DB", _TEST_DB)


def _dsn(dbname: Optional[str] = None) -> str:
    name = dbname or _test_db_name()
    return (
        f"host={os.getenv('POSTGRES_HOST', 'localhost')} "
        f"port={os.getenv('POSTGRES_PORT', '5432')} "
        f"dbname={name} "
        f"user={os.getenv('POSTGRES_USERNAME', 'postgres')} "
        f"password={os.getenv('POSTGRES_PASSWORD', '')}"
    )


def _apply_scripts_directly(dbname: str) -> None:
    """Apply all SQL scripts from scripts/ directly via psycopg2 (fallback when sem-apply is absent)."""
    schema_root = Path(__file__).resolve().parent.parent
    scripts_dir = schema_root / "scripts"
    sql_files = sorted(scripts_dir.glob("*.sql"))
    if not sql_files:
        return
    conn = psycopg2.connect(_dsn(dbname))
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            for sql_file in sql_files:
                cur.execute(sql_file.read_text())
    finally:
        conn.close()


def _ensure_database_and_schema() -> None:
    """Create the test database if it does not exist and apply the schema."""
    dbname = _test_db_name()
    db_exists = True
    try:
        psycopg2.connect(_dsn()).close()
    except psycopg2.OperationalError as e:
        if "does not exist" not in str(e):
            raise
        db_exists = False

    if not db_exists:
        # Connect to 'postgres' to create the test database
        bootstrap = psycopg2.connect(_dsn("postgres"))
        bootstrap.autocommit = True
        try:
            with bootstrap.cursor() as cur:
                cur.execute(f'CREATE DATABASE "{dbname}"')
        finally:
            bootstrap.close()

    # Apply or update the schema for the test database on every test session.
    schema_root = Path(__file__).resolve().parent.parent
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_PORT", "5432")
    user = os.getenv("POSTGRES_USERNAME", "postgres")
    password = os.getenv("POSTGRES_PASSWORD", "")

    # Try sem-apply first; fall back to direct SQL execution
    sem_apply_check = subprocess.run(["which", "sem-apply"], capture_output=True, text=True)

    if sem_apply_check.returncode == 0:
        if password:
            url = f"postgresql://{quote_plus(user)}:{quote_plus(password)}@{host}:{port}/{dbname}"
        else:
            url = f"postgresql://{quote_plus(user)}@{host}:{port}/{dbname}"

        result = subprocess.run(
            ["sem-apply", "--url", url],
            cwd=str(schema_root),
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            raise RuntimeError(
                f"sem-apply failed for test database {dbname!r}: {result.stderr or result.stdout}"
            )
    else:
        _apply_scripts_directly(dbname)

class _DB:
    """Thin wrapper around a psycopg2 connection exposing execute/fetchone/fetchall helpers."""

    def __init__(self, connection):
        self._conn = connection

    def execute(self, sql: str, params=None):
        with self._conn.cursor() as cur:
            cur.execute(sql, params)

    def fetchall(self, sql: str, params=None):
        with self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return cur.fetchall()

    def fetchone(self, sql: str, params=None):
        with self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return cur.fetchone()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()


@pytest.fixture(scope="session", autouse=True)
def _ensure_db():
    """Create the test database and apply schema if the database does not exist."""
    _ensure_database_and_schema()


@pytest.fixture()
def conn():
    """
    Function-scoped connection with autocommit OFF.

    A SAVEPOINT named 'test_start' is created before the test body runs.
    Teardown always issues ROLLBACK TO SAVEPOINT test_start followed by
    RELEASE SAVEPOINT, then closes the connection – guaranteeing that every
    INSERT/UPDATE/DELETE performed during the test is discarded.
    """
    connection = psycopg2.connect(_dsn())
    connection.autocommit = False

    db = _DB(connection)
    db.execute("SET search_path TO objectified, public")
    db.execute("SAVEPOINT test_start")

    yield db

    # Always roll back, even if the test raised an exception.
    try:
        db.execute("ROLLBACK TO SAVEPOINT test_start")
        db.execute("RELEASE SAVEPOINT test_start")
    except Exception:
        connection.rollback()
    finally:
        connection.close()

