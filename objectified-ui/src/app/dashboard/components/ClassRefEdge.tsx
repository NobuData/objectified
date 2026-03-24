'use client';

import { memo } from 'react';
import {
  BaseEdge,
  getStraightPath,
  getBezierPath,
  getSmoothStepPath,
  Position,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import type { ClassRefEdgeData, ClassRefType } from '@lib/studio/canvasClassRefEdges';
import type { CanvasEdgePathType } from '@lib/studio/canvasSettings';
import { useCanvasSettingsOptional } from '@/app/contexts/CanvasSettingsContext';

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
const THEME_STROKE = 'var(--class-ref-edge-stroke, rgb(100 116 139))'; // slate-500

/**
 * Custom edge for class-to-class refs; styled by ref type (direct/optional/weak/bidirectional).
 * Path type and stroke color from canvas settings (GitHub #94).
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
  const canvasSettings = useCanvasSettingsOptional();
  const pathType: CanvasEdgePathType =
    canvasSettings?.settings?.edgePathType ?? 'smoothstep';
  const strokeColor =
    canvasSettings?.settings?.edgeStrokeColor?.trim() || THEME_STROKE;
  const highContrast = canvasSettings?.settings?.highContrastCanvas === true;

  const edgeData = data;
  const refType: ClassRefType = edgeData?.refType ?? 'direct';
  const styleConfig = REF_TYPE_STYLE[refType];

  const srcPos = sourcePosition ?? Position.Bottom;
  const tgtPos = targetPosition ?? Position.Top;

  let path: string;
  if (pathType === 'straight') {
    [path] = getStraightPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
    });
  } else if (pathType === 'bezier') {
    [path] = getBezierPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition: srcPos,
      targetPosition: tgtPos,
    });
  } else if (pathType === 'orthogonal') {
    [path] = getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition: srcPos,
      targetPosition: tgtPos,
      borderRadius: 0,
    });
  } else {
    [path] = getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition: srcPos,
      targetPosition: tgtPos,
      borderRadius: 8,
    });
  }

  const edgeStyle = {
    stroke: strokeColor,
    strokeWidth: highContrast
      ? Math.max(styleConfig.strokeWidth + 1, 2.5)
      : styleConfig.strokeWidth,
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
