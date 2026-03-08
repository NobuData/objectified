"""Pydantic schemas representing objectified database tables.

These map to objectified.account, objectified.tenant, objectified.tenant_account,
objectified.project, objectified.version, objectified.property, objectified.class,
objectified.class_property. Used for OpenAPI documentation and future CRUD services.
"""

from app.schemas.account import AccountCreate, AccountSchema, AccountUpdate
from app.schemas.auth import (
    ApiKeyCreate,
    ApiKeyCreateResponse,
    ApiKeySchema,
    LoginRequest,
    LoginResponse,
)
from app.schemas.class_model import ClassCreate, ClassSchema, ClassUpdate
from app.schemas.class_property import (
    ClassPropertyCreate,
    ClassPropertySchema,
    ClassPropertyUpdate,
)
from app.schemas.project import ProjectCreate, ProjectSchema, ProjectUpdate
from app.schemas.property import PropertyCreate, PropertySchema, PropertyUpdate
from app.schemas.tenant import TenantCreate, TenantSchema, TenantUpdate
from app.schemas.tenant_account import (
    TenantAccessLevel,
    TenantAccountCreate,
    TenantAccountSchema,
    TenantAccountUpdate,
    TenantAdministratorCreate,
)
from app.schemas.version import (
    VersionCreate,
    VersionSchema,
    VersionUpdate,
    VersionVisibility,
)

__all__ = [
    "AccountCreate",
    "AccountSchema",
    "AccountUpdate",
    "ApiKeyCreate",
    "ApiKeyCreateResponse",
    "ApiKeySchema",
    "LoginRequest",
    "LoginResponse",
    "ClassCreate",
    "ClassSchema",
    "ClassUpdate",
    "ClassPropertyCreate",
    "ClassPropertySchema",
    "ClassPropertyUpdate",
    "ProjectCreate",
    "ProjectSchema",
    "ProjectUpdate",
    "PropertyCreate",
    "PropertySchema",
    "PropertyUpdate",
    "TenantAccessLevel",
    "TenantAccountCreate",
    "TenantAccountSchema",
    "TenantAccountUpdate",
    "TenantAdministratorCreate",
    "TenantCreate",
    "TenantSchema",
    "TenantUpdate",
    "VersionCreate",
    "VersionSchema",
    "VersionUpdate",
    "VersionVisibility",
]
