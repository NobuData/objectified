import type { RestApiError } from './rest-client';

/** Shown after route-level or API 403 messages so users know how to get access. */
export const PERMISSION_DENIED_SUGGESTION =
  'If you need access, ask a tenant administrator or platform administrator for the right permissions.';

function isGenericForbiddenMessage(msg: string): boolean {
  const m = msg.trim().toLowerCase();
  return (
    m === '' ||
    m === 'http 403' ||
    m === '403' ||
    m === 'forbidden' ||
    m === 'not allowed'
  );
}

/**
 * Builds a single user-visible string for 403 responses: API detail when useful,
 * otherwise `actionFallback`, then the standard guidance sentence.
 */
export function formatForbiddenAlertMessage(
  error: RestApiError,
  actionFallback = 'You do not have permission for this action.'
): string {
  const fromApi = error.message?.trim() ?? '';
  const base = isGenericForbiddenMessage(fromApi) ? actionFallback : fromApi;
  return `${base} ${PERMISSION_DENIED_SUGGESTION}`;
}
