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

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    data: { accessToken: 'test-token' },
    status: 'authenticated',
  })),
}));

jest.mock('@lib/api/rest-client', () => ({
  listVersions: jest.fn().mockResolvedValue([]),
  listClassesWithPropertiesAndTags: jest.fn().mockResolvedValue([]),
  getRestClientOptions: jest.fn(() => ({})),
}));

import CodeGenerationPreviewForm from '@/app/dashboard/components/CodeGenerationPreviewForm';

jest.mock('@/app/contexts/StudioContext', () => ({
  useStudioOptional: jest.fn(),
}));

jest.mock('@/app/contexts/WorkspaceContext', () => ({
  /** No tenant/project: skip tagged-version fetch (avoids async act in unit tests). */
  useWorkspaceOptional: jest.fn(() => ({
    tenant: null,
    project: null,
  })),
}));

jest.mock('@/app/components/providers/DialogProvider', () => ({
  useDialog: jest.fn(() => ({
    confirm: jest.fn(() => Promise.resolve(false)),
    alert: jest.fn(() => Promise.resolve()),
  })),
}));

const { useStudioOptional } = require('@/app/contexts/StudioContext') as {
  useStudioOptional: jest.Mock;
};
describe('CodeGenerationPreviewForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore default workspace mock (no tenant/project) so base tests stay isolated
    const { useWorkspaceOptional } = require('@/app/contexts/WorkspaceContext') as {
      useWorkspaceOptional: jest.Mock;
    };
    useWorkspaceOptional.mockReturnValue({ tenant: null, project: null });
    const { useDialog } = require('@/app/components/providers/DialogProvider') as {
      useDialog: jest.Mock;
    };
    useDialog.mockReturnValue({
      confirm: jest.fn(() => Promise.resolve(false)),
      alert: jest.fn(() => Promise.resolve()),
    });
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

  describe('tagged schema source', () => {
    const taggedVersion = {
      id: 'v-tagged',
      name: 'Release 1',
      code_generation_tag: 'api-v1',
      project_id: 'p1',
      enabled: true,
    };

    beforeEach(() => {
      // Patch JSDOM for Radix UI pointer-event interactions
      Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
        value: jest.fn().mockReturnValue(false),
        configurable: true,
        writable: true,
      });
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        value: jest.fn(),
        configurable: true,
        writable: true,
      });

      const { useWorkspaceOptional } = require('@/app/contexts/WorkspaceContext') as {
        useWorkspaceOptional: jest.Mock;
      };
      useWorkspaceOptional.mockReturnValue({
        tenant: { id: 't1' },
        project: { id: 'p1' },
      });

      useStudioOptional.mockReturnValue({
        state: { versionId: 'v1', classes: [] },
      });
    });

    it('calls listVersions with tenant and project when active', async () => {
      const { listVersions } = require('@lib/api/rest-client') as {
        listVersions: jest.Mock;
      };
      listVersions.mockResolvedValue([taggedVersion]);

      render(<CodeGenerationPreviewForm variant="panel" active resetVersionKey="v1" />);

      await waitFor(() => {
        expect(listVersions).toHaveBeenCalledWith('t1', 'p1', expect.any(Object));
      });
    });

    it('shows loading indicator while fetching tagged-version classes', async () => {
      const { listVersions, listClassesWithPropertiesAndTags } = require('@lib/api/rest-client') as {
        listVersions: jest.Mock;
        listClassesWithPropertiesAndTags: jest.Mock;
      };
      listVersions.mockResolvedValue([taggedVersion]);
      // never resolves — simulates in-flight request
      listClassesWithPropertiesAndTags.mockReturnValue(new Promise(() => {}));

      render(<CodeGenerationPreviewForm variant="panel" active resetVersionKey="v1" />);

      // Wait for the tagged-version list to be populated
      await waitFor(() => expect(listVersions).toHaveBeenCalled());

      // Open the schema-source combobox and select the tagged version
      const trigger = await screen.findByTestId('schema-source-select');
      await userEvent.click(trigger);
      const option = screen.getByRole('option', { name: /api-v1/i });
      await userEvent.click(option);

      await waitFor(() => {
        expect(screen.getByTestId('monaco-editor')).toHaveTextContent(
          /Loading schema from tagged version/i
        );
      });
    });

    it('previews classes from the tagged version after successful load', async () => {
      const { listVersions, listClassesWithPropertiesAndTags } = require('@lib/api/rest-client') as {
        listVersions: jest.Mock;
        listClassesWithPropertiesAndTags: jest.Mock;
      };
      listVersions.mockResolvedValue([taggedVersion]);
      listClassesWithPropertiesAndTags.mockResolvedValue([
        { id: 'c1', version_id: 'v-tagged', name: 'Invoice', properties: [], tags: [] },
      ]);

      render(<CodeGenerationPreviewForm variant="panel" active resetVersionKey="v1" />);

      const trigger = await screen.findByTestId('schema-source-select');
      await userEvent.click(trigger);
      const option = screen.getByRole('option', { name: /api-v1/i });
      await userEvent.click(option);

      await waitFor(() => {
        expect(screen.getByTestId('monaco-editor')).toHaveTextContent(/export interface Invoice/i);
      });
    });

    it('falls back to canvas preview when loading tagged-version classes fails', async () => {
      const { listVersions, listClassesWithPropertiesAndTags } = require('@lib/api/rest-client') as {
        listVersions: jest.Mock;
        listClassesWithPropertiesAndTags: jest.Mock;
      };
      listVersions.mockResolvedValue([taggedVersion]);
      listClassesWithPropertiesAndTags.mockRejectedValue(new Error('Network error'));

      render(<CodeGenerationPreviewForm variant="panel" active resetVersionKey="v1" />);

      const trigger = await screen.findByTestId('schema-source-select');
      await userEvent.click(trigger);
      const option = screen.getByRole('option', { name: /api-v1/i });
      await userEvent.click(option);

      // After the error, schemaSourceId resets to 'canvas' → shows canvas hint
      await waitFor(() => {
        expect(screen.getByTestId('monaco-editor')).toHaveTextContent(
          /Add classes on the canvas/i
        );
      });
    });
  });
});
