'use client';

/**
 * Registers the pane context menu handler with CanvasGroupContext using useReactFlow
 * so "Create group here" can convert screen position to flow position.
 * Must be rendered as a child of ReactFlow. Reference: GitHub #83.
 */

import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useCanvasGroupOptional } from '@/app/contexts/CanvasGroupContext';

export default function PaneContextMenuRegistration() {
  const { screenToFlowPosition } = useReactFlow();
  const canvasGroup = useCanvasGroupOptional();

  useEffect(() => {
    if (!canvasGroup?.registerPaneContextMenuHandler) return;
    const handler = (event: { clientX: number; clientY: number; preventDefault?: () => void }) => {
      event.preventDefault?.();
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      canvasGroup.createGroupAtPosition(position);
    };
    canvasGroup.registerPaneContextMenuHandler(handler);
    return () => canvasGroup.registerPaneContextMenuHandler(null);
  }, [canvasGroup, screenToFlowPosition]);

  return null;
}
