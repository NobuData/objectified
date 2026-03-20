"""Tests for tenant project/version quotas (GH-132)."""

from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.quotas import ensure_project_quota_allows_create, ensure_version_quota_allows_create


def test_project_quota_unlimited_when_null_max():
    with patch(
        "app.quotas.db.execute_query",
        return_value=[{"max_projects": None}],
    ):
        ensure_project_quota_allows_create("tid")


def test_project_quota_allows_under_cap():
    with patch(
        "app.quotas.db.execute_query",
        side_effect=[
            [{"max_projects": 5}],
            [{"c": 2}],
        ],
    ):
        ensure_project_quota_allows_create("tid")


def test_project_quota_blocks_at_cap():
    with patch(
        "app.quotas.db.execute_query",
        side_effect=[
            [{"max_projects": 1}],
            [{"c": 1}],
        ],
    ):
        with pytest.raises(HTTPException) as exc:
            ensure_project_quota_allows_create("tid")
        assert exc.value.status_code == 403
        assert "maximum number of projects" in exc.value.detail.lower()


def test_version_quota_blocks_at_cap():
    with patch(
        "app.quotas.db.execute_query",
        side_effect=[
            [{"max_versions_per_project": 2}],
            [{"c": 2}],
        ],
    ):
        with pytest.raises(HTTPException) as exc:
            ensure_version_quota_allows_create("tid", "pid")
        assert exc.value.status_code == 403
        assert "maximum number of versions" in exc.value.detail.lower()
