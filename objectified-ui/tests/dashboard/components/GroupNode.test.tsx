/**
 * Unit tests for GroupNode (GitHub #238 — expand/collapse control).
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GroupNode from '@/app/dashboard/components/GroupNode';
import type { GroupNodeType } from '@/app/dashboard/components/GroupNode';

jest.mock('@xyflow/react', () => ({
  NodeResizer: ({ isVisible }: { isVisible?: boolean }) =>
    isVisible ? <div data-testid="node-resizer" /> : null,
}));

function makeProps(
  overrides: Partial<GroupNodeType['data']> = {},
  selected = false
): Parameters<typeof GroupNode>[0] {
  return {
    id: 'group-1',
    type: 'group',
    selected,
    dragging: false,
    zIndex: 1,
    isConnectable: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    data: {
      label: 'MyGroup',
      groupMetadata: {},
      ...overrides,
    },
  } as unknown as Parameters<typeof GroupNode>[0];
}

describe('GroupNode', () => {
  it('calls onToggleCollapse when collapse control is used', () => {
    const onToggleCollapse = jest.fn();
    render(
      <GroupNode
        {...makeProps({
          groupMetadata: { collapsed: false },
          onToggleCollapse,
        })}
      />
    );
    const btn = screen.getByRole('button', { name: /collapse group mygroup/i });
    fireEvent.click(btn);
    expect(onToggleCollapse).toHaveBeenCalledWith('group-1');
  });

  it('shows expand label when collapsed', () => {
    render(
      <GroupNode
        {...makeProps({
          groupMetadata: { collapsed: true },
          onToggleCollapse: jest.fn(),
        })}
      />
    );
    expect(screen.getByRole('button', { name: /expand group mygroup/i })).toBeInTheDocument();
  });
});
