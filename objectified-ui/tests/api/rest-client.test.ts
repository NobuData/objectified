/**
 * Unit tests for the REST API client (lib/api/rest-client.ts).
 * Covers: getRestClientOptions, buildAuthHeaders (via request), error parsing,
 * 204 handling, query-param encoding, and representative endpoint helpers.
 */

import {
  getRestBaseUrl,
  getRestClientOptions,
  getMe,
  updateMe,
  listTenants,
  getTenant,
  createTenant,
  listTenantMembers,
  addTenantMember,
  removeTenantMember,
  updateTenantMember,
  listTenantAdministrators,
  addTenantAdministrator,
  removeTenantAdministrator,
  listUsers,
  getUser,
  createUser,
  updateUser,
  deactivateUser,
  listProjects,
  listVersions,
  listVersionSnapshots,
  listClassesWithPropertiesAndTags,
  getTagsForClass,
  assignTagToClass,
  removeTagFromClass,
  listTagsForVersion,
  listProperties,
  commitVersion,
  pullVersion,
  mergeVersion,
  isForbiddenError,
  RestApiError,
  type RestClientOptions,
  type TenantSchema,
  type ProjectSchema,
  type VersionSchema,
} from '@lib/api/rest-client';

// ---------------------------------------------------------------------------
// fetch mock
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
global.fetch = mockFetch;

function makeFetchResponse(
  body: unknown,
  status = 200,
  ok = true
): Response {
  return {
    ok,
    status,
    text: jest.fn().mockResolvedValue(body !== undefined ? JSON.stringify(body) : ''),
  } as unknown as Response;
}

function makeEmptyFetchResponse(status = 204): Response {
  return {
    ok: true,
    status,
    text: jest.fn().mockResolvedValue(''),
  } as unknown as Response;
}

