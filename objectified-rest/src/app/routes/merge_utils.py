"""Merge utilities for version commit operations.

Provides helpers that merge two version states (local and remote) using either
an ``additive`` or ``override`` strategy, tracking conflicts when both sides
modified the same field. Supports three-way merge when a base revision is given.
"""

from __future__ import annotations

from typing import Any, Optional


def _lower(value: Optional[str]) -> str:
    """Lowercase helper that handles None gracefully."""
    return (value or "").strip().lower()


def _conflict_entry(
    field: str,
    local_value: Any,
    remote_value: Any,
    resolution: str,
) -> dict[str, Any]:
    """Build a conflict dict with path and description."""
    local_str = str(local_value)
    remote_str = str(remote_value)
    description = (
        f"Conflict at {field}: ours={local_str}, theirs={remote_str}. "
        f"Suggested resolution: {resolution}."
    )
    return {
        "field": field,
        "path": field,
        "description": description,
        "local_value": local_value,
        "remote_value": remote_value,
        "resolution": resolution,
    }


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
                res = f"took stricter (max): {merged[key]}"
                conflicts.append(_conflict_entry(key, local_val, remote_val, res))
            else:
                merged[key] = remote_val
        elif key in ("maxLength", "maximum"):
            if isinstance(local_val, (int, float)) and isinstance(remote_val, (int, float)):
                merged[key] = min(local_val, remote_val)
                res = f"took stricter (min): {merged[key]}"
                conflicts.append(_conflict_entry(key, local_val, remote_val, res))
            else:
                merged[key] = remote_val
        elif key == "enum":
            local_set = set(local_val) if isinstance(local_val, list) else set()
            remote_set = set(remote_val) if isinstance(remote_val, list) else set()
            merged[key] = sorted(local_set | remote_set, key=str)
            if local_set != remote_set:
                conflicts.append(_conflict_entry(
                    key, sorted(local_set, key=str), sorted(remote_set, key=str),
                    f"union: {merged[key]}",
                ))
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
                c["path"] = c["field"]
                c["description"] = (
                    f"Conflict at {c['field']}: ours={c.get('local_value')}, "
                    f"theirs={c.get('remote_value')}. Suggested resolution: {c.get('resolution', '')}."
                )
            conflicts.extend(nested_conflicts)
        else:
            # Default: remote wins.
            merged[key] = remote_val
            conflicts.append(_conflict_entry(key, local_val, remote_val, "remote wins"))

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
                c["path"] = c["field"]
                c["description"] = (
                    f"Conflict at {c['field']}: ours={c.get('local_value')}, "
                    f"theirs={c.get('remote_value')}. Suggested resolution: {c.get('resolution', '')}."
                )
            conflicts.extend(prop_conflicts)
        elif local_props[prop_name] != remote_schema:
            merged[prop_name] = remote_schema
            conflicts.append(_conflict_entry(
                f"properties.{prop_name}",
                local_props[prop_name],
                remote_schema,
                "remote wins",
            ))

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
                    prop_display = local_p.get("name", name_key)
                    for c in data_conflicts:
                        c["field"] = f"{prop_display}.{c['field']}"
                        c["path"] = c["field"]
                        c["description"] = (
                            f"Property {prop_display}, field {c.get('field', '').split('.')[-1]}: "
                            f"ours={c.get('local_value')}, theirs={c.get('remote_value')}. "
                            f"Suggested resolution: {c.get('resolution', '')}."
                        )
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
                    class_display = local_c.get("name", name_key)
                    conflicts.append(_conflict_entry(
                        f"{class_display}.description",
                        local_c.get("description", ""),
                        remote_c.get("description", ""),
                        "remote wins",
                    ))
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


# ---------------------------------------------------------------------------
# Three-way merge (base / ours / theirs)
# ---------------------------------------------------------------------------


def merge_classes_three_way(
    base_classes: list[dict[str, Any]],
    ours_classes: list[dict[str, Any]],
    theirs_classes: list[dict[str, Any]],
    strategy: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Three-way merge: base, ours, theirs. When only one side changed from base, take that; else two-way merge.

    Returns (merged_classes, conflicts) with conflict dicts including path and description.
    """
    base_by: dict[str, dict[str, Any]] = {}
    for c in base_classes:
        base_by[_lower(c.get("name"))] = c
    ours_by: dict[str, dict[str, Any]] = {}
    for c in ours_classes:
        ours_by[_lower(c.get("name"))] = c
    theirs_by: dict[str, dict[str, Any]] = {}
    for c in theirs_classes:
        theirs_by[_lower(c.get("name"))] = c

    all_names = set(base_by.keys()) | set(ours_by.keys()) | set(theirs_by.keys())
    merged: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []

    for name_key in sorted(all_names):
        base_c = base_by.get(name_key)
        ours_c = ours_by.get(name_key)
        theirs_c = theirs_by.get(name_key)

        if ours_c is not None and theirs_c is not None:
            if base_c is not None:
                ours_same_as_base = _class_snapshot_equals(base_c, ours_c)
                theirs_same_as_base = _class_snapshot_equals(base_c, theirs_c)
                if ours_same_as_base and not theirs_same_as_base:
                    merged.append(theirs_c)
                elif not ours_same_as_base and theirs_same_as_base:
                    merged.append(ours_c)
                elif ours_same_as_base and theirs_same_as_base:
                    merged.append(ours_c)
                else:
                    m, c = merge_classes([ours_c], [theirs_c], strategy)
                    merged.extend(m)
                    conflicts.extend(c)
            else:
                m, c = merge_classes([ours_c], [theirs_c], strategy)
                merged.extend(m)
                conflicts.extend(c)
        elif ours_c is not None:
            merged.append(ours_c)
        elif theirs_c is not None:
            merged.append(theirs_c)

    return merged, conflicts


def _class_snapshot_equals(a: dict[str, Any], b: dict[str, Any]) -> bool:
    """Compare class content for equality (ignore id, created_at, etc.)."""
    if _lower(a.get("name")) != _lower(b.get("name")):
        return False
    if (a.get("description") or "") != (b.get("description") or ""):
        return False
    a_props = a.get("properties") or []
    b_props = b.get("properties") or []
    if len(a_props) != len(b_props):
        return False
    a_by_name = {_lower(p.get("name")): p for p in a_props}
    b_by_name = {_lower(p.get("name")): p for p in b_props}
    if set(a_by_name.keys()) != set(b_by_name.keys()):
        return False
    for k in a_by_name:
        if not _prop_snapshot_equals(a_by_name[k], b_by_name[k]):
            return False
    return True


def _prop_snapshot_equals(a: dict[str, Any], b: dict[str, Any]) -> bool:
    """Compare property content for equality."""
    if (a.get("data") or {}) != (b.get("data") or {}):
        return False
    if (a.get("description") or "") != (b.get("description") or ""):
        return False
    return True

