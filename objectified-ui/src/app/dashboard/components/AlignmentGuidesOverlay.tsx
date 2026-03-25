'use client';

/**
 * Renders alignment guide lines in flow coordinates while dragging nodes.
 * Reference: GitHub #235.
 */

import { useStore, useReactFlow } from '@xyflow/react';

export interface AlignmentGuidesOverlayProps {
  verticalX: number[];
  horizontalY: number[];
}

export default function AlignmentGuidesOverlay({
  verticalX,
  horizontalY,
}: AlignmentGuidesOverlayProps) {
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const { screenToFlowPosition } = useReactFlow();

  if (verticalX.length === 0 && horizontalY.length === 0) {
    return null;
  }
  if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0) {
    return null;
  }

  const corners = [
    screenToFlowPosition({ x: 0, y: 0 }),
    screenToFlowPosition({ x: width, y: 0 }),
    screenToFlowPosition({ x: 0, y: height }),
    screenToFlowPosition({ x: width, y: height }),
  ];
  const pad = 800;
  const minX = Math.min(...corners.map((c) => c.x)) - pad;
  const maxX = Math.max(...corners.map((c) => c.x)) + pad;
  const minY = Math.min(...corners.map((c) => c.y)) - pad;
  const maxY = Math.max(...corners.map((c) => c.y)) + pad;
  const boxW = maxX - minX;
  const boxH = maxY - minY;

  const stroke = 'rgb(99 102 241 / 0.85)';

  return (
    <svg
      className="pointer-events-none absolute z-[5] overflow-visible"
      style={{ left: minX, top: minY, width: boxW, height: boxH }}
      viewBox={`${minX} ${minY} ${boxW} ${boxH}`}
      aria-hidden
    >
      {verticalX.map((x) => (
        <line
          key={`v-${x}`}
          x1={x}
          y1={minY}
          x2={x}
          y2={maxY}
          stroke={stroke}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {horizontalY.map((y) => (
        <line
          key={`h-${y}`}
          x1={minX}
          y1={y}
          x2={maxX}
          y2={y}
          stroke={stroke}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
