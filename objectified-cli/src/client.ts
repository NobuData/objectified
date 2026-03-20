import { readFileSync } from 'fs';

export interface CliConfig {
  /** Base URL including `/v1`, e.g. `https://api.example.com/v1` */
  baseUrl: string;
  apiKey?: string;
  jwt?: string;
}

export class CliApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly detail?: unknown
  ) {
    super(message);
    this.name = 'CliApiError';
  }
}

export function normalizeBaseUrl(raw: string): string {
  const s = raw.replace(/\/$/, '');
  if (s.endsWith('/v1')) return s;
  return `${s}/v1`;
}

export function loadConfigFromEnv(): CliConfig {
  const raw =
    process.env.OBJECTIFIED_API_URL ||
    process.env.REST_API_BASE_URL ||
    'http://localhost:8000/v1';
  const apiKey = process.env.OBJECTIFIED_API_KEY || process.env.REST_API_KEY;
  const jwt =
    process.env.OBJECTIFIED_JWT ||
    process.env.OBJECTIFIED_ACCESS_TOKEN ||
    process.env.JWT_ACCESS_TOKEN;
  return {
    baseUrl: normalizeBaseUrl(raw),
    apiKey: apiKey?.trim() || undefined,
    jwt: jwt?.trim() || undefined,
  };
}

function buildAuthHeaders(cfg: CliConfig): Record<string, string> {
  const headers: Record<string, string> = {};
  if (cfg.jwt) headers.Authorization = `Bearer ${cfg.jwt}`;
  if (cfg.apiKey) headers['X-API-Key'] = cfg.apiKey;
  return headers;
}

export function assertAuth(cfg: CliConfig): void {
  if (!cfg.apiKey && !cfg.jwt) {
    throw new CliApiError(
      'Authentication required: set OBJECTIFIED_API_KEY (or REST_API_KEY) and/or OBJECTIFIED_JWT.',
      401
    );
  }
}

function appendQuery(
  path: string,
  query?: Record<string, string | number | undefined | null>
): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const q = params.toString();
  return q ? `${path}?${q}` : path;
}

export async function apiJson<T>(
  cfg: CliConfig,
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string | number | undefined | null>
): Promise<T> {
  assertAuth(cfg);
  const url = `${cfg.baseUrl}${appendQuery(path, query)}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...buildAuthHeaders(cfg),
  };
  if (method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const trimmedText = text.trim();
  let parsed: unknown = null;
  if (trimmedText) {
    try {
      parsed = JSON.parse(trimmedText);
    } catch {
      if (res.ok) {
        throw new CliApiError(
          `Invalid JSON response from server (HTTP ${res.status})`,
          res.status,
          { body: text }
        );
      }
    }
  }
  if (!res.ok) {
    const detail = (parsed as { detail?: unknown } | null)?.detail;
    const message =
      typeof detail === 'string'
        ? detail
        : detail && Array.isArray(detail)
          ? (detail as { msg: string }[]).map((d) => d.msg).join('; ')
          : `HTTP ${res.status}`;
    throw new CliApiError(message || `HTTP ${res.status}`, res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return parsed as T;
}

/** GET that returns arbitrary JSON (export endpoints). */
export async function apiGetJsonDocument(
  cfg: CliConfig,
  path: string,
  query?: Record<string, string | undefined | null>
): Promise<unknown> {
  assertAuth(cfg);
  const url = `${cfg.baseUrl}${appendQuery(path, query)}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...buildAuthHeaders(cfg),
  };
  const res = await fetch(url, { method: 'GET', headers });
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new CliApiError('Response was not valid JSON', res.status);
    }
  }
  if (!res.ok) {
    const detail = (parsed as { detail?: unknown } | null)?.detail;
    const message =
      typeof detail === 'string'
        ? detail
        : `HTTP ${res.status}`;
    throw new CliApiError(message, res.status, detail);
  }
  return parsed;
}

export interface VersionPullResponse {
  version_id: string;
  revision?: number | null;
  classes?: Record<string, unknown>[];
  canvas_metadata?: Record<string, unknown> | null;
  pulled_at: string;
  diff_since_revision?: number | null;
  diff?: unknown;
}

export async function pullVersion(
  cfg: CliConfig,
  versionId: string,
  opts?: { revision?: number; sinceRevision?: number }
): Promise<VersionPullResponse> {
  return apiJson<VersionPullResponse>(cfg, 'GET', `/versions/${versionId}/pull`, undefined, {
    revision: opts?.revision,
    since_revision: opts?.sinceRevision,
  });
}

export interface VersionCommitPayload {
  classes?: unknown[];
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

export async function pushVersion(
  cfg: CliConfig,
  sourceVersionId: string,
  targetVersionId: string,
  payload: VersionCommitPayload
): Promise<VersionCommitResponse> {
  return apiJson<VersionCommitResponse>(
    cfg,
    'POST',
    `/versions/${sourceVersionId}/push`,
    payload,
    { target_version_id: targetVersionId }
  );
}

export function readJsonFile(path: string): unknown {
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw);
}

export type OpenApiExportOptions = Record<string, unknown>;

/** Serialize OpenAPI export query params (JSON fields as stringified JSON per API). */
export function openApiOptionsToQuery(opts: OpenApiExportOptions): Record<string, string | undefined> {
  const q: Record<string, string | undefined> = {};
  for (const k of ['project_name', 'version', 'description'] as const) {
    const v = opts[k];
    if (typeof v === 'string' && v !== '') q[k] = v;
  }
  const jsonFields = ['servers', 'tags', 'security', 'external_docs', 'metadata'] as const;
  for (const k of jsonFields) {
    const v = opts[k];
    if (v !== undefined && v !== null) q[k] = JSON.stringify(v);
  }
  return q;
}

export async function exportOpenApiDocument(
  cfg: CliConfig,
  versionId: string,
  options?: OpenApiExportOptions
): Promise<unknown> {
  const flat = options ? openApiOptionsToQuery(options) : {};
  return apiGetJsonDocument(cfg, `/versions/${versionId}/export/openapi`, flat);
}

export async function exportJsonSchemaDocument(
  cfg: CliConfig,
  versionId: string,
  opts?: {
    classId?: string;
    projectName?: string;
    schemaVersion?: string;
    description?: string;
  }
): Promise<unknown> {
  return apiGetJsonDocument(cfg, `/versions/${versionId}/export/jsonschema`, {
    class_id: opts?.classId,
    project_name: opts?.projectName,
    version: opts?.schemaVersion,
    description: opts?.description,
  });
}

export async function exportValidationRulesDocument(
  cfg: CliConfig,
  versionId: string,
  opts?: { classId?: string; title?: string }
): Promise<unknown> {
  return apiGetJsonDocument(cfg, `/versions/${versionId}/export/validation-rules`, {
    class_id: opts?.classId,
    title: opts?.title,
  });
}
