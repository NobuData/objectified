/**
 * Unit tests for ClassNode.
 * Reference: GitHub #79 - class node on the react-flow canvas.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import ClassNode from '@/app/dashboard/components/ClassNode';
import type { ClassNodeType } from '@/app/dashboard/components/ClassNode';

jest.mock('@xyflow/react', () => ({
  Handle: ({ type, position, className }: { type: string; position: string; className?: string }) => (
    <div data-testid={`handle-${type}`} data-position={position} className={className} />
  ),
  Position: { Top: 'top', Bottom: 'bottom' },
  NodeResizer: ({ isVisible, minWidth, minHeight, maxWidth, maxHeight }: {
    isVisible?: boolean;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
  }) =>
    isVisible ? (
      <div data-testid="node-resizer" data-min-width={minWidth} data-max-width={maxWidth} />
    ) : null,
}));

jest.mock('@radix-ui/react-scroll-area', () => ({
  Root: ({ children }: { children: React.ReactNode }) => <div data-testid="scroll-area">{children}</div>,
  Viewport: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Scrollbar: () => null,
  Thumb: () => null,
}));

function makeProps(overrides: Partial<ClassNodeType['data']> = {}, selected = false): Parameters<typeof ClassNode>[0] {
  return {
    id: 'node-1',
    type: 'class',
    selected,
    dragging: false,
    zIndex: 1,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    data: {
      name: 'MyClass',
      properties: [],
      ...overrides,
    },
  } as unknown as Parameters<typeof ClassNode>[0];
}

describe('ClassNode', () => {
  it('renders the class name in the header', () => {
    render(<ClassNode {...makeProps({ name: 'UserAccount' })} />);
    expect(screen.getByText('UserAccount')).toBeInTheDocument();
  });

  it('renders "Unnamed class" when name is empty', () => {
    render(<ClassNode {...makeProps({ name: '' })} />);
    expect(screen.getByText('Unnamed class')).toBeInTheDocument();
  });

  it('renders "Unnamed class" when name is undefined', () => {
    render(<ClassNode {...makeProps({ name: undefined as unknown as string })} />);
    expect(screen.getByText('Unnamed class')).toBeInTheDocument();
  });

  it('renders "Unnamed class" when name is null', () => {
    render(<ClassNode {...makeProps({ name: null as unknown as string })} />);
    expect(screen.getByText('Unnamed class')).toBeInTheDocument();
  });

  it('renders each property name in the list', () => {
    render(
      <ClassNode
        {...makeProps({
          name: 'Order',
          properties: [
            { id: 'p1', name: 'orderId' },
            { id: 'p2', name: 'totalAmount' },
          ],
        })}
      />,
    );
    expect(screen.getByText('orderId')).toBeInTheDocument();
    expect(screen.getByText('totalAmount')).toBeInTheDocument();
  });

  it('renders "No properties" when the properties list is empty', () => {
    render(<ClassNode {...makeProps({ name: 'Empty', properties: [] })} />);
    expect(screen.getByText('No properties')).toBeInTheDocument();
  });

  it('applies the selected ring class when selected is true', () => {
    const { container } = render(<ClassNode {...makeProps({}, true)} />);
    const wrapper = container.querySelector('div.rounded-lg');
    expect(wrapper?.className).toContain('ring-2');
    expect(wrapper?.className).toContain('ring-indigo-500');
  });

  it('does not apply the selected ring class when selected is false', () => {
    const { container } = render(<ClassNode {...makeProps({}, false)} />);
    const wrapper = container.querySelector('div.rounded-lg');
    expect(wrapper?.className).not.toContain('ring-2');
  });

  it('renders target and source handles', () => {
    render(<ClassNode {...makeProps()} />);
    expect(screen.getByTestId('handle-target')).toBeInTheDocument();
    expect(screen.getByTestId('handle-source')).toBeInTheDocument();
  });

  it('collapses properties section when classNodeConfig.propertiesExpanded is false (GitHub #80)', () => {
    render(
      <ClassNode
        {...makeProps({
          name: 'Collapsed',
          properties: [{ id: 'p1', name: 'hiddenProp' }],
          classNodeConfig: { propertiesExpanded: false },
        })}
      />,
    );
    expect(screen.getByText('Collapsed')).toBeInTheDocument();
    expect(screen.queryByText('hiddenProp')).not.toBeInTheDocument();
  });

  it('hides the property list in simplified view mode', () => {
    render(
      <ClassNode
        {...makeProps({
          name: 'Simplified',
          properties: [{ id: 'p1', name: 'hiddenInSimplified' }],
          simplifiedView: true,
        })}
      />,
    );
    expect(screen.getByText('Simplified')).toBeInTheDocument();
    expect(screen.queryByText('hiddenInSimplified')).not.toBeInTheDocument();
  });

  it('applies theme backgroundColor and border when classNodeConfig.theme is set (GitHub #80)', () => {
    const { container } = render(
      <ClassNode
        {...makeProps({
          name: 'Themed',
          classNodeConfig: {
            theme: { backgroundColor: '#f0f0f0', border: '#333' },
          },
        })}
      />,
    );
    const wrapper = container.querySelector('div.rounded-lg') as HTMLElement;
    expect(wrapper).toBeInTheDocument();
    // Browser may normalize hex to rgb()
    expect(wrapper.style.backgroundColor).toMatch(/rgb\(240,\s*240,\s*240\)|#f0f0f0/i);
    expect(wrapper.style.borderColor).toMatch(/#333|rgb\(51,/i);
  });

  it('does not render NodeResizer when allowResize is not set (GitHub #82)', () => {
    render(<ClassNode {...makeProps({}, true)} />);
    expect(screen.queryByTestId('node-resizer')).not.toBeInTheDocument();
  });

  it('does not render NodeResizer when allowResize is true but node is not selected (GitHub #82)', () => {
    render(<ClassNode {...makeProps({ allowResize: true }, false)} />);
    expect(screen.queryByTestId('node-resizer')).not.toBeInTheDocument();
  });

  it('renders NodeResizer when allowResize is true and node is selected (GitHub #82)', () => {
    render(<ClassNode {...makeProps({ allowResize: true }, true)} />);
    expect(screen.getByTestId('node-resizer')).toBeInTheDocument();
  });

  it('removes max-w-[280px] constraint from container when allowResize is true (GitHub #82)', () => {
    const { container } = render(
      <ClassNode {...makeProps({ allowResize: true }, false)} />,
    );
    const wrapper = container.querySelector('div.rounded-lg');
    expect(wrapper?.className).not.toContain('max-w-[280px]');
    expect(wrapper?.className).not.toContain('overflow-hidden');
  });

  it('applies max-w-[280px] and overflow-hidden when allowResize is false (GitHub #82)', () => {
    const { container } = render(<ClassNode {...makeProps({}, false)} />);
    const wrapper = container.querySelector('div.rounded-lg');
    expect(wrapper?.className).toContain('max-w-[280px]');
    expect(wrapper?.className).toContain('overflow-hidden');
  });
});
