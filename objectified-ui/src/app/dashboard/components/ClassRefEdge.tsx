'use client';

import { memo } from 'react';
import {
  BaseEdge,
  getSmoothStepPath,
  Position,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import type { ClassRefEdgeData, ClassRefType } from '@lib/studio/canvasClassRefEdges';

/** Stroke style by ref type (GitHub #81). */
const REF_TYPE_STYLE: Record<
  ClassRefType,
  { strokeDasharray: string; strokeWidth: number; markerEnd?: boolean; markerStart?: boolean }
> = {
  direct: { strokeDasharray: 'none', strokeWidth: 2, markerEnd: true, markerStart: false },
  optional: { strokeDasharray: '8 4', strokeWidth: 2, markerEnd: true, markerStart: false },
  weak: { strokeDasharray: '2 3', strokeWidth: 1.5, markerEnd: true, markerStart: false },
  bidirectional: {
    strokeDasharray: 'none',
    strokeWidth: 2,
    markerEnd: true,
    markerStart: true,
  },
};

/** Default edge color (theme-aware via class). */
const STROKE_COLOR = 'var(--class-ref-edge-stroke, rgb(100 116 139))'; // slate-500

/**
 * Custom edge for class-to-class refs; styled by ref type (direct/optional/weak/bidirectional).
 * Uses a wide invisible path for easier selection/hover. Reference: GitHub #81.
 */
function ClassRefEdgeComponent({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  markerStart,
}: EdgeProps<Edge<ClassRefEdgeData>>) {
  const edgeData = data;
  const refType: ClassRefType = edgeData?.refType ?? 'direct';
  const styleConfig = REF_TYPE_STYLE[refType];

  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition: sourcePosition ?? Position.Bottom,
    targetPosition: targetPosition ?? Position.Top,
    borderRadius: 8,
  });

  const edgeStyle = {
    stroke: STROKE_COLOR,
    strokeWidth: styleConfig.strokeWidth,
    strokeDasharray: styleConfig.strokeDasharray,
    fill: 'none',
  };

  return (
    <BaseEdge
      path={path}
      style={edgeStyle}
      markerEnd={styleConfig.markerEnd ? markerEnd : undefined}
      markerStart={styleConfig.markerStart ? markerStart : undefined}
      interactionWidth={20}
    />
  );
}

const ClassRefEdge = memo(ClassRefEdgeComponent);
export default ClassRefEdge;
