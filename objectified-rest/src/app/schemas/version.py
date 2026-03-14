"""Schemas for objectified.version table."""

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class VersionVisibility(str, Enum):
    """Enum for objectified.version_visibility."""

    PRIVATE = "private"
    PUBLIC = "public"


class VersionSchema(BaseModel):
    """Response schema for objectified.version."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    source_version_id: Optional[str] = None
    creator_id: str
    name: str
    description: str
    change_log: Optional[str] = None
    enabled: bool = True
    published: bool = False
    visibility: Optional[VersionVisibility] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
    published_at: Optional[datetime] = None


class VersionCreate(BaseModel):
    """Create payload for objectified.version."""

    project_id: Optional[str] = None
    creator_id: Optional[str] = None
    source_version_id: Optional[str] = None
    name: str
    description: str = ""
    change_log: Optional[str] = None
    enabled: bool = True
    published: bool = False
    visibility: Optional[VersionVisibility] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class VersionMetadataUpdate(BaseModel):
    """Metadata update payload for objectified.version."""

    description: Optional[str] = None
    change_log: Optional[str] = None


class VersionHistorySchema(BaseModel):
    """Response schema for objectified.version_history."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    version_id: str
    project_id: str
    changed_by: Optional[str] = None
    revision: int
    operation: str
    old_data: Optional[dict[str, Any]] = None
    new_data: Optional[dict[str, Any]] = None
    changed_at: datetime


class VersionPublishRequest(BaseModel):
    """Payload for publishing a version."""

    visibility: Optional[VersionVisibility] = VersionVisibility.PRIVATE


class VersionSnapshotCreate(BaseModel):
    """Create payload for committing a version snapshot."""

    label: Optional[str] = None
    description: Optional[str] = None


class VersionSnapshotSchema(BaseModel):
    """Response schema for objectified.version_snapshot."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    version_id: str
    project_id: str
    committed_by: Optional[str] = None
    revision: int
    label: Optional[str] = None
    description: Optional[str] = None
    snapshot: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class VersionSnapshotMetadataSchema(BaseModel):
    """Metadata-only response schema for objectified.version_snapshot (excludes snapshot payload)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    version_id: str
    project_id: str
    committed_by: Optional[str] = None
    revision: int
    label: Optional[str] = None
    description: Optional[str] = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Version Commit / Push / Pull / Merge schemas
# ---------------------------------------------------------------------------


class MergeStrategy(str, Enum):
    """Strategy for merging version states."""

    ADDITIVE = "additive"
    OVERRIDE = "override"


class VersionCommitClassProperty(BaseModel):
    """A class-property entry inside a version commit payload."""

    name: str
    description: Optional[str] = None
    data: dict[str, Any] = Field(default_factory=dict)
    property_name: Optional[str] = None
    property_data: Optional[dict[str, Any]] = None


class VersionCommitClass(BaseModel):
    """A class entry inside a version commit payload."""

    name: str
    description: Optional[str] = None
    schema_: Optional[dict[str, Any]] = Field(None, alias="schema")
    metadata: dict[str, Any] = Field(default_factory=dict)
    properties: list[VersionCommitClassProperty] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)


class VersionCommitPayload(BaseModel):
    """Request body for POST /versions/{id}/commit and POST /versions/{id}/push."""

    classes: list[VersionCommitClass] = Field(default_factory=list)
    canvas_metadata: Optional[dict[str, Any]] = None
    label: Optional[str] = None
    description: Optional[str] = None
    message: Optional[str] = None


class VersionCommitResponse(BaseModel):
    """Response from commit / push / merge operations."""

    model_config = ConfigDict(from_attributes=True)

    revision: int
    snapshot_id: str
    version_id: str
    committed_at: datetime


class VersionRollbackRequest(BaseModel):
    """Request body for POST /versions/{id}/rollback."""

    revision: int = Field(..., description="Snapshot revision to restore version state to.")


class VersionPullResponse(BaseModel):
    """Response from GET /versions/{id}/pull — full version state."""

    model_config = ConfigDict(from_attributes=True)

    version_id: str
    revision: Optional[int] = None
    classes: list[dict[str, Any]] = Field(default_factory=list)
    canvas_metadata: Optional[dict[str, Any]] = None
    pulled_at: datetime
    diff_since_revision: Optional[int] = Field(
        None,
        description="When since_revision query param was set, this echoes it.",
    )
    diff: Optional["VersionPullDiff"] = Field(
        None,
        description="Changes since diff_since_revision (only when since_revision was requested).",
    )


class VersionPullModifiedClass(BaseModel):
    """Describes property-level changes within a class since a revision."""

    class_name: str
    added_property_names: list[str] = Field(default_factory=list)
    removed_property_names: list[str] = Field(default_factory=list)
    modified_property_names: list[str] = Field(default_factory=list)