function makeErrorFetchResponse(detail: string | object, status = 400): Response {
  return {
    ok: false,
    status,
    text: jest.fn().mockResolvedValue(JSON.stringify({ detail })),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// getRestClientOptions
// ---------------------------------------------------------------------------

describe('getRestClientOptions', () => {
  const origEnv = process.env;

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('returns empty options when session is null and no env var', () => {
    delete process.env.REST_API_KEY;
    const opts = getRestClientOptions(null);
    expect(opts).toEqual({});
  });

  it('populates jwt from session.accessToken', () => {
    delete process.env.REST_API_KEY;
    const opts = getRestClientOptions({ accessToken: 'tok-123' });
    expect(opts.jwt).toBe('tok-123');
    expect(opts.apiKey).toBeUndefined();
  });

  it('does not include jwt when session has no accessToken', () => {
    const opts = getRestClientOptions({});
    expect(opts.jwt).toBeUndefined();
  });

  it('populates apiKey from REST_API_KEY (non-public env var)', () => {
    process.env.REST_API_KEY = 'secret-key';
    const opts = getRestClientOptions(null);
    expect(opts.apiKey).toBe('secret-key');
  });

  it('includes both jwt and apiKey when both are present', () => {
    process.env.REST_API_KEY = 'env-key';
    const opts = getRestClientOptions({ accessToken: 'jwt-tok' });
    expect(opts.jwt).toBe('jwt-tok');
    expect(opts.apiKey).toBe('env-key');
  });

  it('does not set apiKey when REST_API_KEY is absent', () => {
    delete process.env.REST_API_KEY;
    const opts = getRestClientOptions(null);
    expect(opts.apiKey).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Auth headers construction (tested indirectly via request)
// ---------------------------------------------------------------------------

describe('auth headers via request()', () => {
  const baseUrl = getRestBaseUrl();
  const tenantId = 'tenant-uuid';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends Authorization: Bearer header when jwt is provided', async () => {
    mockFetch.mockResolvedValue(makeFetchResponse([]));
    const opts: RestClientOptions = { jwt: 'my-jwt-token' };
    await listTenants(opts);
    const [, init] = mockFetch.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer my-jwt-token',
    });
  });

  it('sends X-API-Key header when apiKey is provided', async () => {
    mockFetch.mockResolvedValue(makeFetchResponse([]));
    const opts: RestClientOptions = { apiKey: 'my-api-key' };
    await listTenants(opts);
    const [, init] = mockFetch.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      'X-API-Key': 'my-api-key',
    });
  });

  it('sends both Authorization and X-API-Key when both are present', async () => {
    mockFetch.mockResolvedValue(makeFetchResponse([]));
    const opts: RestClientOptions = { jwt: 'tok', apiKey: 'key' };
    await listTenants(opts);
    const [, init] = mockFetch.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer tok',
      'X-API-Key': 'key',
    });
  });

  it('includes Content-Type: application/json in all requests', async () => {
    mockFetch.mockResolvedValue(makeFetchResponse([]));
    await listTenants({});
    const [, init] = mockFetch.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      'Content-Type': 'application/json',
    });
  });

  it('sends no auth headers when options is empty', async () => {
    mockFetch.mockResolvedValue(makeFetchResponse([]));
    await listTenants({});
    const [, init] = mockFetch.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
    expect(headers['X-API-Key']).toBeUndefined();
  });

  it('constructs URL from base url + path', async () => {
    mockFetch.mockResolvedValue(makeFetchResponse([]));
    await listTenants({});
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/tenants`);
  });

  it('constructs URL with include_deleted query param', async () => {
    mockFetch.mockResolvedValue(makeFetchResponse([]));
    await listTenants({}, true);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/tenants?include_deleted=true`);
  });

  it('constructs nested project URL correctly', async () => {
    mockFetch.mockResolvedValue(makeFetchResponse([]));
    await listProjects(tenantId, {});
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/tenants/${tenantId}/projects`);
  });
});

// ---------------------------------------------------------------------------
// Error parsing
// ---------------------------------------------------------------------------

describe('error handling in request()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws with string detail from API error response', async () => {
    mockFetch.mockResolvedValue(makeErrorFetchResponse('Not found', 404));
    await expect(listTenants({})).rejects.toThrow('Not found');
  });

  it('throws with joined messages for array detail errors', async () => {
    const detail = [
      { loc: ['body', 'name'], msg: 'field required', type: 'missing' },
      { loc: ['body', 'slug'], msg: 'field required', type: 'missing' },
    ];
    mockFetch.mockResolvedValue(makeErrorFetchResponse(detail, 422));
    await expect(createTenant({ name: '', slug: '' }, {})).rejects.toThrow(
      'field required; field required'
    );
  });

  it('throws HTTP status fallback when no detail in error body', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue(JSON.stringify({ error: 'Server Error' })),
    } as unknown as Response);
    await expect(listTenants({})).rejects.toThrow('HTTP 500');
  });

  it('throws HTTP status when response body is not JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      text: jest.fn().mockResolvedValue('Service Unavailable'),
    } as unknown as Response);
    await expect(listTenants({})).rejects.toThrow('HTTP 503');
  });

  it('throws RestApiError with statusCode and detail for non-2xx', async () => {
    mockFetch.mockResolvedValue(makeErrorFetchResponse('Admin privileges required.', 403));
    const promise = listTenants({});
    await expect(promise).rejects.toThrow('Admin privileges required.');
    const e = await promise.catch((x) => x);
    expect(e).toBeInstanceOf(RestApiError);
    expect((e as RestApiError).statusCode).toBe(403);
    expect((e as RestApiError).message).toBe('Admin privileges required.');
    expect(isForbiddenError(e)).toBe(true);
  });

  it('isForbiddenError returns false for non-403 errors', async () => {
    mockFetch.mockResolvedValue(makeErrorFetchResponse('Not found', 404));
    const promise = listTenants({});
    await expect(promise).rejects.toThrow('Not found');
    const e = await promise.catch((x) => x);
    expect(isForbiddenError(e)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 204 No Content handling
// ---------------------------------------------------------------------------

describe('204 No Content handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns undefined for 204 responses', async () => {
    mockFetch.mockResolvedValue(makeEmptyFetchResponse(204));
    const result = await getTenant('tenant-uuid', {});
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Representative endpoint helpers
// ---------------------------------------------------------------------------

describe('listTenants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns tenant list from API response', async () => {
    const tenants: TenantSchema[] = [
      { id: 't1', name: 'Acme', description: '', slug: 'acme', created_at: '2024-01-01', updated_at: null },
    ];
    mockFetch.mockResolvedValue(makeFetchResponse(tenants));
    const result = await listTenants({});
    expect(result).toEqual(tenants);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('uses GET method', async () => {
    mockFetch.mockResolvedValue(makeFetchResponse([]));
    await listTenants({});
    const [, init] = mockFetch.mock.calls[0];
    expect((init as RequestInit).method).toBe('GET');
  });
});

describe('listTenantMembers', () => {
  const baseUrl = getRestBaseUrl();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns member list from API', async () => {
    const members = [
      {
        id: 'm1',
        tenant_id: 't1',
        account_id: 'a1',
        access_level: 'member',
        enabled: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: null,
        deleted_at: null,
      },
    ];
    mockFetch.mockResolvedValue(makeFetchResponse(members));
    const result = await listTenantMembers('t1', {});
    expect(result).toEqual(members);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/tenants/t1/members`);
  });

  it('uses GET method', async () => {
    mockFetch.mockResolvedValue(makeFetchResponse([]));
    await listTenantMembers('t1', {});
    const [, init] = mockFetch.mock.calls[0];
    expect((init as RequestInit).method).toBe('GET');
  });
});

