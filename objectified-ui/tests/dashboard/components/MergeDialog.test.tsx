/**
 * Unit tests for MergeDialog.
 * Covers: title, source version selection, conflict list and resolution buttons.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MergeDialog from '@/app/dashboard/components/MergeDialog';

const mockLoadFromServer = jest.fn(() => Promise.resolve());
const mockClearPushConflict409 = jest.fn();

jest.mock('@/app/contexts/StudioContext', () => ({
  useStudio: jest.fn(),
}));

jest.mock('@lib/api/rest-client', () => ({
  listVersions: jest.fn(),
  mergePreview: jest.fn(),
  mergeResolve: jest.fn(),
}));

const { useStudio } = require('@/app/contexts/StudioContext') as { useStudio: jest.Mock };
const { listVersions, mergePreview, mergeResolve } = require('@lib/api/rest-client') as {
  listVersions: jest.Mock;
  mergePreview: jest.Mock;
  mergeResolve: jest.Mock;
};

const baseProps = {
  open: true,
  onOpenChange: jest.fn(),
  versionId: 'v1',
  options: { jwt: 'tok' },
  tenantId: 't1',
  projectId: 'p1',
  onApplied: jest.fn(),
};

const studioState = {
  versionId: 'v1',
  revision: 1,
  classes: [],
  properties: [],
  canvas_metadata: null,
  groups: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  useStudio.mockReturnValue({
    state: studioState,
    isDirty: false,
    loadFromServer: mockLoadFromServer,
    clearPushConflict409: mockClearPushConflict409,
  });
  listVersions.mockResolvedValue([
    { id: 'v1', name: 'Version 1' },
    { id: 'v2', name: 'Version 2' },
  ]);
});

describe('MergeDialog', () => {
  it('renders the dialog title when open', async () => {
    render(<MergeDialog {...baseProps} />);
    expect(screen.getByText('Merge versions')).toBeInTheDocument();
    await waitFor(() => expect(listVersions).toHaveBeenCalled());
  });

  it('shows source version dropdown when no initialSourceVersionId', async () => {
    render(<MergeDialog {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByLabelText(/source version/i)).toBeInTheDocument();
    });
  });

  it('shows merging from name and loads preview when initialSourceVersionId is set', async () => {
    mergePreview.mockResolvedValue({
      merged_state: { classes: [], canvas_metadata: null },
      conflicts: [],
    });
    render(<MergeDialog {...baseProps} initialSourceVersionId="v2" />);
    await waitFor(() => {
      expect(listVersions).toHaveBeenCalled();
      expect(mergePreview).toHaveBeenCalledWith(
        'v1',
        expect.objectContaining({
          source_version_id: 'v2',
          strategy: 'override',
        }),
        { jwt: 'tok' }
      );
      // Source version name should be resolved from the versions list (not 'Selected version')
      expect(screen.getByText('Version 2')).toBeInTheDocument();
    });
  });

  it('lists conflicts with Use mine, Use theirs, Edit manually buttons', async () => {
    mergePreview.mockResolvedValue({
      merged_state: { classes: [], canvas_metadata: null },
      conflicts: [
        {
          path: 'Person.description',
          description: 'Different descriptions',
          class_name: 'Person',
          property_name: 'description',
          field: 'description',
          local_value: 'Mine',
          remote_value: 'Theirs',
        },
      ],
    });
    render(<MergeDialog {...baseProps} initialSourceVersionId="v2" />);
    await waitFor(() => {
      expect(listVersions).toHaveBeenCalled();
      expect(screen.getByText('Use mine')).toBeInTheDocument();
      expect(screen.getByText('Use theirs')).toBeInTheDocument();
      expect(screen.getByText('Edit manually')).toBeInTheDocument();
    });
    expect(screen.getByText('Mine')).toBeInTheDocument();
    expect(screen.getByText('Theirs')).toBeInTheDocument();
  });

  it('shows No conflicts when preview has no conflicts', async () => {
    mergePreview.mockResolvedValue({
      merged_state: { classes: [], canvas_metadata: null },
      conflicts: [],
    });
    render(<MergeDialog {...baseProps} initialSourceVersionId="v2" />);
    await waitFor(() => {
      expect(listVersions).toHaveBeenCalled();
      expect(screen.getByText(/no conflicts/i)).toBeInTheDocument();
    });
  });
});
