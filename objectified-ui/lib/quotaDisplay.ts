/** Helpers for tenant project / version quota UI (GitHub #199). */

export type QuotaSeverity = 'ok' | 'warn' | 'block';

export function quotaSeverity(
  max: number | null | undefined,
  count: number
): QuotaSeverity {
  if (max == null) return 'ok';
  if (max <= 0) return 'block';
  if (count >= max) return 'block';
  if (count >= max - 1) return 'warn';
  return 'ok';
}

export function formatUsageLine(
  label: string,
  count: number,
  max: number | null | undefined
): string {
  if (max == null) {
    return `${label}: ${count}`;
  }
  return `${label}: ${count} / ${max}`;
}

export function atQuotaLimit(
  max: number | null | undefined,
  count: number | null | undefined
): boolean {
  if (max == null || count == null) return false;
  return count >= max;
}
