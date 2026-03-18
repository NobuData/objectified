/**
 * Persist custom Mustache templates per version (browser localStorage).
 * Scoped by tenant + project + version so switching workspaces does not collide.
 *
 * Reference: GitHub #119 — configurable code generation templates.
 */

import { generateLocalId } from './types';

const STORAGE_PREFIX = 'objectified:codegen:custom:v1:';

export interface StoredCustomCodegenTemplate {
  id: string;
  name: string;
  /** Mustache template body */
  body: string;
  updatedAt: string;
}

function storageKey(tenantId: string, projectId: string, versionId: string): string {
  return `${STORAGE_PREFIX}${tenantId}:${projectId}:${versionId}`;
}

export function loadCustomCodegenTemplates(
  tenantId: string,
  projectId: string,
  versionId: string
): StoredCustomCodegenTemplate[] {
  if (typeof window === 'undefined' || !versionId) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(tenantId, projectId, versionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is StoredCustomCodegenTemplate =>
          x != null &&
          typeof x === 'object' &&
          typeof (x as StoredCustomCodegenTemplate).id === 'string' &&
          typeof (x as StoredCustomCodegenTemplate).name === 'string' &&
          typeof (x as StoredCustomCodegenTemplate).body === 'string'
      )
      .map((x) => ({
        ...x,
        updatedAt: typeof x.updatedAt === 'string' ? x.updatedAt : new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

function saveAll(
  tenantId: string,
  projectId: string,
  versionId: string,
  list: StoredCustomCodegenTemplate[]
): void {
  if (typeof window === 'undefined' || !versionId) return;
  try {
    window.localStorage.setItem(storageKey(tenantId, projectId, versionId), JSON.stringify(list));
  } catch (e) {
    console.warn('[codeGenerationStorage] save failed', e);
  }
}

export function upsertCustomCodegenTemplate(
  tenantId: string,
  projectId: string,
  versionId: string,
  template: Omit<StoredCustomCodegenTemplate, 'id' | 'updatedAt'> & {
    id?: string;
  }
): StoredCustomCodegenTemplate {
  const list = loadCustomCodegenTemplates(tenantId, projectId, versionId);
  const now = new Date().toISOString();
  const id = template.id ?? generateLocalId();
  const entry: StoredCustomCodegenTemplate = {
    id,
    name: template.name.trim() || 'Untitled',
    body: template.body,
    updatedAt: now,
  };
  const idx = list.findIndex((t) => t.id === id);
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  saveAll(tenantId, projectId, versionId, list);
  return entry;
}

export function deleteCustomCodegenTemplate(
  tenantId: string,
  projectId: string,
  versionId: string,
  templateId: string
): void {
  const list = loadCustomCodegenTemplates(tenantId, projectId, versionId).filter(
    (t) => t.id !== templateId
  );
  saveAll(tenantId, projectId, versionId, list);
}
