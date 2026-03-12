/**
 * REST API client for objectified-rest services.
 *
 * Wraps fetch for tenants, projects, versions (CRUD + publish/unpublish),
 * classes, properties, class-properties (CRUD + list/bulk), and
 * commit/push/pull/merge. Auth: JWT (Authorization: Bearer) or X-API-Key
 * per objectified-rest contract.
 */

const REST_BASE =
  typeof process !== 'undefined'
    ? process.env.NEXT_PUBLIC_REST_API_BASE_URL ?? ''
    : '';

/** Base URL for REST: when in browser, use Next.js API proxy (session auth); else direct REST base. */
function getRequestBase(): string {
  if (typeof window !== 'undefined') {
    return '/api/rest';
  }
  return REST_BASE;
}

export function getRestBaseUrl(): string {
  return getRequestBase();
}

/** Build RestClientOptions from NextAuth session (JWT) or env API key for server/client use. */
export function getRestClientOptions(session: { accessToken?: string } | null): RestClientOptions {
  const opts: RestClientOptions = {};
  if (session?.accessToken) {
    opts.jwt = session.accessToken;
  }
  if (typeof process !== 'undefined' && process.env.REST_API_KEY) {
    opts.apiKey = process.env.REST_API_KEY;
  }
  return opts;
}

export interface RestClientOptions {
  jwt?: string;
  apiKey?: string;
}

function buildAuthHeaders(options: RestClientOptions): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.jwt) {
    headers['Authorization'] = `Bearer ${options.jwt}`;
  }
  if (options.apiKey) {
    headers['X-API-Key'] = options.apiKey;
  }
  return headers;
}

export interface ApiError {
  detail?: string | { loc: string[]; msg: string; type: string }[];
}

/** Thrown when the REST API returns a non-2xx response. Includes status and detail for permission handling. */
export class RestApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly detail?: ApiError['detail']
  ) {
    super(message);
    this.name = 'RestApiError';
    Object.setPrototypeOf(this, RestApiError.prototype);
  }
}

export function isRestApiError(e: unknown): e is RestApiError {
  return e instanceof RestApiError;
}

export function isForbiddenError(e: unknown): e is RestApiError {
  return isRestApiError(e) && e.statusCode === 403;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RestClientOptions = {}
): Promise<T> {
  const url = path.startsWith('http') ? path : `${getRequestBase()}${path}`;
  const headers = buildAuthHeaders(options);
  const isRelative = url.startsWith('/');
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...(isRelative ? { credentials: 'include' as RequestCredentials } : {}),
  });
  const text = await res.text();
  let parsed: T | ApiError | null = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as T | ApiError;
    } catch {
      // non-JSON response
    }
  }
  if (!res.ok) {
    const err = parsed as ApiError | null;
    const detail = err?.detail;
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg).join('; ')
          : `HTTP ${res.status}`;
    throw new RestApiError(message || `HTTP ${res.status}`, res.status, detail);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (parsed as T) ?? (undefined as T);
}

// ---------------------------------------------------------------------------
// Types (aligned with objectified-rest OpenAPI schemas)
// ---------------------------------------------------------------------------

export interface TenantSchema {
  id: string;
  name: string;
  description: string;
  slug: string;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
  deleted_at?: string | null;
}

