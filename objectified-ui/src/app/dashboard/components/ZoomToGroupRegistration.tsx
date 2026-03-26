'use client';

/**
 * Registers zoom-to-group with CanvasSidebarActionsContext using React Flow fitView.
 * Frames the group node and all classes assigned to this group or a descendant group.
 * GitHub #238.
 */

import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { collectGroupDescendants } from '@lib/studio/canvasGroupLayout';
import type { StudioClass, StudioGroup } from '@lib/studio/types';
import { getStableClassId } from '@lib/studio/types';
import { useCanvasSidebarActionsOptional } from '@/app/contexts/CanvasSidebarActionsContext';

function buildGroupZoomNodeIds(
  groups: StudioGroup[],
  classes: StudioClass[],
  groupId: string
): { id: string }[] {
  const subtree = collectGroupDescendants(groups, groupId);
  const ids: { id: string }[] = [];
  for (const gid of subtree) {
    ids.push({ id: gid });
  }
  for (const cls of classes) {
    const gid = cls.canvas_metadata?.group;
    if (gid && subtree.has(gid)) {
      const cid = getStableClassId(cls);
      if (cid) ids.push({ id: cid });
    }
  }
  return ids;
}

export interface ZoomToGroupRegistrationProps {
  groups: StudioGroup[];
  classes: StudioClass[];
}

export default function ZoomToGroupRegistration({
  groups,
  classes,
}: ZoomToGroupRegistrationProps) {
  const reactFlow = useReactFlow();
  const sidebarActions = useCanvasSidebarActionsOptional();

  useEffect(() => {
    if (!sidebarActions?.registerZoomToGroup) return;
    const handler = (groupId: string) => {
      const nodes = buildGroupZoomNodeIds(groups, classes, groupId);
      if (nodes.length === 0) return;
      reactFlow.fitView({ nodes, duration: 200, padding: 0.2 });
    };
    sidebarActions.registerZoomToGroup(handler);
    return () => sidebarActions.registerZoomToGroup(null);
  }, [sidebarActions, reactFlow, groups, classes]);

  return null;
}