describe('addTenantMember', () => {
  const baseUrl = getRestBaseUrl();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends POST with email and access_level', async () => {
    const created = {
      id: 'm1',
      tenant_id: 't1',
      account_id: 'a1',
      access_level: 'member',
      enabled: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: null,
      deleted_at: null,
    };
    mockFetch.mockResolvedValue(makeFetchResponse(created, 201));
    await addTenantMember('t1', { email: 'u@example.com', access_level: 'member' }, {});
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/tenants/t1/members`);
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      tenant_id: 't1',
      email: 'u@example.com',
      access_level: 'member',
    });
  });
});

describe('removeTenantMember', () => {
  const baseUrl = getRestBaseUrl();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends DELETE and returns undefined', async () => {
    mockFetch.mockResolvedValue(makeEmptyFetchResponse(204));
    await removeTenantMember('t1', 'a1', {});
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/tenants/t1/members/a1`);
    expect((init as RequestInit).method).toBe('DELETE');
  });
});

describe('updateTenantMember', () => {
  const baseUrl = getRestBaseUrl();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends PUT with access_level and enabled', async () => {
    const updated = {
      id: 'm1',
      tenant_id: 't1',
      account_id: 'a1',
      access_level: 'administrator',
      enabled: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: null,
      deleted_at: null,
    };
    mockFetch.mockResolvedValue(makeFetchResponse(updated));
    await updateTenantMember('t1', 'a1', { access_level: 'administrator', enabled: true }, {});
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/tenants/t1/members/a1`);
    expect((init as RequestInit).method).toBe('PUT');
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      access_level: 'administrator',
      enabled: true,
    });
  });
});

describe('listTenantAdministrators', () => {
  const baseUrl = getRestBaseUrl();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns administrator list from API', async () => {
    const admins = [
      {
        id: 'a1',
        tenant_id: 't1',
        account_id: 'u1',
        access_level: 'administrator' as const,
        enabled: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: null,
        deleted_at: null,
      },
    ];
    mockFetch.mockResolvedValue(makeFetchResponse(admins));
    const result = await listTenantAdministrators('t1', {});
    expect(result).toEqual(admins);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/tenants/t1/administrators`);
  });
});

describe('addTenantAdministrator', () => {
  const baseUrl = getRestBaseUrl();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends POST with account_id', async () => {
    const created = {
      id: 'a1',
      tenant_id: 't1',
      account_id: 'u1',
      access_level: 'administrator' as const,
      enabled: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: null,
      deleted_at: null,
    };
    mockFetch.mockResolvedValue(makeFetchResponse(created, 201));
    await addTenantAdministrator('t1', { account_id: 'u1' }, {});
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/tenants/t1/administrators`);
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      tenant_id: 't1',
      account_id: 'u1',
    });
  });
});

describe('removeTenantAdministrator', () => {
  const baseUrl = getRestBaseUrl();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends DELETE and returns undefined', async () => {
    mockFetch.mockResolvedValue(makeEmptyFetchResponse(204));
    await removeTenantAdministrator('t1', 'a1', {});
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/tenants/t1/administrators/a1`);
    expect((init as RequestInit).method).toBe('DELETE');
  });
});

describe('listProjects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns project list from API response', async () => {
    const projects: ProjectSchema[] = [
      { id: 'p1', tenant_id: 't1', name: 'Demo', slug: 'demo', created_at: '2024-01-01', updated_at: null },
    ];
    mockFetch.mockResolvedValue(makeFetchResponse(projects));
    const result = await listProjects('t1', {});
    expect(result).toEqual(projects);
  });

  it('appends include_deleted query param when requested', async () => {
    mockFetch.mockResolvedValue(makeFetchResponse([]));
    await listProjects('t1', {}, true);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('include_deleted=true');
  });
});

