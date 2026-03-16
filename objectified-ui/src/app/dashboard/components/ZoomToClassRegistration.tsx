'use client';

/**
 * Registers zoom-to-class handler with CanvasSidebarActionsContext using ReactFlow's fitView.
 * Must be rendered as a child of ReactFlow. Reference: GitHub #99.
 */

import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useCanvasSidebarActionsOptional } from '@/app/contexts/CanvasSidebarActionsContext';

export default function ZoomToClassRegistration() {
  const reactFlow = useReactFlow();
  const sidebarActions = useCanvasSidebarActionsOptional();

  useEffect(() => {
    if (!sidebarActions?.registerZoomToClass) return;
    const handler = (classId: string) => {
      const node = reactFlow.getNode(classId);
      if (node) {
        reactFlow.fitView({ nodes: [node], duration: 200, padding: 0.2 });
      }
    };
    sidebarActions.registerZoomToClass(handler);
    return () => sidebarActions.registerZoomToClass(null);
  }, [sidebarActions, reactFlow]);

  return null;
}
