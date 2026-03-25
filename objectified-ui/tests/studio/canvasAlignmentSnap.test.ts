/**
 * Reference: GitHub #235 — alignment snap while dragging canvas nodes.
 */

import type { Node } from '@xyflow/react';
import { applyAlignmentToNodeChanges } from '@lib/studio/canvasAlignmentSnap';

function flowNode(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  kind: 'class' | 'group' = 'class'
): Node {
  return {
    id,
    type: kind,
    position: { x, y },
    data: {},
    measured: { width: w, height: h },
    style: { width: w, height: h },
  } as Node;
}

describe('applyAlignmentToNodeChanges', () => {
  it('snaps horizontally to peer edge within threshold and emits vertical guide', () => {
    const nodes = [flowNode('a', 0, 0, 100, 50), flowNode('b', 105, 0, 100, 50)];
    const changes = [
      {
        type: 'position' as const,
        id: 'b',
        position: { x: 103, y: 0 },
        dragging: true,
      },
    ];
    const { changes: out, guides } = applyAlignmentToNodeChanges(changes, nodes, {
      snapToAlignment: true,
      alignmentThresholdPx: 8,
      snapToGrid: false,
      gridSize: 16,
    });
    expect(out[0].type).toBe('position');
    if (out[0].type !== 'position') return;
    expect(out[0].position?.x).toBe(100);
    expect(guides.verticalX).toContain(100);
  });

  it('returns empty guides when drag ended', () => {
    const nodes = [flowNode('a', 0, 0, 100, 50), flowNode('b', 100, 0, 100, 50)];
    const changes = [
      {
        type: 'position' as const,
        id: 'b',
        position: { x: 100, y: 0 },
        dragging: false,
      },
    ];
    const { guides } = applyAlignmentToNodeChanges(changes, nodes, {
      snapToAlignment: true,
      alignmentThresholdPx: 8,
      snapToGrid: false,
      gridSize: 16,
    });
    expect(guides.verticalX).toHaveLength(0);
    expect(guides.horizontalY).toHaveLength(0);
  });

  it('re-applies grid snap after alignment when enabled', () => {
    const nodes = [flowNode('a', 0, 0, 100, 50), flowNode('b', 105, 0, 100, 50)];
    const changes = [
      {
        type: 'position' as const,
        id: 'b',
        position: { x: 103, y: 3 },
        dragging: true,
      },
    ];
    const { changes: out } = applyAlignmentToNodeChanges(changes, nodes, {
      snapToAlignment: true,
      alignmentThresholdPx: 8,
      snapToGrid: true,
      gridSize: 16,
    });
    if (out[0].type !== 'position') return;
    // Alignment to x=100 then grid 16 rounds to 96.
    expect(out[0].position?.x).toBe(96);
    expect(out[0].position?.y).toBe(0);
  });
});
