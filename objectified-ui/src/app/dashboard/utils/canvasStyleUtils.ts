/**
 * UI-layer utilities for mapping canvas settings to React Flow display values.
 * Centralises the CanvasGridStyle → BackgroundVariant mapping used by both
 * DesignCanvas and CanvasSettingsDialog.
 *
 * Reference: GitHub #94 — Add canvas settings form
 */

import { BackgroundVariant } from '@xyflow/react';
import type { CanvasGridStyle } from '@lib/studio/canvasSettings';

/** Maps a CanvasGridStyle to the corresponding React Flow BackgroundVariant. */
const GRID_STYLE_VARIANT: Record<CanvasGridStyle, BackgroundVariant> = {
  dots: BackgroundVariant.Dots,
  lines: BackgroundVariant.Lines,
  cross: BackgroundVariant.Cross,
};

export function gridStyleToBackgroundVariant(style: CanvasGridStyle): BackgroundVariant {
  return GRID_STYLE_VARIANT[style] ?? BackgroundVariant.Dots;
}