describe('listVersions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns version list from API response', async () => {
    const versions: VersionSchema[] = [
      { id: 'v1', project_id: 'p1', name: '1.0.0', created_at: '2024-01-01', updated_at: null },
    ];
    mockFetch.mockResolvedValue(makeFetchResponse(versions));
    const result = await listVersions('t1', 'p1', {});
    expect(result).toEqual(versions);
  });

  it('constructs correct URL for versions endpoint', async () => {
    const baseUrl = getRestBaseUrl();
    mockFetch.mockResolvedValue(makeFetchResponse([]));
    await listVersions('t1', 'p1', {});
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/tenants/t1/projects/p1/versions`);
  });
});

describe('listVersionSnapshots', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns snapshot list from API and constructs correct URL', async () => {
    const snapshots = [
      {
        id: 's1',
        version_id: 'v1',
        project_id: 'p1',
        revision: 1,
        created_at: '2024-01-01',
        snapshot: {},
      },
    ];
    mockFetch.mockResolvedValue(makeFetchResponse(snapshots));
    const result = await listVersionSnapshots('v1', {});
    expect(result).toEqual(snapshots);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${getRestBaseUrl()}/versions/v1/snapshots`);
  });
});

describe('listClassesWithPropertiesAndTags', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('constructs correct URL for classes endpoint', async () => {
    const baseUrl = getRestBaseUrl();
    mockFetch.mockResolvedValue(makeFetchResponse([]));
    await listClassesWithPropertiesAndTags('v1', {});
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/versions/v1/classes/with-properties-tags`);
  });
});

describe('getTagsForClass', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('constructs correct URL and returns tags', async () => {
    const baseUrl = getRestBaseUrl();
    mockFetch.mockResolvedValue(makeFetchResponse({ tags: ['a', 'b'] }));
    const result = await getTagsForClass('v1', 'c1', {});
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/versions/v1/classes/c1/tags`);
    expect(result.tags).toEqual(['a', 'b']);
  });
});

describe('assignTagToClass', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POSTs to class tags endpoint with tag body', async () => {
    const baseUrl = getRestBaseUrl();
    mockFetch.mockResolvedValue(makeFetchResponse({ tags: ['x', 'y'] }));
    await assignTagToClass('v1', 'c1', 'y', {});
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/versions/v1/classes/c1/tags`);
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).body).toBe(JSON.stringify({ tag: 'y' }));
  });
});

describe('removeTagFromClass', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('DELETEs tag by name with encoded path', async () => {
    const baseUrl = getRestBaseUrl();
    mockFetch.mockResolvedValue(makeFetchResponse({ tags: [] }));
    await removeTagFromClass('v1', 'c1', 'my-tag', {});
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/versions/v1/classes/c1/tags/my-tag`);
  });
});

describe('listTagsForVersion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('constructs correct URL and returns string array', async () => {
    const baseUrl = getRestBaseUrl();
    mockFetch.mockResolvedValue(makeFetchResponse(['tag1', 'tag2']));
    const result = await listTagsForVersion('v1', {});
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/versions/v1/tags`);
    expect(result).toEqual(['tag1', 'tag2']);
  });
});

describe('listProperties', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('constructs correct URL for properties endpoint', async () => {
    const baseUrl = getRestBaseUrl();
    mockFetch.mockResolvedValue(makeFetchResponse([]));
    await listProperties('t1', 'p1', {});
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/tenants/t1/projects/p1/properties`);
  });
});

describe('commitVersion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses POST method and sends payload as JSON body', async () => {
    const response = { revision: 1, snapshot_id: 's1', version_id: 'v1', committed_at: '2024-01-01' };
    mockFetch.mockResolvedValue(makeFetchResponse(response));
    const payload = { classes: [{ name: 'MyClass' }] };
    await commitVersion('v1', payload, {});
    const [, init] = mockFetch.mock.calls[0];
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).body).toBe(JSON.stringify(payload));
  });
});

