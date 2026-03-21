/**
 * Shareable dashboard URLs that resolve workspace context (GitHub #188).
 * These routes redirect into the Data Designer with query parameters.
 */
export function dashboardProjectVersionPath(projectId: string, versionId: string): string {
  return `/dashboard/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}`;
}