class VersionPullDiff(BaseModel):
    """Diff of version state since a given revision."""

    added_class_names: list[str] = Field(default_factory=list)
    removed_class_names: list[str] = Field(default_factory=list)
    modified_classes: list[VersionPullModifiedClass] = Field(default_factory=list)


class MergeConflict(BaseModel):
    """Describes a single merge conflict between local and remote state."""

    path: str = Field(
        "",
        description="Dot-separated path to the conflicting field (e.g. ClassName.property_name.field).",
    )
    description: str = Field(
        "",
        description="Human-readable description of the conflict.",
    )
    class_name: str = ""
    property_name: Optional[str] = None
    field: str = ""
    local_value: Optional[Any] = None
    remote_value: Optional[Any] = None
    resolution: str = Field(
        "",
        description="Suggested or applied resolution (e.g. 'took stricter (max): 1', 'ours', 'theirs').",
    )


class VersionMergeRequest(BaseModel):
    """Request body for POST /versions/{id}/merge and merge preview/resolve."""

    source_version_id: Optional[str] = Field(
        None,
        description=(
            "Source version UUID (theirs). Required when theirs_state is not provided; "
            "ignored (and not validated) when theirs_state is supplied."
        ),
    )
    strategy: MergeStrategy = MergeStrategy.ADDITIVE
    message: Optional[str] = None
    base_revision: Optional[int] = Field(
        None,
        description="Optional base snapshot revision of the current version for three-way merge.",
    )
    ours_state: Optional[dict[str, Any]] = Field(
        None,
        description="Optional 'ours' state (classes list). If omitted, server uses current version state.",
    )
    theirs_state: Optional[dict[str, Any]] = Field(
        None,
        description="Optional 'theirs' state (classes list). If omitted, server uses source_version_id state.",
    )

    @model_validator(mode="after")
    def _require_source_or_theirs(self) -> "VersionMergeRequest":
        if self.theirs_state is None and not self.source_version_id:
            raise ValueError("source_version_id is required when theirs_state is not provided")
        return self


class VersionMergeResponse(BaseModel):
    """Response from POST /versions/{id}/merge."""

    model_config = ConfigDict(from_attributes=True)

    revision: int
    snapshot_id: str
    version_id: str
    conflicts: list[MergeConflict] = Field(default_factory=list)
    merged_classes: list[str] = Field(default_factory=list)
    merged_state: Optional[dict[str, Any]] = Field(
        None,
        description="Full merged state (classes, canvas_metadata) when requested or returned by merge.",
    )
    committed_at: datetime


class VersionMergePreviewResponse(BaseModel):
    """Response from POST /versions/{id}/merge/preview — merged state and conflicts without persisting."""

    merged_state: dict[str, Any] = Field(
        default_factory=dict,
        description="Computed merged state (classes, canvas_metadata).",
    )
    conflicts: list[MergeConflict] = Field(default_factory=list)


class ConflictResolutionChoice(BaseModel):
    """A single conflict resolution: path and choice of ours, theirs, or custom value."""

    path: str = Field(..., description="Conflict path (matches MergeConflict.path).")
    use: str = Field(
        ...,
        description="Resolution: 'ours', 'theirs', or 'custom'.",
    )
    custom_value: Optional[Any] = Field(
        None,
        description="When use is 'custom', the value to apply.",
    )


class VersionMergeResolveRequest(BaseModel):
    """Request body for POST /versions/{id}/merge/resolve — merge request plus resolution choices."""

    source_version_id: Optional[str] = Field(
        None,
        description=(
            "Source version UUID (theirs). Required when theirs_state is not provided; "
            "ignored (and not validated) when theirs_state is supplied."
        ),
    )
    strategy: MergeStrategy = MergeStrategy.ADDITIVE
    message: Optional[str] = None
    base_revision: Optional[int] = None
    ours_state: Optional[dict[str, Any]] = None
    theirs_state: Optional[dict[str, Any]] = None
    conflict_resolutions: list[ConflictResolutionChoice] = Field(
        default_factory=list,
        description="Resolution for each conflict (path must match MergeConflict.path from preview).",
    )
    apply: bool = Field(
        False,
        description="If true, persist the merged state and create a snapshot.",
    )

    @model_validator(mode="after")
    def _require_source_or_theirs(self) -> "VersionMergeResolveRequest":
        if self.theirs_state is None and not self.source_version_id:
            raise ValueError("source_version_id is required when theirs_state is not provided")
        return self


class VersionMergeResolveResponse(BaseModel):
    """Response from POST /versions/{id}/merge/resolve."""

    merged_state: dict[str, Any] = Field(
        default_factory=dict,
        description="Merged state after applying resolution choices.",
    )
    revision: Optional[int] = Field(None, description="Set when apply=true.")
    snapshot_id: Optional[str] = None
    version_id: Optional[str] = None
    committed_at: Optional[datetime] = None


# Backward-compatible alias for older imports.
VersionUpdate = VersionMetadataUpdate
