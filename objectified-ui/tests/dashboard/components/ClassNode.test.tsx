/**
 * Unit tests for ClassNode.
 * Reference: GitHub #79 - class node on the react-flow canvas.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
      <div
        data-testid="node-resizer"
        data-min-width={minWidth}
        data-max-width={maxWidth}
        data-min-height={minHeight}
        data-max-height={maxHeight}
      />
    ) : null,
}));

jest.mock('@radix-ui/react-scroll-area', () => ({
  Root: ({ children }: { children: React.ReactNode }) => <div data-testid="scroll-area">{children}</div>,
  Viewport: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Scrollbar: () => null,
  Thumb: () => null,
}));

jest.mock('@radix-ui/react-tooltip', () => ({
  Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Trigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
    expect(screen.getAllByText('UserAccount').length).toBeGreaterThan(0);
  });

  it('renders "Unnamed class" when name is empty', () => {
    render(<ClassNode {...makeProps({ name: '' })} />);
    expect(screen.getAllByText('Unnamed class').length).toBeGreaterThan(0);
  });

  it('renders "Unnamed class" when name is undefined', () => {
    render(<ClassNode {...makeProps({ name: undefined as unknown as string })} />);
    expect(screen.getAllByText('Unnamed class').length).toBeGreaterThan(0);
  });

  it('renders "Unnamed class" when name is null', () => {
    render(<ClassNode {...makeProps({ name: null as unknown as string })} />);
    expect(screen.getAllByText('Unnamed class').length).toBeGreaterThan(0);
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
    expect(screen.getAllByText('Collapsed').length).toBeGreaterThan(0);
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
    expect(screen.getAllByText('Simplified').length).toBeGreaterThan(0);
    expect(screen.queryByText('hiddenInSimplified')).not.toBeInTheDocument();
  });

  it('compact mode shows five properties and +N more (GitHub #230)', () => {
    render(
      <ClassNode
        {...makeProps({
          name: 'Compact',
          propertyDisplayMode: 'compact',
          properties: Array.from({ length: 8 }, (_, i) => ({
            id: `p${i}`,
            name: `field${i}`,
          })),
        })}
      />,
    );
    expect(screen.getByText('field4')).toBeInTheDocument();
    expect(screen.queryByText('field5')).not.toBeInTheDocument();
    expect(screen.getByText('+3 more')).toBeInTheDocument();
  });

  it('prefers resolvedNodeTheme for display over classNodeConfig.theme (GitHub #230)', () => {
    const { container } = render(
      <ClassNode
        {...makeProps({
          name: 'Merged',
          classNodeConfig: {
            theme: { backgroundColor: '#f0f0f0', border: '#333' },
          },
          resolvedNodeTheme: { backgroundColor: '#00ff00', border: '#ff0000' },
        })}
      />,
    );
    const wrapper = container.querySelector('div.rounded-lg') as HTMLElement;
    expect(wrapper.style.backgroundColor).toMatch(/rgb\(0,\s*255,\s*0\)|#00ff00/i);
    expect(wrapper.style.borderColor).toMatch(/#ff0000|rgb\(255,\s*0,\s*0\)/i);
  });

  it('applies borderStyle from theme (GitHub #230)', () => {
    const { container } = render(
      <ClassNode
        {...makeProps({
          classNodeConfig: {
            theme: { border: '#000', borderStyle: 'dashed' },
          },
        })}
      />,
    );
    const wrapper = container.querySelector('div.rounded-lg') as HTMLElement;
    expect(wrapper.style.borderStyle).toBe('dashed');
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

  it('passes resizeConstraints to NodeResizer (GitHub #235)', () => {
    render(
      <ClassNode
        {...makeProps(
          {
            allowResize: true,
            resizeConstraints: {
              minWidth: 200,
              maxWidth: 500,
              minHeight: 60,
              maxHeight: 500,
            },
          },
          true,
        )}
      />,
    );
    const r = screen.getByTestId('node-resizer');
    expect(r).toHaveAttribute('data-min-width', '200');
    expect(r).toHaveAttribute('data-max-width', '500');
    expect(r).toHaveAttribute('data-min-height', '60');
    expect(r).toHaveAttribute('data-max-height', '500');
  });

  it('hides NodeResizer when resizeHandleVisibility is hover until pointer enters (GitHub #235)', () => {
    render(
      <ClassNode
        {...makeProps(
          {
            allowResize: true,
            resizeHandleVisibility: 'hover',
          },
          true,
        )}
      />,
    );
    expect(screen.queryByTestId('node-resizer')).not.toBeInTheDocument();
    const card = document.querySelector('div.rounded-lg.border-2.shadow-md');
    expect(card).toBeTruthy();
    fireEvent.mouseEnter(card!);
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

  it('renders node status badges when status flags are set', () => {
    render(
      <ClassNode
        {...makeProps({
          nodeStatus: {
            isDeprecated: true,
            isNew: true,
            isModified: true,
            hasValidationErrors: true,
          },
        })}
      />,
    );
    expect(screen.getByText('Deprecated')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Modified')).toBeInTheDocument();
    expect(screen.getByText('Errors')).toBeInTheDocument();
  });

  it('full mode collapses long property lists until expanded (GitHub #231)', () => {
    render(
      <ClassNode
        {...makeProps({
          name: 'Big',
          propertyDisplayMode: 'full',
          properties: Array.from({ length: 15 }, (_, i) => ({
            id: `p${i}`,
            name: `prop${i}`,
          })),
        })}
      />,
    );
    expect(screen.getByText('prop0')).toBeInTheDocument();
    expect(screen.getByText('prop11')).toBeInTheDocument();
    expect(screen.queryByText('prop12')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show all 15 properties/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /show all 15 properties/i }));
    expect(screen.getByText('prop14')).toBeInTheDocument();
  });

  it('shows inline rename input when inlineRenameActive (GitHub #231)', () => {
    const onCommit = jest.fn();
    const onCancel = jest.fn();
    render(
      <ClassNode
        {...makeProps({
          name: 'RenameMe',
          inlineRenameActive: true,
          onInlineRenameCommit: onCommit,
          onInlineRenameCancel: onCancel,
        })}
      />,
    );
    const input = screen.getByRole('textbox', { name: /class name/i });
    expect(input).toHaveValue('RenameMe');
    fireEvent.change(input, { target: { value: 'NewName' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('node-1', 'NewName');
  });

  it('renders class summary tooltip content', () => {
    render(
      <ClassNode
        {...makeProps({
          name: 'SummaryClass',
          properties: [{ id: 'p1', name: 'id' }, { id: 'p2', name: 'code' }],
          refCount: 4,
          description: 'Summary description',
        })}
      />,
    );
    expect(screen.getByText('Properties: 2 | Refs: 4')).toBeInTheDocument();
    expect(screen.getByText('Summary description')).toBeInTheDocument();
  });
});
