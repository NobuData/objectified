"""Pytest configuration for objectified-rest. Run from repo root with PYTHONPATH=src."""

from contextlib import contextmanager
from unittest.mock import MagicMock, patch


@contextmanager
def mock_db_all():
    """Patch the ``db`` singleton in every route module simultaneously.

    Returns a single :class:`~unittest.mock.MagicMock` so tests can set
    ``execute_query`` / ``execute_mutation`` return values in one place,
    exactly as they previously did with ``patch("app.v1_routes.db")``.

    Usage::

        with mock_db_all() as mock_db:
            mock_db.execute_query.return_value = [...]
            r = client.get("/v1/...")
    """
    mock = MagicMock()
    with (
        patch("app.routes.users.db", mock),
        patch("app.routes.tenants.db", mock),
        patch("app.routes.helpers.db", mock),
        patch("app.routes.api_keys.db", mock),
        patch("app.routes.projects.db", mock),
        patch("app.routes.versions.db", mock),
        patch("app.routes.classes.db", mock),
        patch("app.database.db", mock),
    ):
        yield mock
