"""Merge utilities for version commit operations.

Provides helpers that merge two version states (local and remote) using either
an ``additive`` or ``override`` strategy, tracking conflicts when both sides
modified the same field.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


def _lower(value: Optional[str]) -> str:
    """Lowercase helper that handles None gracefully."""
    return (value or "").strip().lower()


# ---------------------------------------------------------------------------
# Constraint / data-level merge
# ---------------------------------------------------------------------------


def merge_constraints(
    local_data: dict[str, Any],
    remote_data: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, str]]]:
    """Merge two property data/constraint dicts.

    Uses *stricter-wins* semantics:
    - ``minLength`` / ``minimum``: take the larger value.
    - ``maxLength`` / ``maximum``: take the smaller value.
    - ``enum``: union of both sets.
    - ``type``: remote wins on conflict.
    - Nested ``properties`` and ``items`` are recursively merged.
    - Other keys: remote wins on conflict.

    Returns:
        A tuple of ``(merged_data, conflict_entries)`` where each conflict is a
        dict with ``field``, ``local_value``, ``remote_value``, ``resolution``.
    """
    merged: dict[str, Any] = {**local_data}
    conflicts: list[dict[str, str]] = []

    all_keys = set(local_data.keys()) | set(remote_data.keys())

    for key in all_keys:
        local_val = local_data.get(key)
        remote_val = remote_data.get(key)

        if key not in remote_data:
            # Local-only key — keep it.
            continue

        if key not in local_data:
            # Remote-only key — take it.
            merged[key] = remote_val
            continue

        if local_val == remote_val:
            continue

        # Both sides present with different values — resolve by type.
        if key in ("minLength", "minimum"):
            if isinstance(local_val, (int, float)) and isinstance(remote_val, (int, float)):
                merged[key] = max(local_val, remote_val)
                conflicts.append({
                    "field": key,
                    "local_value": str(local_val),
                    "remote_value": str(remote_val),
                    "resolution": f"took stricter (max): {merged[key]}",
                })
            else:
                merged[key] = remote_val
        elif key in ("maxLength", "maximum"):
            if isinstance(local_val, (int, float)) and isinstance(remote_val, (int, float)):
                merged[key] = min(local_val, remote_val)
                conflicts.append({
                    "field": key,
                    "local_value": str(local_val),
                    "remote_value": str(remote_val),
                    "resolution": f"took stricter (min): {merged[key]}",
                })
            else:
                merged[key] = remote_val
        elif key == "enum":
            local_set = set(local_val) if isinstance(local_val, list) else set()
            remote_set = set(remote_val) if isinstance(remote_val, list) else set()
            merged[key] = sorted(local_set | remote_set, key=str)
            if local_set != remote_set:
                conflicts.append({
                    "field": key,
                    "local_value": str(sorted(local_set, key=str)),
                    "remote_value": str(sorted(remote_set, key=str)),
                    "resolution": f"union: {merged[key]}",
                })
        elif key == "properties" and isinstance(local_val, dict) and isinstance(remote_val, dict):
            # Recursive merge of nested object properties.
            nested_merged, nested_conflicts = _merge_nested_properties(local_val, remote_val)
            merged[key] = nested_merged
            conflicts.extend(nested_conflicts)
        elif key == "items" and isinstance(local_val, dict) and isinstance(remote_val, dict):
            nested_merged, nested_conflicts = merge_constraints(local_val, remote_val)
            merged[key] = nested_merged
            for c in nested_conflicts:
                c["field"] = f"items.{c['field']}"
            conflicts.extend(nested_conflicts)
        else:
            # Default: remote wins.
            merged[key] = remote_val
            conflicts.append({
                "field": key,
                "local_value": str(local_val),
                "remote_value": str(remote_val),
                "resolution": "remote wins",
            })

    return merged, conflicts


def _merge_nested_properties(
    local_props: dict[str, Any],
    remote_props: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, str]]]:
    """Merge nested ``properties`` dicts (object-type JSON Schema)."""
    merged: dict[str, Any] = {**local_props}
    conflicts: list[dict[str, str]] = []

    for prop_name, remote_schema in remote_props.items():
        if prop_name not in local_props:
            merged[prop_name] = remote_schema
        elif isinstance(local_props[prop_name], dict) and isinstance(remote_schema, dict):
            prop_merged, prop_conflicts = merge_constraints(local_props[prop_name], remote_schema)
            merged[prop_name] = prop_merged
            for c in prop_conflicts:
                c["field"] = f"properties.{prop_name}.{c['field']}"
            conflicts.extend(prop_conflicts)
        elif local_props[prop_name] != remote_schema:
            merged[prop_name] = remote_schema
            conflicts.append({
                "field": f"properties.{prop_name}",
                "local_value": str(local_props[prop_name]),
                "remote_value": str(remote_schema),
                "resolution": "remote wins",
            })

    return merged, conflicts


# ---------------------------------------------------------------------------
# Property-list merge
# ---------------------------------------------------------------------------


def merge_property_lists(
    local_props: list[dict[str, Any]],
    remote_props: list[dict[str, Any]],
    strategy: str,
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    """Merge two lists of class-property dicts.

    Matching is by ``name`` (case-insensitive).

    - **additive**: keep local properties, add remote-only ones.
    - **override**: remote wins for metadata; merge constraints with
      stricter-wins semantics.

    Returns ``(merged_list, conflicts)``.
    """
    local_by_name: dict[str, dict[str, Any]] = {}
    for p in local_props:
        local_by_name[_lower(p.get("name"))] = p

    remote_by_name: dict[str, dict[str, Any]] = {}
    for p in remote_props:
        remote_by_name[_lower(p.get("name"))] = p

    merged: list[dict[str, Any]] = []
    conflicts: list[dict[str, str]] = []

    # Process locals first.
    for name_key, local_p in local_by_name.items():
        if name_key in remote_by_name:
            remote_p = remote_by_name[name_key]
            if strategy == "additive":
                # Keep local as-is.
                merged.append(local_p)
            else:
                # Override: merge data constraints.
                merged_prop = {**local_p}
                local_data = local_p.get("data") or {}
                remote_data = remote_p.get("data") or {}
                if local_data != remote_data:
                    merged_data, data_conflicts = merge_constraints(local_data, remote_data)
                    merged_prop["data"] = merged_data
                    for c in data_conflicts:
                        c["field"] = f"{local_p.get('name', name_key)}.{c['field']}"
                    conflicts.extend(data_conflicts)
                # Remote wins for description when different.
                if remote_p.get("description") and remote_p["description"] != local_p.get("description"):
                    merged_prop["description"] = remote_p["description"]
                merged.append(merged_prop)
        else:
            merged.append(local_p)

    # Add remote-only properties.
    for name_key, remote_p in remote_by_name.items():
        if name_key not in local_by_name:
            merged.append(remote_p)

    return merged, conflicts


# ---------------------------------------------------------------------------
# Class-level merge
# ---------------------------------------------------------------------------


def merge_classes(
    local_classes: list[dict[str, Any]],
    remote_classes: list[dict[str, Any]],
    strategy: str,
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    """Merge two lists of class dicts (each containing a ``properties`` list).

    Matching is by ``name`` (case-insensitive).

    - **additive**: keep local classes, add remote-only classes.
    - **override**: remote wins for class-level metadata; properties are merged
      using :func:`merge_property_lists`.

    Returns ``(merged_classes, all_conflicts)``.
    """
    local_by_name: dict[str, dict[str, Any]] = {}
    for c in local_classes:
        local_by_name[_lower(c.get("name"))] = c

    remote_by_name: dict[str, dict[str, Any]] = {}
    for c in remote_classes:
        remote_by_name[_lower(c.get("name"))] = c

    merged: list[dict[str, Any]] = []
    conflicts: list[dict[str, str]] = []

    for name_key, local_c in local_by_name.items():
        if name_key in remote_by_name:
            remote_c = remote_by_name[name_key]
            if strategy == "additive":
                # Keep local; only add remote-only properties.
                local_props = local_c.get("properties") or []
                remote_props = remote_c.get("properties") or []
                merged_props, prop_conflicts = merge_property_lists(
                    local_props, remote_props, strategy
                )
                merged_class = {**local_c, "properties": merged_props}
                merged.append(merged_class)
                conflicts.extend(prop_conflicts)
            else:
                # Override: remote wins metadata, merge properties.
                merged_class = {**local_c}
                if remote_c.get("description") and remote_c["description"] != local_c.get("description"):
                    conflicts.append({
                        "field": f"{local_c.get('name', name_key)}.description",
                        "local_value": str(local_c.get("description", "")),
                        "remote_value": str(remote_c.get("description", "")),
                        "resolution": "remote wins",
                    })
                    merged_class["description"] = remote_c["description"]
                if remote_c.get("schema") is not None:
                    merged_class["schema"] = remote_c["schema"]
                if remote_c.get("metadata"):
                    merged_class["metadata"] = {
                        **(local_c.get("metadata") or {}),
                        **(remote_c.get("metadata") or {}),
                    }
                local_props = local_c.get("properties") or []
                remote_props = remote_c.get("properties") or []
                merged_props, prop_conflicts = merge_property_lists(
                    local_props, remote_props, strategy
                )
                merged_class["properties"] = merged_props
                merged.append(merged_class)
                conflicts.extend(prop_conflicts)
        else:
            merged.append(local_c)

    # Add remote-only classes.
    for name_key, remote_c in remote_by_name.items():
        if name_key not in local_by_name:
            merged.append(remote_c)

    return merged, conflicts

