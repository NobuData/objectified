/**
 * Code generation preview: live output from studio classes (GitHub #120).
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () =>
    function MockEditor({ value }: { value?: string }) {
      return (
        <pre data-testid="monaco-editor" className="whitespace-pre-wrap text-xs">
          {value ?? ''}
        </pre>
      );
    },
}));

import CodeGenerationPreviewForm from '@/app/dashboard/components/CodeGenerationPreviewForm';

jest.mock('@/app/contexts/StudioContext', () => ({
  useStudioOptional: jest.fn(),
}));

jest.mock('@/app/contexts/WorkspaceContext', () => ({
  useWorkspaceOptional: jest.fn(() => ({
    tenant: { id: 't1' },
    project: { id: 'p1' },
  })),
}));

jest.mock('@/app/components/providers/DialogProvider', () => ({
  useDialog: () => ({
    confirm: jest.fn(() => Promise.resolve(false)),
    alert: jest.fn(() => Promise.resolve()),
  }),
}));

const { useStudioOptional } = require('@/app/contexts/StudioContext') as {
  useStudioOptional: jest.Mock;
};

describe('CodeGenerationPreviewForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows empty-schema hint when no classes', () => {
    useStudioOptional.mockReturnValue({
      state: { versionId: 'v1', classes: [] },
    });
    render(<CodeGenerationPreviewForm variant="panel" active resetVersionKey="v1" />);
    expect(screen.getByText(/Add classes on the canvas/i)).toBeInTheDocument();
  });

  it('refreshes TypeScript preview when classes change', async () => {
    const widgetClass = {
      id: 'c1',
      name: 'Widget',
      properties: [{ name: 'title', property_data: { type: 'string' } }],
    };
    useStudioOptional.mockReturnValue({
      state: { versionId: 'v1', classes: [widgetClass] },
    });
    const { rerender } = render(
      <CodeGenerationPreviewForm variant="panel" active resetVersionKey="v1" />
    );
    await waitFor(() => {
      expect(screen.getByText(/export interface Widget/i)).toBeInTheDocument();
    });

    useStudioOptional.mockReturnValue({
      state: {
        versionId: 'v1',
        classes: [
          {
            id: 'c2',
            name: 'Gadget',
            properties: [],
          },
        ],
      },
    });
    rerender(<CodeGenerationPreviewForm variant="panel" active resetVersionKey="v1" />);
    await waitFor(() => {
      expect(screen.getByText(/export interface Gadget/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/export interface Widget/i)).not.toBeInTheDocument();
  });

  describe('clipboard', () => {
    afterEach(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        configurable: true,
      });
    });

    it('copy puts preview output on clipboard', async () => {
      useStudioOptional.mockReturnValue({
        state: {
          versionId: 'v1',
          classes: [{ id: 'c1', name: 'Zap', properties: [] }],
        },
      });
      const writeText = jest.fn(() => Promise.resolve());
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });

      render(<CodeGenerationPreviewForm variant="dialog" active />);
      await waitFor(() => {
        expect(screen.getByText(/export interface Zap/i)).toBeInTheDocument();
      });
      await userEvent.click(screen.getByRole('button', { name: /^Copy$/i }));
      expect(writeText).toHaveBeenCalled();
      const pasted = writeText.mock.calls[0][0] as string;
      expect(pasted).toContain('Zap');
    });
  });
});
