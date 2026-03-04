"""
conftest.py – shared pytest fixtures for objectified-schema SQL tests.

All database interaction is wrapped in a transaction that is rolled back after
each test, so no data ever persists to the database.

Connection settings are read from environment variables (or a .env file):
  POSTGRES_HOST     (default: localhost)
  POSTGRES_PORT     (default: 5432)
  POSTGRES_DB       (default: objectified)
  POSTGRES_USERNAME (default: postgres)
  POSTGRES_PASSWORD (default: "")
"""

import os
import pytest
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()


def _dsn() -> str:
    return (
        f"host={os.getenv('POSTGRES_HOST', 'localhost')} "
        f"port={os.getenv('POSTGRES_PORT', '5432')} "
        f"dbname={os.getenv('POSTGRES_DB', 'objectified')} "
        f"user={os.getenv('POSTGRES_USERNAME', 'postgres')} "
        f"password={os.getenv('POSTGRES_PASSWORD', '')}"
    )


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

