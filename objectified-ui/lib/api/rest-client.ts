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
  signal?: AbortSignal;
  /** Sent as `If-None-Match` on GET /versions/{id}/pull for conditional GET. */
  ifNoneMatch?: string;
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

export function isNotFoundError(e: unknown): e is RestApiError {
  return isRestApiError(e) && e.statusCode === 404;
}

export function isConflictError(e: unknown): e is RestApiError {
  return isRestApiError(e) && e.statusCode === 409;
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
    ...(options.signal ? { signal: options.signal } : {}),
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
  rate_limit_requests_per_minute?: number | null;
  max_projects?: number | null;
  max_versions_per_project?: number | null;
  /** Designated primary (ownership) administrator; null if unset. */
  primary_admin_account_id?: string | null;
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
  rate_limit_requests_per_minute?: number | null;
  max_projects?: number | null;
  max_versions_per_project?: number | null;
}

export type TenantDefaultTheme = 'light' | 'dark' | 'system';

export interface TenantActivitySummarySchema {
  active_project_count: number;
  active_member_count: number;
  schema_version_count: number;
  dashboard_page_visits_last_7_days?: number | null;
}

export interface TenantQuotaStatusSchema {
  max_projects?: number | null;
  active_project_count: number;
  max_versions_per_project?: number | null;
  active_version_count_for_project?: number | null;
}

export interface TenantAppearanceUpdate {
  logo_url?: string | null;
  favicon_url?: string | null;
  primary_color?: string | null;
  default_theme?: TenantDefaultTheme | null;
}

