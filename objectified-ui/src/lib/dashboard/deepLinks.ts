/**
 * Shareable dashboard URLs that resolve workspace context (GitHub #188).
 * These routes redirect into the Data Designer with query parameters.
 */
export function dashboardProjectVersionPath(projectId: string, versionId: string): string {
  return `/dashboard/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}`;
}

/**
 * Opens Data Designer with workspace query params. Optional revision opens at that snapshot
 * (read-only when readOnly is true; use edit to force editable when canvas default is read-only).
 */
export function dataDesignerDeepLink(params: {
  tenantId: string;
  projectId: string;
  versionId: string;
  revision?: number;
  readOnly?: boolean;
  /** When true, adds edit=1 so the revision opens editable despite defaultRevisionLoadReadOnly. */
  edit?: boolean;
}): string {
  const qs = new URLSearchParams({
    tenantId: params.tenantId,
    projectId: params.projectId,
    versionId: params.versionId,
  });
  if (params.revision != null) {
    qs.set('revision', String(params.revision));
  }
  if (params.edit) {
    qs.set('edit', '1');
  } else if (params.readOnly) {
    qs.set('readOnly', '1');
  }
  return `/data-designer?${qs.toString()}`;
}
