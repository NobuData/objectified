"""Pydantic schemas representing objectified database tables.

These map to objectified.account, objectified.tenant, objectified.tenant_account,
objectified.project, objectified.version, objectified.property, objectified.class,
objectified.class_property. Used for OpenAPI documentation and future CRUD services.
"""

from app.schemas.account import AccountCreate, AccountSchema, AccountUpdate, ProfileUpdate
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
from app.schemas.project import ProjectCreate, ProjectHistorySchema, ProjectSchema, ProjectUpdate
from app.schemas.property import PropertyCreate, PropertySchema, PropertyUpdate
from app.schemas.tenant import TenantCreate, TenantSchema, TenantUpdate
from app.schemas.tenant_account import (
    TenantAccessLevel,
    TenantAccountCreate,
    TenantAccountSchema,
    TenantAccountUpdate,
    TenantAdministratorCreate,
)
from app.schemas.sso import (
    SsoProviderCreate,
    SsoProviderSchema,
    SsoProviderType,
    SsoProviderUpdate,
)
from app.schemas.version import (
    VersionCreate,
    VersionCreateFromRevision,
    VersionHistorySchema,
    VersionMetadataUpdate,
    VersionSchema,
    VersionUpdate,
    VersionVisibility,
)
from app.schemas.rbac import (
    AccountRoleAssignmentCreate,
    EffectivePermissionsResponse,
    PermissionSchema,
    RoleCreate,
    RolePermissionsUpdate,
    RoleSchema,
    RoleUpdate,
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
    "ProfileUpdate",
    "ProjectCreate",
    "ProjectHistorySchema",
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
    "SsoProviderCreate",
    "SsoProviderSchema",
    "SsoProviderType",
    "SsoProviderUpdate",
    "VersionCreate",
    "VersionCreateFromRevision",
    "VersionHistorySchema",
    "VersionMetadataUpdate",
    "VersionSchema",
    "VersionUpdate",
    "VersionVisibility",
    "PermissionSchema",
    "RoleSchema",
    "RoleCreate",
    "RoleUpdate",
    "RolePermissionsUpdate",
    "AccountRoleAssignmentCreate",
    "EffectivePermissionsResponse",
]
