import type { LocalVersionState } from './types';

export type SchemaMode = 'openapi' | 'sql';

const DEFAULT_SCHEMA_MODE: SchemaMode = 'openapi';
const CANVAS_METADATA_KEY = 'schema_mode';

export function getSchemaModeFromCanvasMetadata(
  canvasMetadata: Record<string, unknown> | null | undefined
): SchemaMode {
  const raw = canvasMetadata?.[CANVAS_METADATA_KEY];
  if (raw === 'openapi' || raw === 'sql') return raw;
  return DEFAULT_SCHEMA_MODE;
}

export function getSchemaMode(state: Pick<LocalVersionState, 'canvas_metadata'>): SchemaMode {
  return getSchemaModeFromCanvasMetadata(state.canvas_metadata);
}

export function setSchemaModeOnDraft(
  draft: Pick<LocalVersionState, 'canvas_metadata'>,
  mode: SchemaMode
): void {
  draft.canvas_metadata = {
    ...(draft.canvas_metadata ?? {}),
    [CANVAS_METADATA_KEY]: mode,
  };
}