export interface ListTenantsQuery {
  includeDeleted?: boolean;
  archivedOnly?: boolean;
  search?: string;
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

export interface ProjectCloneRequest {
  name: string;
  slug: string;
  description?: string;
  copy_latest_version?: boolean;
  /** When copying the latest version, optional name for the new version (default: "{source name} (copy)"). */
  cloned_version_name?: string;
  metadata?: Record<string, unknown>;
}

export interface ProjectCloneResult {
  project: ProjectSchema;
  cloned_version_id?: string | null;
}

export interface VersionSchema {
  id: string;
  project_id: string;
  /** When set, this version was branched or copied from this source version (same project). */
  source_version_id: string | null;
  creator_id: string;
  name: string;
  /** Stable label for code generation (e.g. v1, api-v2); unique per project (case-insensitive). */
  code_generation_tag?: string | null;
  description?: string;
  change_log?: string;
  published?: boolean;
  published_at?: string | null;
  /** Active publish channel when published (development, staging, production). */
  publish_target?: string | null;
  visibility?: string | null;
  enabled?: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
  deleted_at?: string | null;
  /** Highest snapshot revision; set on project version list responses. */
  last_revision?: number | null;
  /** Timestamp of the latest snapshot commit; set on project version list responses. */
  last_committed_at?: string | null;
}

export interface VersionCreate {
  name: string;
  description?: string;
  change_log?: string;
  code_generation_tag?: string | null;
  source_version_id?: string | null;
}

export interface VersionCreateFromRevision {
  source_version_id: string;
  source_revision: number;
  name: string;
  description?: string;
  change_log?: string | null;
}

export interface VersionMetadataUpdate {
  description?: string | null;
  change_log?: string | null;
  /** Omit to leave unchanged; empty string clears. */
  code_generation_tag?: string | null;
}

/** Supported publish channels (must match REST validation). */
export const VERSION_PUBLISH_TARGETS = ['development', 'staging', 'production'] as const;
export type VersionPublishTarget = (typeof VERSION_PUBLISH_TARGETS)[number];

export interface VersionPublishRequest {
  visibility?: 'private' | 'public';
  target?: VersionPublishTarget | null;
  publish_note?: string | null;
}

export interface VersionPublishEventSchema {
  id: string;
  version_id: string;
  project_id: string;
  event_type: 'publish' | 'unpublish';
  target?: string | null;
  visibility?: string | null;
  note?: string | null;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
  created_at: string;
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

/** Response for getTagsForClass / assignTagToClass / removeTagFromClass (GitHub #103). */
export interface ClassTagsResponse {
  tags: string[];
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
  /** Name of the parent class-property for nesting. null or omitted means top-level. */
  parent_property_name?: string | null;
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
  overwrite?: boolean;
}

export interface VersionCommitResponse {
  revision: number;
  snapshot_id: string;
  version_id: string;
  committed_at: string;
}

const PUSH_RETRY_BACKOFF_MS = [400, 1200] as const;

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

export interface VersionSnapshotSchema {
  id: string;
  version_id: string;
  project_id: string;
  committed_by?: string | null;
  revision: number;
  label?: string | null;
  description?: string | null;
  snapshot: Record<string, unknown>;
  created_at: string;
}

export interface VersionSnapshotMetadataSchema {
  id: string;
  version_id: string;
  project_id: string;
  committed_by?: string | null;
  revision: number;
  label?: string | null;
  description?: string | null;
  created_at: string;
}

export interface VersionSnapshotSchemaChangesAuditSchema {
  id: string;
  version_id: string;
  project_id: string;
  committed_by?: string | null;
  revision: number;
  label?: string | null;
  description?: string | null;
  diff: VersionPullDiff;
  created_at: string;
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
// RBAC
// ---------------------------------------------------------------------------

export interface EffectivePermissionsResponse {
  tenant_id: string;
  account_id: string;
  is_tenant_admin: boolean;
  role_ids?: string[];
  permission_keys?: string[];
}

export async function getMyTenantPermissions(
  tenantId: string,
  options: RestClientOptions = {}
): Promise<EffectivePermissionsResponse> {
  return request<EffectivePermissionsResponse>(
    'GET',
    `/tenants/${encodeURIComponent(tenantId)}/me/permissions`,
    undefined,
    options
  );
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

/** Payload for optional dashboard navigation audit (GitHub #188). */
export interface DashboardPageVisitPayload {
  route: string;
  tenant_id?: string | null;
}

/** Record a dashboard page view; API no-ops with 204 when audit is disabled. */
export async function recordDashboardPageVisit(
  body: DashboardPageVisitPayload,
  options: RestClientOptions = {}
): Promise<void> {
  return request<void>('POST', '/me/dashboard/page-visits', body, options);
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
  last_login_at?: string | null;
  deactivation_reason?: string | null;
  deactivated_by?: string | null;
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

export type UserListStatusFilter = 'active' | 'disabled' | 'deactivated';

export type UserListSort =
  | 'created_at_asc'
  | 'created_at_desc'
  | 'last_login_at_asc'
  | 'last_login_at_desc';

export interface ListUsersQuery {
  includeDeleted?: boolean;
  search?: string;
  status?: UserListStatusFilter;
  sort?: UserListSort;
}

export async function listUsers(
  options: RestClientOptions = {},
  queryOrIncludeDeleted: boolean | ListUsersQuery = false
): Promise<AccountSchema[]> {
  const params = new URLSearchParams();
  let q: ListUsersQuery;
  if (typeof queryOrIncludeDeleted === 'boolean') {
    q = { includeDeleted: queryOrIncludeDeleted };
  } else {
    q = queryOrIncludeDeleted ?? {};
  }
  if (q.includeDeleted) params.set('include_deleted', 'true');
  if (q.search?.trim()) params.set('search', q.search.trim());
  if (q.status) params.set('status', q.status);
  if (q.sort) params.set('sort', q.sort);
  const qs = params.toString();
  return request<AccountSchema[]>(
    'GET',
    `/users${qs ? `?${qs}` : ''}`,
    undefined,
    options
  );
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

export interface UserDeactivateBody {
  reason?: string | null;
}

export async function deactivateUser(
  userId: string,
  options: RestClientOptions = {},
  body?: UserDeactivateBody
): Promise<void> {
  const trimmed =
    body?.reason !== undefined && body.reason !== null
      ? String(body.reason).trim()
      : '';
  const payload = trimmed ? { reason: trimmed } : undefined;
  return request<void>(
    'DELETE',
    `/users/${encodeURIComponent(userId)}`,
    payload,
    options
  );
}

export interface AccountLifecycleEventSchema {
  id: string;
  account_id: string;
  event_type: string;
  reason?: string | null;
  actor_id?: string | null;
  created_at: string;
}

export async function listUserLifecycleEvents(
  userId: string,
  options: RestClientOptions = {}
): Promise<AccountLifecycleEventSchema[]> {
  return request<AccountLifecycleEventSchema[]>(
    'GET',
    `/users/${encodeURIComponent(userId)}/lifecycle-events`,
    undefined,
    options
  );
}

export interface UserMembershipRoleSchema {
  role_id: string;
  key: string;
  name: string;
}

export interface UserTenantMembershipAdminSchema {
  tenant_id: string;
  tenant_name: string;
  access_level: 'member' | 'administrator';
  membership_enabled: boolean;
  roles: UserMembershipRoleSchema[];
}

export async function listUserTenantMemberships(
  userId: string,
  options: RestClientOptions = {}
): Promise<UserTenantMembershipAdminSchema[]> {
  return request<UserTenantMembershipAdminSchema[]>(
    'GET',
    `/users/${encodeURIComponent(userId)}/tenant-memberships`,
    undefined,
    options
  );
}

// ---------------------------------------------------------------------------
// Tenants
// ---------------------------------------------------------------------------

export async function listTenants(
  options: RestClientOptions = {},
  query?: ListTenantsQuery
): Promise<TenantSchema[]> {
  const sp = new URLSearchParams();
  if (query?.includeDeleted) sp.set('include_deleted', 'true');
  if (query?.archivedOnly) sp.set('archived_only', 'true');
  if (query?.search?.trim()) sp.set('search', query.search.trim());
  const q = sp.toString() ? `?${sp.toString()}` : '';
  return request<TenantSchema[]>('GET', `/tenants${q}`, undefined, options);
}

/** List tenants the current user is a member of (requires JWT). */
export async function listMyTenants(
  options: RestClientOptions = {},
  includeArchived = false
): Promise<TenantSchema[]> {
  const q = includeArchived ? '?include_archived=true' : '';
  return request<TenantSchema[]>('GET', `/tenants/me${q}`, undefined, options);
}

export async function getTenant(
  tenantId: string,
  options: RestClientOptions = {},
  includeDeleted = false
): Promise<TenantSchema> {
  const q = includeDeleted ? '?include_deleted=true' : '';
  return request<TenantSchema>('GET', `/tenants/${encodeURIComponent(tenantId)}${q}`, undefined, options);
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
  return request<TenantSchema>('PUT', `/tenants/${encodeURIComponent(tenantId)}`, body, options);
}

export async function deleteTenant(
  tenantId: string,
  options: RestClientOptions = {}
): Promise<void> {
  return request<void>('DELETE', `/tenants/${encodeURIComponent(tenantId)}`, undefined, options);
}

export async function restoreTenant(
  tenantId: string,
  options: RestClientOptions = {}
): Promise<TenantSchema> {
  return request<TenantSchema>(
    'POST',
    `/tenants/${encodeURIComponent(tenantId)}/restore`,
    undefined,
    options
  );
}

export async function getTenantActivitySummary(
  tenantId: string,
  options: RestClientOptions = {}
): Promise<TenantActivitySummarySchema> {
  return request<TenantActivitySummarySchema>(
    'GET',
    `/tenants/${encodeURIComponent(tenantId)}/activity-summary`,
    undefined,
    options
  );
}

export async function getTenantQuotaStatus(
  tenantId: string,
  options: RestClientOptions = {},
  projectId?: string | null
): Promise<TenantQuotaStatusSchema> {
  const q =
    projectId != null && projectId !== ''
      ? `?project_id=${encodeURIComponent(projectId)}`
      : '';
  return request<TenantQuotaStatusSchema>(
    'GET',
    `/tenants/${encodeURIComponent(tenantId)}/quota-status${q}`,
    undefined,
    options
  );
}

export async function updateTenantAppearance(
  tenantId: string,
  body: TenantAppearanceUpdate,
  options: RestClientOptions = {}
): Promise<TenantSchema> {
  return request<TenantSchema>(
    'PUT',
    `/tenants/${encodeURIComponent(tenantId)}/appearance`,
    body,
    options
  );
}

// ---------------------------------------------------------------------------
// Tenant members
// ---------------------------------------------------------------------------

export type TenantAccessLevel = 'member' | 'administrator';

export interface TenantMemberRoleSchema {
  role_id: string;
  key: string;
  name: string;
}

export interface TenantAccountSchema {
  id: string;
  tenant_id: string;
  account_id: string;
  access_level: TenantAccessLevel;
  enabled: boolean;
  created_at: string;
  updated_at: string | null;
  deleted_at?: string | null;
  /** Present on GET /tenants/{id}/members when include_roles is used. */
  roles?: TenantMemberRoleSchema[];
}

export interface TenantAccountCreate {
  tenant_id?: string | null;
  account_id?: string | null;
  email?: string | null;
  access_level?: TenantAccessLevel;
  enabled?: boolean;
  member_role_id?: string | null;
}

export interface TenantAccountUpdate {
  access_level?: TenantAccessLevel | null;
  enabled?: boolean | null;
  member_role_id?: string | null;
}

export async function listTenantMembers(
  tenantId: string,
  options: RestClientOptions = {},
  includeRoles = true
): Promise<TenantAccountSchema[]> {
  const q = includeRoles ? '?include_roles=true' : '';
  return request<TenantAccountSchema[]>(
    'GET',
    `/tenants/${encodeURIComponent(tenantId)}/members${q}`,
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
    `/tenants/${encodeURIComponent(tenantId)}/members`,
    { ...body, tenant_id: tenantId },
    options
  );
}

export type TenantMemberInvitationStatus = 'pending' | 'accepted' | 'cancelled';

export interface TenantMemberInvitationSchema {
  id: string;
  tenant_id: string;
  email: string;
  role_id?: string | null;
  role_key?: string | null;
  role_name?: string | null;
  status: TenantMemberInvitationStatus;
  invited_by_account_id?: string | null;
  last_sent_at?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface TenantMemberInvitationCreate {
  email: string;
  member_role_id?: string | null;
}

export type TenantMemberInviteOutcomeKind = 'member' | 'pending_invitation';

export interface TenantMemberInviteOutcome {
  kind: TenantMemberInviteOutcomeKind;
  member?: TenantAccountSchema | null;
  invitation?: TenantMemberInvitationSchema | null;
}

export async function listTenantMemberInvitations(
  tenantId: string,
  options: RestClientOptions = {}
): Promise<TenantMemberInvitationSchema[]> {
  return request<TenantMemberInvitationSchema[]>(
    'GET',
    `/tenants/${encodeURIComponent(tenantId)}/members/invitations`,
    undefined,
    options
  );
}

export async function inviteTenantMemberByEmail(
  tenantId: string,
  body: TenantMemberInvitationCreate,
  options: RestClientOptions = {}
): Promise<TenantMemberInviteOutcome> {
  return request<TenantMemberInviteOutcome>(
    'POST',
    `/tenants/${encodeURIComponent(tenantId)}/members/invite-email`,
    body,
    options
  );
}

export async function resendTenantMemberInvitation(
  tenantId: string,
  invitationId: string,
  options: RestClientOptions = {}
): Promise<TenantMemberInvitationSchema> {
  return request<TenantMemberInvitationSchema>(
    'POST',
    `/tenants/${encodeURIComponent(tenantId)}/members/invitations/${encodeURIComponent(invitationId)}/resend`,
    undefined,
    options
  );
}

export async function cancelTenantMemberInvitation(
  tenantId: string,
  invitationId: string,
  options: RestClientOptions = {}
): Promise<void> {
  return request<void>(
    'DELETE',
    `/tenants/${encodeURIComponent(tenantId)}/members/invitations/${encodeURIComponent(invitationId)}`,
    undefined,
    options
  );
}

export interface TenantRbacRoleSchema {
  id: string;
  tenant_id: string;
  key: string;
  name: string;
  description?: string;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export async function listTenantRbacRoles(
  tenantId: string,
  options: RestClientOptions = {}
): Promise<TenantRbacRoleSchema[]> {
  return request<TenantRbacRoleSchema[]>(
    'GET',
    `/tenants/${encodeURIComponent(tenantId)}/rbac/roles`,
    undefined,
    options
  );
}

export interface TenantBulkInviteResultEntry {
  email: string;
  status:
    | 'added'
    | 'promoted'
    | 'already_member'
    | 'not_found'
    | 'invalid_email'
    | 'pending_invitation'
    | 'already_invited';
  account_id?: string | null;
}

export interface TenantMembersBulkInvitePayload {
  emails: string[];
  access_level: TenantAccessLevel;
  member_role_id?: string | null;
  invite_unknown_emails?: boolean;
}

export interface TenantMembersBulkInviteResponse {
  results: TenantBulkInviteResultEntry[];
}

export async function bulkInviteTenantMembers(
  tenantId: string,
  body: TenantMembersBulkInvitePayload,
  options: RestClientOptions = {}
): Promise<TenantMembersBulkInviteResponse> {
  return request<TenantMembersBulkInviteResponse>(
    'POST',
    `/tenants/${encodeURIComponent(tenantId)}/members/bulk-invite`,
    body,
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
    `/tenants/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(accountId)}`,
    undefined,
    options
  );
}

export interface TenantMembersBulkRemovePayload {
  account_ids: string[];
}

export async function bulkRemoveTenantMembers(
  tenantId: string,
  body: TenantMembersBulkRemovePayload,
  options: RestClientOptions = {}
): Promise<void> {
  return request<void>(
    'POST',
    `/tenants/${encodeURIComponent(tenantId)}/members/bulk-remove`,
    body,
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
    `/tenants/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(accountId)}`,
    body,
    options
  );
}

// ---------------------------------------------------------------------------
// Tenant administrators (list: tenant or platform admin; add/remove: platform admin)
// ---------------------------------------------------------------------------

export interface TenantAdminAuditEventSchema {
  id: string;
  tenant_id: string;
  event_type: string;
  actor_account_id?: string | null;
  target_account_id?: string | null;
  previous_primary_account_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface TenantPrimaryAdminTransfer {
  new_primary_account_id: string;
  confirm_tenant_slug: string;
}

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
    `/tenants/${encodeURIComponent(tenantId)}/administrators`,
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
    `/tenants/${encodeURIComponent(tenantId)}/administrators`,
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
    `/tenants/${encodeURIComponent(tenantId)}/administrators/${encodeURIComponent(accountId)}`,
    undefined,
    options
  );
}

export async function listTenantAdministratorAuditEvents(
  tenantId: string,
  options: RestClientOptions & { limit?: number } = {}
): Promise<TenantAdminAuditEventSchema[]> {
  const { limit = 50, ...requestOpts } = options;
  const q =
    limit === 50 ? '' : `?limit=${encodeURIComponent(String(limit))}`;
  return request<TenantAdminAuditEventSchema[]>(
    'GET',
    `/tenants/${encodeURIComponent(tenantId)}/administrator-audit-events${q}`,
    undefined,
    requestOpts
  );
}

export async function transferTenantPrimaryAdministrator(
  tenantId: string,
  body: TenantPrimaryAdminTransfer,
  options: RestClientOptions = {}
): Promise<TenantSchema> {
  return request<TenantSchema>(
    'POST',
    `/tenants/${encodeURIComponent(tenantId)}/primary-administrator`,
    body,
    options
  );
}

// ---------------------------------------------------------------------------
// Tenant SSO providers (OIDC / SAML)
// ---------------------------------------------------------------------------

export type SsoProviderType = 'oidc' | 'saml';

export interface SsoProviderSchema {
  id: string;
  tenant_id: string;
  provider_type: SsoProviderType;
  name: string;
  enabled: boolean;
  oidc_discovery?: Record<string, unknown> | null;
  saml_metadata_xml?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
  deleted_at?: string | null;
}

export interface SsoProviderCreate {
  tenant_id?: string | null;
  provider_type: SsoProviderType;
  name: string;
  enabled?: boolean;
  oidc_discovery?: Record<string, unknown> | null;
  saml_metadata_xml?: string | null;
  metadata?: Record<string, unknown>;
}

export interface SsoProviderUpdate {
  name?: string | null;
  enabled?: boolean | null;
  oidc_discovery?: Record<string, unknown> | null;
  saml_metadata_xml?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function listTenantSsoProviders(
  tenantId: string,
  options: RestClientOptions = {},
  includeDeleted = false
): Promise<SsoProviderSchema[]> {
  const q = includeDeleted ? '?include_deleted=true' : '';
  return request<SsoProviderSchema[]>(
    'GET',
    `/tenants/${encodeURIComponent(tenantId)}/sso/providers${q}`,
    undefined,
    options
  );
}

export async function createTenantSsoProvider(
  tenantId: string,
  body: SsoProviderCreate,
  options: RestClientOptions = {}
): Promise<SsoProviderSchema> {
  return request<SsoProviderSchema>(
    'POST',
    `/tenants/${encodeURIComponent(tenantId)}/sso/providers`,
    { ...body, tenant_id: tenantId },
    options
  );
}

export async function updateTenantSsoProvider(
  tenantId: string,
  providerId: string,
  body: SsoProviderUpdate,
  options: RestClientOptions = {}
): Promise<SsoProviderSchema> {
  return request<SsoProviderSchema>(
    'PUT',
    `/tenants/${encodeURIComponent(tenantId)}/sso/providers/${encodeURIComponent(providerId)}`,
    body,
    options
  );
}

export async function deleteTenantSsoProvider(
  tenantId: string,
  providerId: string,
  options: RestClientOptions = {}
): Promise<void> {
  return request<void>(
    'DELETE',
    `/tenants/${encodeURIComponent(tenantId)}/sso/providers/${encodeURIComponent(providerId)}`,
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

export async function cloneProject(
  tenantId: string,
  projectId: string,
  body: ProjectCloneRequest,
  options: RestClientOptions = {}
): Promise<ProjectCloneResult> {
  return request<ProjectCloneResult>(
    'POST',
    `/tenants/${tenantId}/projects/${projectId}/clone`,
    body,
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

/**
 * Resolve tenant id for a project by probing GET /tenants/{id}/projects/{projectId}
 * across the provided tenant list (or listMyTenants when omitted).
 * Short-circuits on the first successful match. Only 403/404 responses are
 * silently ignored; unexpected errors (network, 5xx) are rethrown.
 */
export async function resolveTenantIdForProject(
  projectId: string,
  options: RestClientOptions = {},
  tenants?: TenantSchema[]
): Promise<string | null> {
  const tenantList = tenants ?? (await listMyTenants(options));
  for (const t of tenantList) {
    try {
      const p = await getProject(t.id, projectId, options);
      if (p.id === projectId) {
        return t.id;
      }
    } catch (error: unknown) {
      if (isForbiddenError(error) || isNotFoundError(error)) {
        continue;
      }
      throw error;
    }
  }
  return null;
}

export async function listVersionSnapshots(
  versionId: string,
  options: RestClientOptions = {}
): Promise<VersionSnapshotSchema[]> {
  return request<VersionSnapshotSchema[]>(
    'GET',
    `/versions/${versionId}/snapshots`,
    undefined,
    options
  );
}

export async function listVersionSnapshotsMetadata(
  versionId: string,
  options: RestClientOptions = {}
): Promise<VersionSnapshotMetadataSchema[]> {
  return request<VersionSnapshotMetadataSchema[]>(
    'GET',
    `/versions/${versionId}/snapshots/metadata`,
    undefined,
    options
  );
}

export async function listVersionSnapshotsSchemaChanges(
  versionId: string,
  options: RestClientOptions = {}
): Promise<VersionSnapshotSchemaChangesAuditSchema[]> {
  return request<VersionSnapshotSchemaChangesAuditSchema[]>(
    'GET',
    `/versions/${versionId}/snapshots/schema-changes`,
    undefined,
    options
  );
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

export async function createVersionFromRevision(
  tenantId: string,
  projectId: string,
  body: VersionCreateFromRevision,
  options: RestClientOptions = {}
): Promise<VersionSchema> {
  return request<VersionSchema>(
    'POST',
    `/tenants/${tenantId}/projects/${projectId}/versions/from-revision`,
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

export async function listVersionPublishHistory(
  versionId: string,
  options: RestClientOptions = {}
): Promise<VersionPublishEventSchema[]> {
  return request<VersionPublishEventSchema[]>(
    'GET',
    `/versions/${versionId}/publish-history`,
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

/** Get tags for a class (GitHub #103). */
export async function getTagsForClass(
  versionId: string,
  classId: string,
  options: RestClientOptions = {},
  includeDeleted = false
): Promise<ClassTagsResponse> {
  const q = includeDeleted ? '?include_deleted=true' : '';
  return request<ClassTagsResponse>(
    'GET',
    `/versions/${versionId}/classes/${classId}/tags${q}`,
    undefined,
    options
  );
}

/** Assign a tag to a class (GitHub #103). */
export async function assignTagToClass(
  versionId: string,
  classId: string,
  tag: string,
  options: RestClientOptions = {}
): Promise<ClassTagsResponse> {
  return request<ClassTagsResponse>(
    'POST',
    `/versions/${versionId}/classes/${classId}/tags`,
    { tag: tag.trim() },
    options
  );
}

/** Remove a tag from a class (GitHub #103). */
export async function removeTagFromClass(
  versionId: string,
  classId: string,
  tagName: string,
  options: RestClientOptions = {}
): Promise<ClassTagsResponse> {
  return request<ClassTagsResponse>(
    'DELETE',
    `/versions/${versionId}/classes/${classId}/tags/${encodeURIComponent(tagName)}`,
    undefined,
    options
  );
}

/** List all tag names used in the version (project tag list) (GitHub #103). */
export async function listTagsForVersion(
  versionId: string,
  options: RestClientOptions = {}
): Promise<string[]> {
  return request<string[]>(
    'GET',
    `/versions/${versionId}/tags`,
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

/** Error detail from POST /validate/json-schema (matches objectified-rest schema_validation). */
export interface SchemaValidationErrorDetail {
  standard: string;
  message: string;
  path: string;
  schema_path: string;
}

export interface SchemaValidationResponse {
  valid: boolean;
  errors: SchemaValidationErrorDetail[];
}

/**
 * Validate a JSON Schema Draft 2020-12 object (same checks as property/class data on create/update).
 */
export async function validateJsonSchema(
  schema: Record<string, unknown>,
  options: RestClientOptions = {}
): Promise<SchemaValidationResponse> {
  return request<SchemaValidationResponse>(
    'POST',
    '/validate/json-schema',
    { schema },
    options
  );
}

/** Result of POST /versions/{id}/import/openapi|jsonschema (including dry-run). */
export interface ImportResultSchema {
  classes_created: number;
  classes_updated: number;
  properties_created: number;
  properties_reused: number;
  class_properties_created: number;
  class_properties_skipped: number;
  detail: string[];
  dry_run: boolean;
}

/** Response from POST /validate/openapi-document */
export interface OpenApiDocumentValidationResponse {
  valid: boolean;
  openapi_version: string;
  title: string;
  warnings: string[];
  errors: string[];
}

export async function validateOpenApiDocument(
  doc: Record<string, unknown>,
  options: RestClientOptions = {}
): Promise<OpenApiDocumentValidationResponse> {
  return request<OpenApiDocumentValidationResponse>(
    'POST',
    '/validate/openapi-document',
    doc,
    options
  );
}

export async function importOpenApi(
  versionId: string,
  doc: Record<string, unknown>,
  options: RestClientOptions = {},
  dryRun = false
): Promise<ImportResultSchema> {
  const q = dryRun ? '?dry_run=true' : '';
  return request<ImportResultSchema>(
    'POST',
    `/versions/${versionId}/import/openapi${q}`,
    doc,
    options
  );
}

export async function importJsonSchema(
  versionId: string,
  doc: Record<string, unknown>,
  options: RestClientOptions = {},
  dryRun = false
): Promise<ImportResultSchema> {
  const q = dryRun ? '?dry_run=true' : '';
  return request<ImportResultSchema>(
    'POST',
    `/versions/${versionId}/import/jsonschema${q}`,
    doc,
    options
  );
}

export interface FetchImportUrlRequest {
  url: string;
  headers?: Record<string, string>;
}

export interface FetchImportUrlResponse {
  document: Record<string, unknown>;
  content_type: string | null;
}

/** HTTPS fetch of JSON/YAML for import (server-side; optional auth headers). */
export async function fetchImportDocumentUrl(
  versionId: string,
  body: FetchImportUrlRequest,
  options: RestClientOptions = {}
): Promise<FetchImportUrlResponse> {
  return request<FetchImportUrlResponse>(
    'POST',
    `/versions/${versionId}/import/fetch-url`,
    body,
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
  targetVersionId: string | string[],
  payload: VersionCommitPayload,
  options: RestClientOptions = {}
): Promise<VersionCommitResponse[]> {
  const targets = Array.isArray(targetVersionId)
    ? [...new Set(targetVersionId.map((target) => target.trim()).filter(Boolean))]
    : [targetVersionId.trim()].filter(Boolean);
  if (targets.length === 0) {
    throw new Error('Push requires at least one target version.');
  }

  const pushSingleTarget = async (targetId: string): Promise<VersionCommitResponse> => {
    const q = `?target_version_id=${encodeURIComponent(targetId)}`;
    let attempt = 0;
    while (true) {
      try {
        return await request<VersionCommitResponse>(
          'POST',
          `/versions/${versionId}/push${q}`,
          payload,
          options
        );
      } catch (error) {
        const isAbortError =
          error instanceof DOMException && error.name === 'AbortError';
        const shouldRetry =
          !isAbortError &&
          isLikelyTransientPushNetworkError(error) &&
          attempt < PUSH_RETRY_BACKOFF_MS.length;
        if (!shouldRetry) {
          throw error;
        }
        const delayMs = PUSH_RETRY_BACKOFF_MS[attempt];
        attempt += 1;
        await sleep(delayMs);
      }
    }
  };

  const responses: VersionCommitResponse[] = [];
  for (const targetId of targets) {
    responses.push(await pushSingleTarget(targetId));
  }
  return responses;
}

function isLikelyTransientPushNetworkError(error: unknown): boolean {
  if (isRestApiError(error)) return false;
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  if (message.includes('aborted')) return false;
  return (
    error.name === 'TypeError' ||
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('load failed') ||
    message.includes('failed to fetch') ||
    message.includes('timeout') ||
    message.includes('econnreset')
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function buildPullEtag(
  versionId: string,
  effectiveRevision: number | null | undefined,
  revisionParam: number | null | undefined,
  sinceRevisionParam: number | null | undefined
): string {
  const er = effectiveRevision == null ? 'null' : String(effectiveRevision);
  const rp = revisionParam == null ? 'head' : String(revisionParam);
  const sr = sinceRevisionParam == null ? 'none' : String(sinceRevisionParam);
  return `W/"${versionId}:er=${er}:r=${rp}:since=${sr}"`;
}

export type PullVersionWithEtagResult =
  | { notModified: true; etag: string | null }
  | { notModified: false; data: VersionPullResponse; etag: string | null };

async function fetchPullVersion(
  versionId: string,
  options: RestClientOptions = {},
  revision?: number | null,
  sinceRevision?: number | null
): Promise<PullVersionWithEtagResult> {
  const params = new URLSearchParams();
  if (revision != null) params.set('revision', String(revision));
  if (sinceRevision != null) params.set('since_revision', String(sinceRevision));
  const q = params.toString() ? `?${params.toString()}` : '';
  const path = `/versions/${versionId}/pull${q}`;
  const url = path.startsWith('http') ? path : `${getRequestBase()}${path}`;
  const headers = buildAuthHeaders(options);
  if (options.ifNoneMatch) {
    headers['If-None-Match'] = options.ifNoneMatch;
  }
  const isRelative = url.startsWith('/');
  const res = await fetch(url, {
    method: 'GET',
    headers,
    ...(isRelative ? { credentials: 'include' as RequestCredentials } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const etag = res.headers?.get?.('ETag') ?? null;
  if (res.status === 304) {
    return { notModified: true, etag };
  }
  const text = await res.text();
  let parsed: VersionPullResponse | ApiError | null = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as VersionPullResponse | ApiError;
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
  if (!parsed) {
    throw new RestApiError('Empty or invalid pull response body', res.status);
  }
  return { notModified: false, data: parsed as VersionPullResponse, etag };
}

export async function pullVersionWithEtag(
  versionId: string,
  options: RestClientOptions = {},
  revision?: number | null,
  sinceRevision?: number | null
): Promise<PullVersionWithEtagResult> {
  return fetchPullVersion(versionId, options, revision, sinceRevision);
}

export async function pullVersion(
  versionId: string,
  options: RestClientOptions = {},
  revision?: number | null,
  sinceRevision?: number | null
): Promise<VersionPullResponse> {
  const r = await fetchPullVersion(versionId, options, revision, sinceRevision);
  if (r.notModified) {
    throw new RestApiError(
      'Unexpected 304 from pull without conditional handling; omit ifNoneMatch for unconditional pull',
      304
    );
  }
  return r.data;
}

export async function rollbackVersion(
  versionId: string,
  body: { revision: number },
  options: RestClientOptions = {}
): Promise<VersionCommitResponse> {
  return request<VersionCommitResponse>(
    'POST',
    `/versions/${versionId}/rollback`,
    body,
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
