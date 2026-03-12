/**
 * Unit tests for StudioToolbar: visibility and button states.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
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

jest.mock('@/app/contexts/StudioContext', () => ({
  useStudioOptional: jest.fn(),
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
    });
    const { container } = render(<StudioToolbar />);
    expect(container.firstChild).toBeNull();
  });

  it('renders Undo, Redo, Save when studio has state', () => {
    useStudioOptional.mockReturnValue({
      state: studioState,
      loading: false,
      error: null,
      undo: mockUndo,
      redo: mockRedo,
      save: mockSave,
      canUndo: false,
      canRedo: false,
    });
    render(<StudioToolbar />);
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /redo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save to server/i })).toBeInTheDocument();
  });

  it('calls undo when Undo is clicked', async () => {
    useStudioOptional.mockReturnValue({
      state: studioState,
      loading: false,
      error: null,
      undo: mockUndo,
      redo: mockRedo,
      save: mockSave,
      canUndo: true,
      canRedo: false,
    });
    render(<StudioToolbar />);
    await userEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect(mockUndo).toHaveBeenCalledTimes(1);
  });

  it('calls redo when Redo is clicked', async () => {
    useStudioOptional.mockReturnValue({
      state: studioState,
      loading: false,
      error: null,
      undo: mockUndo,
      redo: mockRedo,
      save: mockSave,
      canUndo: false,
      canRedo: true,
    });
    render(<StudioToolbar />);
    await userEvent.click(screen.getByRole('button', { name: /redo/i }));
    expect(mockRedo).toHaveBeenCalledTimes(1);
  });

  it('calls save when Save is clicked', async () => {
    useStudioOptional.mockReturnValue({
      state: studioState,
      loading: false,
      error: null,
      undo: mockUndo,
      redo: mockRedo,
      save: mockSave,
      canUndo: false,
      canRedo: false,
    });
    render(<StudioToolbar />);
    await userEvent.click(screen.getByRole('button', { name: /save to server/i }));
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('shows error when studio has error', () => {
    useStudioOptional.mockReturnValue({
      state: studioState,
      loading: false,
      error: 'Save failed',
      undo: mockUndo,
      redo: mockRedo,
      save: mockSave,
      canUndo: false,
      canRedo: false,
    });
    render(<StudioToolbar />);
    expect(screen.getByRole('alert')).toHaveTextContent('Save failed');
  });

  it('disables Undo and Redo when loading', () => {
    useStudioOptional.mockReturnValue({
      state: studioState,
      loading: true,
      error: null,
      undo: mockUndo,
      redo: mockRedo,
      save: mockSave,
      canUndo: true,
      canRedo: true,
    });
    render(<StudioToolbar />);
    expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /redo/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /save to server/i })).toBeDisabled();
  });
});