describe('pullVersion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('constructs URL without query params when no revision given', async () => {
    const baseUrl = getRestBaseUrl();
    const response = { version_id: 'v1', pulled_at: '2024-01-01' };
    mockFetch.mockResolvedValue(makeFetchResponse(response));
    await pullVersion('v1', {});
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/versions/v1/pull`);
  });

  it('appends revision query param when provided', async () => {
    const response = { version_id: 'v1', pulled_at: '2024-01-01' };
    mockFetch.mockResolvedValue(makeFetchResponse(response));
    await pullVersion('v1', {}, 3);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('revision=3');
  });

  it('appends since_revision query param when provided', async () => {
    const response = { version_id: 'v1', pulled_at: '2024-01-01' };
    mockFetch.mockResolvedValue(makeFetchResponse(response));
    await pullVersion('v1', {}, null, 2);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('since_revision=2');
  });
});

describe('mergeVersion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends source_version_id and strategy in body', async () => {
    const response = {
      revision: 2,
      snapshot_id: 's2',
      version_id: 'v1',
      committed_at: '2024-01-01',
    };
    mockFetch.mockResolvedValue(makeFetchResponse(response));
    const body = { source_version_id: 'v2', strategy: 'additive' as const };
    await mergeVersion('v1', body, {});
    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      source_version_id: 'v2',
      strategy: 'additive',
    });
  });
});

describe('listUsers', () => {
  const baseUrl = getRestBaseUrl();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns user list from API', async () => {
    const users = [
      {
        id: 'u1',
        name: 'Alice',
        email: 'alice@example.com',
        verified: true,
        enabled: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: null,
        deleted_at: null,
      },
    ];
    mockFetch.mockResolvedValue(makeFetchResponse(users));
    const result = await listUsers({});
    expect(result).toEqual(users);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/users`);
  });

  it('appends include_deleted when requested', async () => {
    mockFetch.mockResolvedValue(makeFetchResponse([]));
    await listUsers({}, true);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/users?include_deleted=true`);
  });
});

describe('getUser', () => {
  const baseUrl = getRestBaseUrl();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('constructs URL with user id', async () => {
    const user = {
      id: 'u1',
      name: 'Alice',
      email: 'alice@example.com',
      created_at: '2024-01-01T00:00:00Z',
    };
    mockFetch.mockResolvedValue(makeFetchResponse(user));
    await getUser('u1', {});
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/users/u1`);
  });
});

describe('createUser', () => {
  const baseUrl = getRestBaseUrl();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends POST with name, email, password', async () => {
    const created = {
      id: 'u1',
      name: 'New User',
      email: 'new@example.com',
      verified: false,
      enabled: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: null,
      deleted_at: null,
    };
    mockFetch.mockResolvedValue(makeFetchResponse(created, 201));
    const result = await createUser(
      { name: 'New User', email: 'new@example.com', password: 'secret' },
      {}
    );
    expect(result).toEqual(created);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/users`);
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      name: 'New User',
      email: 'new@example.com',
      password: 'secret',
    });
  });
});

describe('updateUser', () => {
  const baseUrl = getRestBaseUrl();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends PUT with optional fields', async () => {
    const updated = {
      id: 'u1',
      name: 'Updated',
      email: 'up@example.com',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
      deleted_at: null,
    };
    mockFetch.mockResolvedValue(makeFetchResponse(updated));
    await updateUser('u1', { name: 'Updated', enabled: true }, {});
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/users/u1`);
    expect((init as RequestInit).method).toBe('PUT');
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      name: 'Updated',
      enabled: true,
    });
  });
});

describe('deactivateUser', () => {
  const baseUrl = getRestBaseUrl();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends DELETE and returns undefined', async () => {
    mockFetch.mockResolvedValue(makeEmptyFetchResponse(204));
    const result = await deactivateUser('u1', {});
    expect(result).toBeUndefined();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/users/u1`);
    expect((init as RequestInit).method).toBe('DELETE');
  });
});

describe('getMe', () => {
  const baseUrl = getRestBaseUrl();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns current user profile from API', async () => {
    const profile = {
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
      verified: true,
      enabled: true,
      metadata: {},
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
    };
    mockFetch.mockResolvedValue(makeFetchResponse(profile));
    const result = await getMe({});
    expect(result).toEqual(profile);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/me`);
  });

  it('uses GET method', async () => {
    mockFetch.mockResolvedValue(makeFetchResponse({ id: 'u1', name: '', email: '', created_at: '' }));
    await getMe({});
    const [, init] = mockFetch.mock.calls[0];
    expect((init as RequestInit).method).toBe('GET');
  });
});

describe('updateMe', () => {
  const baseUrl = getRestBaseUrl();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends PATCH with name and metadata', async () => {
    const updated = {
      id: 'user-1',
      name: 'New Name',
      email: 'test@example.com',
      verified: true,
      enabled: true,
      metadata: { key: 'value' },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
    };
    mockFetch.mockResolvedValue(makeFetchResponse(updated));
    const result = await updateMe({ name: 'New Name', metadata: { key: 'value' } }, {});
    expect(result).toEqual(updated);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${baseUrl}/me`);
    expect((init as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      name: 'New Name',
      metadata: { key: 'value' },
    });
  });
});
