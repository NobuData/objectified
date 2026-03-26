'use client';

import { memo, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  getBezierPath,
  getSmoothStepPath,
  Position,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import type {
  ClassRefEdgeData,
  ClassRefType,
  ClassRelationshipKind,
} from '@lib/studio/canvasClassRefEdges';
import type { CanvasEdgePathType, CanvasEdgeLabelMode } from '@lib/studio/canvasSettings';
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

const THEME_STROKE = 'var(--class-ref-edge-stroke, rgb(100 116 139))';
const SCHEMA_REF_STROKE = THEME_STROKE;
const ID_REF_STROKE = 'var(--class-ref-edge-id-stroke, rgb(79 70 229))';
const BROKEN_STROKE = 'var(--class-ref-edge-broken-stroke, rgb(220 38 38))';

function resolveStrokeColor(
  edgeData: ClassRefEdgeData | undefined,
  fallback: string,
  sqlModeDistinctIdRef: boolean
): string {
  if (edgeData?.brokenRef) return BROKEN_STROKE;
  if (sqlModeDistinctIdRef && edgeData?.refBinding === 'idRef') return ID_REF_STROKE;
  return fallback;
}

function resolveDashArray(
  refType: ClassRefType,
  edgeData: ClassRefEdgeData | undefined,
  baseDash: string,
  sqlModeDistinctIdRef: boolean
): string {
  if (edgeData?.brokenRef) return '5 4';
  if (sqlModeDistinctIdRef && edgeData?.refBinding === 'idRef') return '12 4';
  return baseDash;
}

/** Shift endpoints perpendicular to the chord so parallel edges separate (GitHub #233). */
function offsetEndpoints(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  offsetPx: number
): { sx: number; sy: number; tx: number; ty: number } {
  if (!offsetPx) {
    return { sx: sourceX, sy: sourceY, tx: targetX, ty: targetY };
  }
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.hypot(dx, dy) || 1;
  const ox = (-dy / len) * offsetPx;
  const oy = (dx / len) * offsetPx;
  return {
    sx: sourceX + ox,
    sy: sourceY + oy,
    tx: targetX + ox,
    ty: targetY + oy,
  };
}

function buildEdgeLabelText(edgeData: ClassRefEdgeData | undefined): string {
  if (!edgeData) return '';
  const parts: string[] = [];
  const name = edgeData.label?.trim();
  if (name) parts.push(name);
  const card = edgeData.cardinalityLabel?.trim();
  if (card) parts.push(card);
  const kind = edgeData.relationshipKind;
  if (kind && kind !== 'association' && kind !== 'inheritance') {
    parts.push(kind);
  }
  return parts.join(' · ');
}

/**
 * Custom edge for class-to-class refs; styled by ref type, binding, relationship, and broken state.
 * Labels and path from canvas settings (GitHub #94, #232).
 */
function ClassRefEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  markerStart,
  selected = false,
}: EdgeProps<Edge<ClassRefEdgeData>>) {
  const canvasSettings = useCanvasSettingsOptional();
  const sqlModeDistinctIdRef = data?.sqlModeDistinctIdRef === true;

  const pathType: CanvasEdgePathType =
    canvasSettings?.settings?.edgePathType ?? 'smoothstep';
  const edgeLabelMode: CanvasEdgeLabelMode =
    canvasSettings?.settings?.edgeLabelMode ?? 'hover';
  const themeStroke =
    canvasSettings?.settings?.edgeStrokeColor?.trim() || SCHEMA_REF_STROKE;
  const highContrast = canvasSettings?.settings?.highContrastCanvas === true;

  const edgeData = data;
  const refType: ClassRefType = edgeData?.refType ?? 'direct';
  const relationshipKind: ClassRelationshipKind =
    edgeData?.relationshipKind ?? 'association';
  const styleConfig = REF_TYPE_STYLE[refType];
  const [hovered, setHovered] = useState(false);
  const [a11yFocused, setA11yFocused] = useState(false);

  const srcPos = sourcePosition ?? Position.Bottom;
  const tgtPos = targetPosition ?? Position.Top;

  const parallelOffset = edgeData?.parallelOffset ?? 0;
  const { sx, sy, tx, ty } = offsetEndpoints(
    sourceX,
    sourceY,
    targetX,
    targetY,
    parallelOffset
  );

  let path: string;
  let labelX: number;
  let labelY: number;

  if (pathType === 'straight') {
    const straight = getStraightPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty });
    path = straight[0];
    labelX = (sx + tx) / 2;
    labelY = (sy + ty) / 2;
  } else if (pathType === 'bezier') {
    const bezier = getBezierPath({
      sourceX: sx,
      sourceY: sy,
      targetX: tx,
      targetY: ty,
      sourcePosition: srcPos,
      targetPosition: tgtPos,
    });
    path = bezier[0];
    labelX = bezier[1];
    labelY = bezier[2];
  } else if (pathType === 'orthogonal') {
    const step = getSmoothStepPath({
      sourceX: sx,
      sourceY: sy,
      targetX: tx,
      targetY: ty,
      sourcePosition: srcPos,
      targetPosition: tgtPos,
      borderRadius: 0,
    });
    path = step[0];
    labelX = step[1];
    labelY = step[2];
  } else {
    const smooth = getSmoothStepPath({
      sourceX: sx,
      sourceY: sy,
      targetX: tx,
      targetY: ty,
      sourcePosition: srcPos,
      targetPosition: tgtPos,
      borderRadius: 8,
    });
    path = smooth[0];
    labelX = smooth[1];
    labelY = smooth[2];
  }

  const strokeColor = resolveStrokeColor(edgeData, themeStroke, sqlModeDistinctIdRef);
  const dash = resolveDashArray(
    refType,
    edgeData,
    styleConfig.strokeDasharray,
    sqlModeDistinctIdRef
  );
  let strokeWidth =
    styleConfig.strokeWidth +
    (relationshipKind === 'composition' ? 1 : 0) +
    (relationshipKind === 'aggregation' ? 0.5 : 0) +
    (selected ? 1.25 : 0);

  if (highContrast) {
    strokeWidth = Math.max(strokeWidth + 1, 2.5);
  }

  const edgeDim = edgeData?.searchDimmed === true;
  const edgeStyle = {
    stroke: strokeColor,
    strokeWidth,
    strokeDasharray: dash === 'none' ? undefined : dash,
    fill: 'none',
    opacity: edgeDim ? 0.35 : 1,
    filter: selected ? 'drop-shadow(0 0 2px rgb(99 102 241 / 0.85))' : undefined,
  };

  const labelText = buildEdgeLabelText(edgeData);
  const showLabel =
    labelText.length > 0 &&
    (edgeLabelMode === 'always' || (edgeLabelMode === 'hover' && hovered));

  const a11yLabel =
    edgeData?.a11yEdgeLabel?.trim() ||
    (labelText ? `Relationship: ${labelText}` : 'Class relationship edge');
  const allowEdgeTabStop = edgeData?.a11yAllowTabStop === true;
  const onEdgeA11yFocus = edgeData?.onEdgeA11yFocus;

  return (
    <g
      role="presentation"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <BaseEdge
        id={id}
        path={path}
        style={edgeStyle}
        markerEnd={styleConfig.markerEnd ? markerEnd : undefined}
        markerStart={styleConfig.markerStart ? markerStart : undefined}
        interactionWidth={20}
      />
      {allowEdgeTabStop ? (
        <path
          d={path}
          fill="none"
          stroke={a11yFocused ? 'rgb(99 102 241)' : 'transparent'}
          strokeOpacity={a11yFocused ? 0.45 : 0}
          strokeWidth={Math.max(28, strokeWidth + 18)}
          strokeLinecap="round"
          pointerEvents="none"
          className="outline-none"
          tabIndex={0}
          aria-label={a11yLabel}
          onFocus={(e) => {
            e.stopPropagation();
            setA11yFocused(true);
            onEdgeA11yFocus?.(id);
          }}
          onBlur={() => setA11yFocused(false)}
        />
      ) : null}
      {showLabel ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-slate-800 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-900/90 dark:text-slate-100 dark:ring-slate-600/80 max-w-[200px] truncate"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            {labelText}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </g>
  );
}

const ClassRefEdge = memo(ClassRefEdgeComponent);
export default ClassRefEdge;
