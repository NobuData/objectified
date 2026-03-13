/**
 * Unit tests for StudioToolbar: visibility, button states, and keyboard shortcuts.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudioToolbar from '@/app/dashboard/components/StudioToolbar';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { accessToken: 'token' } }),
}));

jest.mock('@lib/api/rest-client', () => ({
  getRestClientOptions: () => ({}),
}));

const mockUndo = jest.fn();
const mockRedo = jest.fn();
const mockSave = jest.fn();
const mockLoadFromServer = jest.fn();
const mockCheckServerForUpdates = jest.fn();
const mockPush = jest.fn();
const mockMerge = jest.fn();

jest.mock('@/app/contexts/StudioContext', () => ({
  useStudioOptional: jest.fn(),
}));

jest.mock('@/app/contexts/WorkspaceContext', () => ({
  useWorkspaceOptional: jest.fn(() => ({
    tenant: { id: 't1' },
    project: { id: 'p1' },
    version: { id: 'v1' },
  })),
}));

const useStudioOptional =
  require('@/app/contexts/StudioContext').useStudioOptional as jest.Mock;

const studioState = {
  versionId: 'v1',
  revision: 1,
  classes: [],
  properties: [],
  canvas_metadata: null,
  groups: [],
};

describe('StudioToolbar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useStudioOptional.mockReturnValue(null);
  });

  it('renders nothing when studio context is null', () => {
    const { container } = render(<StudioToolbar />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when studio has no state', () => {
    useStudioOptional.mockReturnValue({
      state: null,
      loading: false,
      error: null,
      undo: mockUndo,
      redo: mockRedo,
      save: mockSave,
      canUndo: false,
      canRedo: false,
      isDirty: false,
      serverHasNewChanges: false,
      checkServerForUpdates: mockCheckServerForUpdates,
      loadFromServer: mockLoadFromServer,
      push: mockPush,
      merge: mockMerge,
    });
    const { container } = render(<StudioToolbar />);
    expect(container.firstChild).toBeNull();
  });

  it('renders Undo, Redo, Commit, Reset, Push, Pull, Merge when studio has state', () => {
    useStudioOptional.mockReturnValue({
      state: studioState,
      loading: false,
      error: null,
      undo: mockUndo,
      redo: mockRedo,
      save: mockSave,
      canUndo: false,
      canRedo: false,
      isDirty: false,
      serverHasNewChanges: false,
      checkServerForUpdates: mockCheckServerForUpdates,
      loadFromServer: mockLoadFromServer,
      push: mockPush,
      merge: mockMerge,
    });
    render(<StudioToolbar />);
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /redo/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /commit \(snapshot to server\)/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /reset to last committed state/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /push to another version/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /pull from server/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /merge server changes/i })
    ).toBeInTheDocument();
  });

  const defaultStudioWithState = {
    state: studioState,
    loading: false,
    error: null,
    undo: mockUndo,
    redo: mockRedo,
    save: mockSave,
    canUndo: false,
    canRedo: false,
    isDirty: false,
    serverHasNewChanges: false,
    checkServerForUpdates: mockCheckServerForUpdates,
    loadFromServer: mockLoadFromServer,
    push: mockPush,
    merge: mockMerge,
  };

  it('calls undo when Undo is clicked', async () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      canUndo: true,
    });
    render(<StudioToolbar />);
    await userEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect(mockUndo).toHaveBeenCalledTimes(1);
  });

  it('calls redo when Redo is clicked', async () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      canRedo: true,
    });
    render(<StudioToolbar />);
    await userEvent.click(screen.getByRole('button', { name: /redo/i }));
    expect(mockRedo).toHaveBeenCalledTimes(1);
  });

  it('opens commit dialog when Commit is clicked', async () => {
    useStudioOptional.mockReturnValue(defaultStudioWithState);
    render(<StudioToolbar />);
    await userEvent.click(
      screen.getByRole('button', { name: /commit \(snapshot to server\)/i })
    );
    expect(screen.getByRole('dialog', { name: /commit/i })).toBeInTheDocument();
  });

  it('submitting commit dialog calls studio.save with the typed message', async () => {
    useStudioOptional.mockReturnValue(defaultStudioWithState);
    render(<StudioToolbar />);
    await userEvent.click(
      screen.getByRole('button', { name: /commit \(snapshot to server\)/i })
    );
    const input = screen.getByRole('textbox', { name: /commit message/i });
    await userEvent.type(input, 'my commit message');
    await userEvent.click(screen.getByRole('button', { name: /^commit$/i }));
    expect(mockSave).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ message: 'my commit message' })
    );
  });

  it('commit dialog submit button is disabled while loading', async () => {
    // Render with loading=false so dialog can be opened
    useStudioOptional.mockReturnValue(defaultStudioWithState);
    const { rerender } = render(<StudioToolbar />);
    await userEvent.click(
      screen.getByRole('button', { name: /commit \(snapshot to server\)/i })
    );
    expect(screen.getByRole('dialog', { name: /commit/i })).toBeInTheDocument();
    // Switch to loading=true while dialog is open
    useStudioOptional.mockReturnValue({ ...defaultStudioWithState, loading: true });
    rerender(<StudioToolbar />);
    // When loading, button label changes to "Committing…" and is disabled
    expect(screen.getByRole('button', { name: /committing/i })).toBeDisabled();
    // The commit message input is also disabled
    expect(screen.getByRole('textbox', { name: /commit message/i })).toBeDisabled();
  });

  it('shows error when studio has error', () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      error: 'Save failed',
    });
    render(<StudioToolbar />);
    expect(screen.getByRole('alert')).toHaveTextContent('Save failed');
  });

  it('disables Undo, Redo, and Commit when loading', () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      loading: true,
      canUndo: true,
      canRedo: true,
    });
    render(<StudioToolbar />);
    expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /redo/i })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /commit \(snapshot to server\)/i })
    ).toBeDisabled();
  });

  it('shows Dirty indicator when isDirty is true', () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      isDirty: true,
    });
    render(<StudioToolbar />);
    expect(screen.getByText('Dirty')).toBeInTheDocument();
  });

  it('shows server has new changes indicator when serverHasNewChanges is true', () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      serverHasNewChanges: true,
    });
    render(<StudioToolbar />);
    expect(screen.getByText('Server has new changes')).toBeInTheDocument();
  });

  it('Undo button tooltip includes keyboard shortcut hint', () => {
    useStudioOptional.mockReturnValue(defaultStudioWithState);
    render(<StudioToolbar />);
    const undoBtn = screen.getByRole('button', { name: /undo/i });
    expect(undoBtn.getAttribute('title')).toMatch(/\+Z/);
  });

  it('Redo button tooltip includes keyboard shortcut hint', () => {
    useStudioOptional.mockReturnValue(defaultStudioWithState);
    render(<StudioToolbar />);
    const redoBtn = screen.getByRole('button', { name: /redo/i });
    expect(redoBtn.getAttribute('title')).toMatch(/\+Shift\+Z/);
  });

  it('Ctrl+Z keyboard shortcut calls undo when canUndo is true', () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      canUndo: true,
    });
    render(<StudioToolbar />);
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true });
    expect(mockUndo).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Shift+Z keyboard shortcut calls redo when canRedo is true', () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      canRedo: true,
    });
    render(<StudioToolbar />);
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(mockRedo).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Y keyboard shortcut calls redo when canRedo is true', () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      canRedo: true,
    });
    render(<StudioToolbar />);
    fireEvent.keyDown(document, { key: 'y', ctrlKey: true });
    expect(mockRedo).toHaveBeenCalledTimes(1);
  });

  it('keyboard shortcut does not call undo when canUndo is false', () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      canUndo: false,
    });
    render(<StudioToolbar />);
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true });
    expect(mockUndo).not.toHaveBeenCalled();
  });

  it('keyboard shortcut does not call redo when canRedo is false', () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      canRedo: false,
    });
    render(<StudioToolbar />);
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(mockRedo).not.toHaveBeenCalled();
  });

  it('keyboard shortcuts are disabled when loading', () => {
    useStudioOptional.mockReturnValue({
      ...defaultStudioWithState,
      loading: true,
      canUndo: true,
      canRedo: true,
    });
    render(<StudioToolbar />);
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(mockUndo).not.toHaveBeenCalled();
    expect(mockRedo).not.toHaveBeenCalled();
  });
});
