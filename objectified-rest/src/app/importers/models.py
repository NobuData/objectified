"""Shared data models used by all importers.

These are lightweight dataclasses that represent the normalised intermediate
form produced by parsing an OpenAPI or JSON Schema document before it is
written to the database.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class ImportedProperty:
    """A single property extracted from a schema document.

    ``parent_path`` is the full dot-separated path of the parent property
    (e.g. ``"address"`` or ``"address.street"``).  ``None`` means top-level.
    Using the full path rather than just the name ensures uniqueness when the
    same property name appears in multiple nested branches.
    """

    name: str
    description: str
    data: dict[str, Any]
    parent_path: Optional[str] = None


@dataclass
class ImportedClass:
    """A single class (schema) extracted from a schema document."""

    name: str
    description: str
    schema: dict[str, Any]
    properties: list[ImportedProperty] = field(default_factory=list)