export interface TenantCreate {
  name: string;
  slug: string;
  description?: string;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface TenantUpdate {
  name?: string | null;
  description?: string | null;
  slug?: string | null;
  enabled?: boolean | null;
  metadata?: Record<string, unknown> | null;
}

export interface ProjectSchema {
  id: string;
  tenant_id: string;
  creator_id?: string;
  name: string;
  description?: string;
  slug: string;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
  deleted_at?: string | null;
}

export interface ProjectCreate {
  name: string;
  slug: string;
  tenant_id?: string | null;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface ProjectUpdate {
  name?: string | null;
  description?: string | null;
  slug?: string | null;
  enabled?: boolean | null;
  metadata?: Record<string, unknown> | null;
}

export interface VersionSchema {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  change_log?: string;
  published?: boolean;
  published_at?: string | null;
  visibility?: string | null;
  enabled?: boolean;
  created_at: string;
  updated_at: string | null;
  deleted_at?: string | null;
}

export interface VersionCreate {
  name: string;
  description?: string;
  change_log?: string;
  source_version_id?: string | null;
}

export interface VersionMetadataUpdate {
  description?: string | null;
  change_log?: string | null;
}

export interface VersionPublishRequest {
  visibility?: 'private' | 'public';
}

export interface ClassSchema {
  id: string;
  version_id: string;
  name: string;
  description: string;
  schema?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  enabled?: boolean;
  created_at: string;
  updated_at: string | null;
  deleted_at?: string | null;
}

export interface ClassWithPropertiesAndTags extends ClassSchema {
  properties?: ClassPropertySchema[];
  tags?: string[];
}

export interface ClassCreate {
  name: string;
  description?: string;
  schema?: Record<string, unknown>;
  enabled?: boolean;
}

export interface ClassUpdate {
  name?: string | null;
  description?: string | null;
  schema?: Record<string, unknown> | null;
}

export interface PropertySchema {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  data?: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
  deleted_at?: string | null;
}

export interface PropertyCreate {
  name: string;
  description?: string;
  data?: Record<string, unknown>;
}

export interface PropertyUpdate {
  name?: string | null;
  description?: string | null;
  data?: Record<string, unknown> | null;
}

export interface ClassPropertySchema {
  id: string;
  class_id: string;
  property_id: string;
  parent_id: string | null;
  name: string;
  description: string;
  data?: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
}

export interface ClassPropertyCreate {
  property_id: string;
  name: string;
  parent_id?: string | null;
  description?: string;
  data?: Record<string, unknown>;
}

export interface ClassPropertyUpdate {
  name?: string | null;
  description?: string | null;
  data?: Record<string, unknown> | null;
  parent_id?: string | null;
}

export interface VersionCommitClassProperty {
  name: string;
  description?: string | null;
  data?: Record<string, unknown>;
  property_name?: string | null;
  property_data?: Record<string, unknown> | null;
}

export interface VersionCommitClass {
  name: string;
  description?: string | null;
  schema?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  properties?: VersionCommitClassProperty[];
}

export interface VersionCommitPayload {
  classes?: VersionCommitClass[];
  canvas_metadata?: Record<string, unknown> | null;
  label?: string | null;
  description?: string | null;
  message?: string | null;
}

export interface VersionCommitResponse {
  revision: number;
  snapshot_id: string;
  version_id: string;
  committed_at: string;
}

export interface VersionPullModifiedClass {
  class_name: string;
  added_property_names?: string[];
  removed_property_names?: string[];
  modified_property_names?: string[];
}

export interface VersionPullDiff {
  added_class_names?: string[];
  removed_class_names?: string[];
  modified_classes?: VersionPullModifiedClass[];
}

export interface VersionPullResponse {
  version_id: string;
  revision?: number | null;
  classes?: Record<string, unknown>[];
  canvas_metadata?: Record<string, unknown> | null;
  pulled_at: string;
  diff_since_revision?: number | null;
  diff?: VersionPullDiff | null;
}

export interface VersionMergeRequest {
  source_version_id?: string | null;
  strategy?: 'additive' | 'override';
  message?: string | null;
  ours_state?: Record<string, unknown> | null;
  theirs_state?: Record<string, unknown> | null;
  base_revision?: number | null;
}

export interface VersionMergeResponse {
  revision: number;
  snapshot_id: string;
  version_id: string;
  conflicts?: MergeConflict[];
  merged_classes?: string[];
  merged_state?: Record<string, unknown> | null;
  committed_at: string;
}

export interface MergeConflict {
  path: string;
  description?: string;
  class_name?: string;
  property_name?: string | null;
  field?: string;
  local_value?: unknown;
  remote_value?: unknown;
  resolution?: string;
}

export interface MergePreviewResponse {
  merged_state: Record<string, unknown>;
  conflicts: MergeConflict[];
}

export interface ConflictResolutionChoice {
  path: string;
  use: 'ours' | 'theirs' | 'custom';
  custom_value?: unknown;
}

export interface MergeResolveRequest {
  source_version_id?: string | null;
  strategy?: 'additive' | 'override';
  message?: string | null;
  conflict_resolutions?: ConflictResolutionChoice[];
  apply?: boolean;
  ours_state?: Record<string, unknown> | null;
  theirs_state?: Record<string, unknown> | null;
  base_revision?: number | null;
}

export interface MergeResolveResponse {
  merged_state: Record<string, unknown>;
  revision?: number | null;
  snapshot_id?: string | null;
  version_id?: string | null;
  committed_at?: string | null;
}

// ---------------------------------------------------------------------------
// Current user profile (GET /me, PATCH /me)
// ---------------------------------------------------------------------------

export interface MeProfile {
  id: string;
  name: string;
  email: string;
  verified?: boolean | null;
  enabled?: boolean | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at?: string | null;
  deleted_at?: string | null;
}

export interface MeProfileUpdate {
  name?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function getMe(
  options: RestClientOptions = {}
): Promise<MeProfile> {
  return request<MeProfile>('GET', '/me', undefined, options);
}

export async function updateMe(
  body: MeProfileUpdate,
  options: RestClientOptions = {}
): Promise<MeProfile> {
  return request<MeProfile>('PATCH', '/me', body, options);
}

// ---------------------------------------------------------------------------
// Users (GET/POST /users, GET/PUT/DELETE /users/{user_id})
// ---------------------------------------------------------------------------

export interface AccountSchema {
  id: string;
  name: string;
  email: string;
  verified?: boolean | null;
  enabled?: boolean | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at?: string | null;
  deleted_at?: string | null;
}

export interface AccountCreate {
  name: string;
  email: string;
  password: string;
  metadata?: Record<string, unknown> | null;
}

export interface AccountUpdate {
  name?: string | null;
  email?: string | null;
  password?: string | null;
  verified?: boolean | null;
  enabled?: boolean | null;
  metadata?: Record<string, unknown> | null;
}

export async function listUsers(
  options: RestClientOptions = {},
  includeDeleted = false
): Promise<AccountSchema[]> {
  const q = includeDeleted ? '?include_deleted=true' : '';
  return request<AccountSchema[]>('GET', `/users${q}`, undefined, options);
}

export async function getUser(
  userId: string,
  options: RestClientOptions = {},
  includeDeleted = false
): Promise<AccountSchema> {
  const q = includeDeleted ? '?include_deleted=true' : '';
  return request<AccountSchema>(
    'GET',
    `/users/${encodeURIComponent(userId)}${q}`,
    undefined,
    options
  );
}

export async function createUser(
  body: AccountCreate,
  options: RestClientOptions = {}
): Promise<AccountSchema> {
  return request<AccountSchema>('POST', '/users', body, options);
}

export async function updateUser(
  userId: string,
  body: AccountUpdate,
  options: RestClientOptions = {}
): Promise<AccountSchema> {
  return request<AccountSchema>(
    'PUT',
    `/users/${encodeURIComponent(userId)}`,
    body,
    options
  );
}

export async function deactivateUser(
  userId: string,
  options: RestClientOptions = {}
): Promise<void> {
  return request<void>(
    'DELETE',
    `/users/${encodeURIComponent(userId)}`,
    undefined,
    options
  );
}

// ---------------------------------------------------------------------------
// Tenants
// ---------------------------------------------------------------------------

export async function listTenants(
  options: RestClientOptions = {},
  includeDeleted = false
): Promise<TenantSchema[]> {
  const q = includeDeleted ? '?include_deleted=true' : '';
  return request<TenantSchema[]>('GET', `/tenants${q}`, undefined, options);
}

/** List tenants the current user is a member of (requires JWT). */
export async function listMyTenants(
  options: RestClientOptions = {}
): Promise<TenantSchema[]> {
  return request<TenantSchema[]>('GET', '/tenants/me', undefined, options);
}

export async function getTenant(
  tenantId: string,
  options: RestClientOptions = {},
  includeDeleted = false
): Promise<TenantSchema> {
  const q = includeDeleted ? '?include_deleted=true' : '';
  return request<TenantSchema>('GET', `/tenants/${tenantId}${q}`, undefined, options);
}

export async function createTenant(
  body: TenantCreate,
  options: RestClientOptions = {}
): Promise<TenantSchema> {
  return request<TenantSchema>('POST', '/tenants', body, options);
}

export async function updateTenant(
  tenantId: string,
  body: TenantUpdate,
  options: RestClientOptions = {}
): Promise<TenantSchema> {
  return request<TenantSchema>('PUT', `/tenants/${tenantId}`, body, options);
}

export async function deleteTenant(
  tenantId: string,
  options: RestClientOptions = {}
): Promise<void> {
  return request<void>('DELETE', `/tenants/${tenantId}`, undefined, options);
}

// ---------------------------------------------------------------------------
// Tenant members
// ---------------------------------------------------------------------------

export type TenantAccessLevel = 'member' | 'administrator';

export interface TenantAccountSchema {
  id: string;
  tenant_id: string;
  account_id: string;
  access_level: TenantAccessLevel;
  enabled: boolean;
  created_at: string;
  updated_at: string | null;
  deleted_at?: string | null;
}

export interface TenantAccountCreate {
  tenant_id?: string | null;
  account_id?: string | null;
  email?: string | null;
  access_level?: TenantAccessLevel;
  enabled?: boolean;
}

export interface TenantAccountUpdate {
  access_level?: TenantAccessLevel | null;
  enabled?: boolean | null;
}

export async function listTenantMembers(
  tenantId: string,
  options: RestClientOptions = {}
): Promise<TenantAccountSchema[]> {
  return request<TenantAccountSchema[]>(
    'GET',
    `/tenants/${tenantId}/members`,
    undefined,
    options
  );
}

export async function addTenantMember(
  tenantId: string,
  body: TenantAccountCreate,
  options: RestClientOptions = {}
): Promise<TenantAccountSchema> {
  return request<TenantAccountSchema>(
    'POST',
    `/tenants/${tenantId}/members`,
    { ...body, tenant_id: tenantId },
    options
  );
}

export async function removeTenantMember(
  tenantId: string,
  accountId: string,
  options: RestClientOptions = {}
): Promise<void> {
  return request<void>(
    'DELETE',
    `/tenants/${tenantId}/members/${encodeURIComponent(accountId)}`,
    undefined,
    options
  );
}

export async function updateTenantMember(
  tenantId: string,
  accountId: string,
  body: TenantAccountUpdate,
  options: RestClientOptions = {}
): Promise<TenantAccountSchema> {
  return request<TenantAccountSchema>(
    'PUT',
    `/tenants/${tenantId}/members/${encodeURIComponent(accountId)}`,
    body,
    options
  );
}

// ---------------------------------------------------------------------------
// Tenant administrators (admin-only; list/add/remove)
// ---------------------------------------------------------------------------

export interface TenantAdministratorCreate {
  tenant_id?: string | null;
  account_id?: string | null;
  email?: string | null;
  enabled?: boolean | null;
}

export async function listTenantAdministrators(
  tenantId: string,
  options: RestClientOptions = {}
): Promise<TenantAccountSchema[]> {
  return request<TenantAccountSchema[]>(
    'GET',
    `/tenants/${tenantId}/administrators`,
    undefined,
    options
  );
}

export async function addTenantAdministrator(
  tenantId: string,
  body: TenantAdministratorCreate,
  options: RestClientOptions = {}
): Promise<TenantAccountSchema> {
  return request<TenantAccountSchema>(
    'POST',
    `/tenants/${tenantId}/administrators`,
    { ...body, tenant_id: tenantId },
    options
  );
}

export async function removeTenantAdministrator(
  tenantId: string,
  accountId: string,
  options: RestClientOptions = {}
): Promise<void> {
  return request<void>(
    'DELETE',
    `/tenants/${tenantId}/administrators/${encodeURIComponent(accountId)}`,
    undefined,
    options
  );
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function listProjects(
  tenantId: string,
  options: RestClientOptions = {},
  includeDeleted = false
): Promise<ProjectSchema[]> {
  const q = includeDeleted ? '?include_deleted=true' : '';
  return request<ProjectSchema[]>(
    'GET',
    `/tenants/${tenantId}/projects${q}`,
    undefined,
    options
  );
}

export async function getProject(
  tenantId: string,
  projectId: string,
  options: RestClientOptions = {},
  includeDeleted = false
): Promise<ProjectSchema> {
  const q = includeDeleted ? '?include_deleted=true' : '';
  return request<ProjectSchema>(
    'GET',
    `/tenants/${tenantId}/projects/${projectId}${q}`,
    undefined,
    options
  );
}

export async function createProject(
  tenantId: string,
  body: ProjectCreate,
  options: RestClientOptions = {}
): Promise<ProjectSchema> {
  return request<ProjectSchema>(
    'POST',
    `/tenants/${tenantId}/projects`,
    { ...body, tenant_id: tenantId },
    options
  );
}

export async function updateProject(
  tenantId: string,
  projectId: string,
  body: ProjectUpdate,
  options: RestClientOptions = {}
): Promise<ProjectSchema> {
  return request<ProjectSchema>(
    'PUT',
    `/tenants/${tenantId}/projects/${projectId}`,
    body,
    options
  );
}

export async function deleteProject(
  tenantId: string,
  projectId: string,
  options: RestClientOptions = {}
): Promise<void> {
  return request<void>(
    'DELETE',
    `/tenants/${tenantId}/projects/${projectId}`,
    undefined,
    options
  );
}

export async function restoreProject(
  tenantId: string,
  projectId: string,
  options: RestClientOptions = {}
): Promise<ProjectSchema> {
  return request<ProjectSchema>(
    'POST',
    `/tenants/${tenantId}/projects/${projectId}/restore`,
    undefined,
    options
  );
}

export async function permanentDeleteProject(
  tenantId: string,
  projectId: string,
  options: RestClientOptions = {}
): Promise<void> {
  return request<void>(
    'DELETE',
    `/tenants/${tenantId}/projects/${projectId}/permanent`,
    undefined,
    options
  );
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

export async function listVersions(
  tenantId: string,
  projectId: string,
  options: RestClientOptions = {}
): Promise<VersionSchema[]> {
  return request<VersionSchema[]>(
    'GET',
    `/tenants/${tenantId}/projects/${projectId}/versions`,
    undefined,
    options
  );
}

export async function getVersion(
  versionId: string,
  options: RestClientOptions = {}
): Promise<VersionSchema> {
  return request<VersionSchema>('GET', `/versions/${versionId}`, undefined, options);
}

export async function createVersion(
  tenantId: string,
  projectId: string,
  body: VersionCreate,
  options: RestClientOptions = {}
): Promise<VersionSchema> {
  return request<VersionSchema>(
    'POST',
    `/tenants/${tenantId}/projects/${projectId}/versions`,
    body,
    options
  );
}

export async function updateVersion(
  versionId: string,
  body: VersionMetadataUpdate,
  options: RestClientOptions = {}
): Promise<VersionSchema> {
  return request<VersionSchema>('PUT', `/versions/${versionId}`, body, options);
}

export async function publishVersion(
  versionId: string,
  body?: VersionPublishRequest | null,
  options: RestClientOptions = {}
): Promise<VersionSchema> {
  return request<VersionSchema>(
    'POST',
    `/versions/${versionId}/publish`,
    body ?? undefined,
    options
  );
}

export async function unpublishVersion(
  versionId: string,
  options: RestClientOptions = {}
): Promise<VersionSchema> {
  return request<VersionSchema>(
    'POST',
    `/versions/${versionId}/unpublish`,
    undefined,
    options
  );
}

export async function deleteVersion(
  versionId: string,
  options: RestClientOptions = {}
): Promise<void> {
  return request<void>(
    'DELETE',
    `/versions/${versionId}`,
    undefined,
    options
  );
}

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

export async function listClassesWithPropertiesAndTags(
  versionId: string,
  options: RestClientOptions = {}
): Promise<ClassWithPropertiesAndTags[]> {
  return request<ClassWithPropertiesAndTags[]>(
    'GET',
    `/versions/${versionId}/classes/with-properties-tags`,
    undefined,
    options
  );
}

export async function getClassWithPropertiesAndTags(
  versionId: string,
  classId: string,
  options: RestClientOptions = {}
): Promise<ClassWithPropertiesAndTags> {
  return request<ClassWithPropertiesAndTags>(
    'GET',
    `/versions/${versionId}/classes/${classId}/with-properties-tags`,
    undefined,
    options
  );
}

export async function createClass(
  versionId: string,
  body: ClassCreate,
  options: RestClientOptions = {}
): Promise<ClassSchema> {
  return request<ClassSchema>(
    'POST',
    `/versions/${versionId}/classes`,
    { ...body, enabled: body.enabled ?? true },
    options
  );
}

export async function updateClass(
  versionId: string,
  classId: string,
  body: ClassUpdate,
  options: RestClientOptions = {}
): Promise<ClassSchema> {
  return request<ClassSchema>(
    'PUT',
    `/versions/${versionId}/classes/${classId}`,
    body,
    options
  );
}

export async function deleteClass(
  versionId: string,
  classId: string,
  options: RestClientOptions = {}
): Promise<void> {
  return request<void>(
    'DELETE',
    `/versions/${versionId}/classes/${classId}`,
    undefined,
    options
  );
}

// ---------------------------------------------------------------------------
// Properties (project-scoped library properties)
// ---------------------------------------------------------------------------

export async function listProperties(
  tenantId: string,
  projectId: string,
  options: RestClientOptions = {},
  includeDeleted = false
): Promise<PropertySchema[]> {
  const q = includeDeleted ? '?include_deleted=true' : '';
  return request<PropertySchema[]>(
    'GET',
    `/tenants/${tenantId}/projects/${projectId}/properties${q}`,
    undefined,
    options
  );
}

export async function getProperty(
  tenantId: string,
  projectId: string,
  propertyId: string,
  options: RestClientOptions = {},
  includeDeleted = false
): Promise<PropertySchema> {
  const q = includeDeleted ? '?include_deleted=true' : '';
  return request<PropertySchema>(
    'GET',
    `/tenants/${tenantId}/projects/${projectId}/properties/${propertyId}${q}`,
    undefined,
    options
  );
}

export async function createProperty(
  tenantId: string,
  projectId: string,
  body: PropertyCreate,
  options: RestClientOptions = {}
): Promise<PropertySchema> {
  return request<PropertySchema>(
    'POST',
    `/tenants/${tenantId}/projects/${projectId}/properties`,
    body,
    options
  );
}

export async function updateProperty(
  tenantId: string,
  projectId: string,
  propertyId: string,
  body: PropertyUpdate,
  options: RestClientOptions = {}
): Promise<PropertySchema> {
  return request<PropertySchema>(
    'PUT',
    `/tenants/${tenantId}/projects/${projectId}/properties/${propertyId}`,
    body,
    options
  );
}

export async function deleteProperty(
  tenantId: string,
  projectId: string,
  propertyId: string,
  options: RestClientOptions = {}
): Promise<void> {
  return request<void>(
    'DELETE',
    `/tenants/${tenantId}/projects/${projectId}/properties/${propertyId}`,
    undefined,
    options
  );
}

// ---------------------------------------------------------------------------
// Class properties (class–property join; list = bulk read)
// ---------------------------------------------------------------------------

export async function listClassProperties(
  versionId: string,
  classId: string,
  options: RestClientOptions = {},
  parentId?: string | null
): Promise<ClassPropertySchema[]> {
  const q =
    parentId != null ? `?parent_id=${encodeURIComponent(parentId)}` : '';
  return request<ClassPropertySchema[]>(
    'GET',
    `/versions/${versionId}/classes/${classId}/properties${q}`,
    undefined,
    options
  );
}

export async function addClassProperty(
  versionId: string,
  classId: string,
  body: ClassPropertyCreate,
  options: RestClientOptions = {}
): Promise<ClassPropertySchema> {
  return request<ClassPropertySchema>(
    'POST',
    `/versions/${versionId}/classes/${classId}/properties`,
    body,
    options
  );
}

export async function updateClassProperty(
  versionId: string,
  classId: string,
  classPropertyId: string,
  body: ClassPropertyUpdate,
  options: RestClientOptions = {}
): Promise<ClassPropertySchema> {
  return request<ClassPropertySchema>(
    'PUT',
    `/versions/${versionId}/classes/${classId}/properties/${classPropertyId}`,
    body,
    options
  );
}

export async function deleteClassProperty(
  versionId: string,
  classId: string,
  classPropertyId: string,
  options: RestClientOptions = {}
): Promise<void> {
  return request<void>(
    'DELETE',
    `/versions/${versionId}/classes/${classId}/properties/${classPropertyId}`,
    undefined,
    options
  );
}

// ---------------------------------------------------------------------------
// Version commit / push / pull / merge
// ---------------------------------------------------------------------------

export async function commitVersion(
  versionId: string,
  payload: VersionCommitPayload,
  options: RestClientOptions = {}
): Promise<VersionCommitResponse> {
  return request<VersionCommitResponse>(
    'POST',
    `/versions/${versionId}/commit`,
    payload,
    options
  );
}

export async function pushVersion(
  versionId: string,
  targetVersionId: string,
  payload: VersionCommitPayload,
  options: RestClientOptions = {}
): Promise<VersionCommitResponse> {
  const q = `?target_version_id=${encodeURIComponent(targetVersionId)}`;
  return request<VersionCommitResponse>(
    'POST',
    `/versions/${versionId}/push${q}`,
    payload,
    options
  );
}

export async function pullVersion(
  versionId: string,
  options: RestClientOptions = {},
  revision?: number | null,
  sinceRevision?: number | null
): Promise<VersionPullResponse> {
  const params = new URLSearchParams();
  if (revision != null) params.set('revision', String(revision));
  if (sinceRevision != null) params.set('since_revision', String(sinceRevision));
  const q = params.toString() ? `?${params.toString()}` : '';
  return request<VersionPullResponse>(
    'GET',
    `/versions/${versionId}/pull${q}`,
    undefined,
    options
  );
}

export async function mergeVersion(
  versionId: string,
  body: VersionMergeRequest,
  options: RestClientOptions = {}
): Promise<VersionMergeResponse> {
  return request<VersionMergeResponse>(
    'POST',
    `/versions/${versionId}/merge`,
    body,
    options
  );
}

export async function mergePreview(
  versionId: string,
  body: Omit<VersionMergeRequest, 'source_version_id'> & { source_version_id: string },
  options: RestClientOptions = {}
): Promise<MergePreviewResponse> {
  return request<MergePreviewResponse>(
    'POST',
    `/versions/${versionId}/merge/preview`,
    body,
    options
  );
}

export async function mergeResolve(
  versionId: string,
  body: MergeResolveRequest,
  options: RestClientOptions = {}
): Promise<MergeResolveResponse> {
  return request<MergeResolveResponse>(
    'POST',
    `/versions/${versionId}/merge/resolve`,
    body,
    options
  );
}
