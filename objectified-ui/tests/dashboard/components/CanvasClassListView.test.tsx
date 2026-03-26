/**
 * Unit tests for CanvasClassListView.
 * Reference: GitHub #236 — Canvas keyboard, screen reader, and class list.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CanvasClassListView from '@/app/dashboard/components/CanvasClassListView';
import type { CanvasClassListViewProps } from '@/app/dashboard/components/CanvasClassListView';
import type { StudioClass } from '@lib/studio/types';

function makeClass(id: string, name: string, propCount = 0): StudioClass {
  return {
    id,
    name,
    properties: Array.from({ length: propCount }, (_, i) => ({
      id: `${id}-p${i}`,
      name: `prop${i}`,
    })),
  };
}

function makeProps(overrides: Partial<CanvasClassListViewProps> = {}): CanvasClassListViewProps {
  return {
    classes: [],
    selectedClassIds: new Set(),
    onSelectClassId: jest.fn(),
    onAnnounce: jest.fn(),
    ...overrides,
  };
}

describe('CanvasClassListView', () => {
  it('renders a row for each class', () => {
    const classes = [makeClass('c1', 'Alpha'), makeClass('c2', 'Beta')];
    render(<CanvasClassListView {...makeProps({ classes })} />);
    expect(screen.getByRole('button', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Beta' })).toBeInTheDocument();
  });

  it('renders "Unnamed class" for a class with an empty name', () => {
    const classes = [{ id: 'c1', name: '' } as StudioClass];
    render(<CanvasClassListView {...makeProps({ classes })} />);
    expect(screen.getByRole('button', { name: 'Unnamed class' })).toBeInTheDocument();
  });

  it('renders the property count in the second column', () => {
    const classes = [makeClass('c1', 'Order', 5)];
    render(<CanvasClassListView {...makeProps({ classes })} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('applies selected styling and aria-selected to the selected row', () => {
    const classes = [makeClass('c1', 'Sel'), makeClass('c2', 'Unsel')];
    const selectedClassIds = new Set(['c1']);
    render(<CanvasClassListView {...makeProps({ classes, selectedClassIds })} />);
    const selRow = screen.getByRole('button', { name: 'Sel' }).closest('tr');
    const unselRow = screen.getByRole('button', { name: 'Unsel' }).closest('tr');
    expect(selRow).toHaveAttribute('aria-selected', 'true');
    expect(unselRow).toHaveAttribute('aria-selected', 'false');
    expect(selRow?.className).toContain('indigo');
    expect(unselRow?.className).not.toContain('indigo');
  });

  it('calls onSelectClassId with the class id when a row button is clicked', () => {
    const onSelectClassId = jest.fn();
    const classes = [makeClass('c1', 'Alpha')];
    render(<CanvasClassListView {...makeProps({ classes, onSelectClassId })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    expect(onSelectClassId).toHaveBeenCalledWith('c1');
  });

  it('calls onAnnounce with the class name when a row button is clicked', () => {
    const onAnnounce = jest.fn();
    const classes = [makeClass('c1', 'Alpha')];
    render(<CanvasClassListView {...makeProps({ classes, onAnnounce })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    expect(onAnnounce).toHaveBeenCalledWith('Selected class Alpha');
  });

  it('calls onAnnounce with "Unnamed class" for a class with empty name', () => {
    const onAnnounce = jest.fn();
    const classes = [{ id: 'c1', name: '' } as StudioClass];
    render(<CanvasClassListView {...makeProps({ classes, onAnnounce })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Unnamed class' }));
    expect(onAnnounce).toHaveBeenCalledWith('Selected class Unnamed class');
  });

  it('does not throw when onAnnounce is not provided', () => {
    const classes = [makeClass('c1', 'Alpha')];
    expect(() => {
      render(
        <CanvasClassListView
          classes={classes}
          selectedClassIds={new Set()}
          onSelectClassId={jest.fn()}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    }).not.toThrow();
  });

  it('renders a table with an accessible caption', () => {
    render(<CanvasClassListView {...makeProps()} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    // caption is sr-only but present in accessibility tree
    expect(screen.getByText(/Classes on this schema/i)).toBeInTheDocument();
  });

  it('renders empty tbody when classes list is empty', () => {
    const { container } = render(<CanvasClassListView {...makeProps({ classes: [] })} />);
    const tbody = container.querySelector('tbody');
    expect(tbody).toBeInTheDocument();
    expect(tbody!.children).toHaveLength(0);
  });
});
