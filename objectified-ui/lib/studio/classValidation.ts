import type { StudioClass } from './types';

/**
 * Returns true when a class has schema validation errors that would block a commit.
 * Checks for a missing class name or any property with a missing name.
 * This mirrors the per-class error rules applied by the pre-commit validation summary
 * in StudioToolbar, so the node Errors badge remains consistent with the commit dialog.
 */
export function classHasValidationErrors(cls: StudioClass): boolean {
  if (!(cls.name ?? '').trim()) return true;
  for (const prop of cls.properties ?? []) {
    if (!(prop.name ?? '').trim()) return true;
  }
  return false;
}
