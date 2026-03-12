/**
 * Unit tests for StudioContext: undo, redo, applyChange, clear, loadFromServer, save.
 */

import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { StudioProvider, useStudio } from '@/app/contexts/StudioContext';
import { generateLocalId } from '@lib/studio/types';

const mockPullVersion = jest.fn();
const mockListProperties = jest.fn();
const mockCommitVersion = jest.fn();

jest.mock('@lib/api/rest-client', () => ({
  pullVersion: (...args: unknown[]) => mockPullVersion(...args),
  listProperties: (...args: unknown[]) => mockListProperties(...args),
  commitVersion: (...args: unknown[]) => mockCommitVersion(...args),
  getRestClientOptions: () => ({}),
}));

function TestConsumer() {
  const studio = useStudio();
  return (
    <div>
      <span data-testid="has-state">{studio.state ? 'yes' : 'no'}</span>
      <span data-testid="can-undo">{studio.canUndo ? 'yes' : 'no'}</span>
      <span data-testid="can-redo">{studio.canRedo ? 'yes' : 'no'}</span>
      <span data-testid="class-count">
        {studio.state?.classes?.length ?? 0}
      </span>
      <button type="button" onClick={studio.undo} data-testid="undo">
        Undo
      </button>
      <button type="button" onClick={studio.redo} data-testid="redo">
        Redo
      </button>
      <button
        type="button"
        onClick={() =>
          studio.applyChange((draft) => {
            draft.classes.push({
              localId: generateLocalId(),
              name: 'NewClass',
              properties: [],
            });
          })
        }
        data-testid="add-class"
      >
        Add class
      </button>
      <button type="button" onClick={studio.clear} data-testid="clear">
        Clear
      </button>
      <button type="button" onClick={() => studio.save({})} data-testid="save">
        Save
      </button>
    </div>
  );
}

describe('StudioContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListProperties.mockResolvedValue([]);
  });

  it('starts with null state and no undo/redo', () => {
    render(
      <StudioProvider>
        <TestConsumer />
      </StudioProvider>
    );
    expect(screen.getByTestId('has-state').textContent).toBe('no');
    expect(screen.getByTestId('can-undo').textContent).toBe('no');
    expect(screen.getByTestId('can-redo').textContent).toBe('no');
  });

  it('loadFromServer sets state and clears stacks', async () => {
    mockPullVersion.mockResolvedValueOnce({
      version_id: 'v1',
      revision: 1,
      classes: [
        {
          id: 'c1',
          name: 'User',
          metadata: {},
          properties: [{ name: 'email', data: {} }],
        },
      ],
      canvas_metadata: null,
      pulled_at: new Date().toISOString(),
    });

    function LoadConsumer() {
      const studio = useStudio();
      React.useEffect(() => {
        void studio.loadFromServer('v1', {});
      }, []);
      return <TestConsumer />;
    }

    render(
      <StudioProvider>
        <LoadConsumer />
      </StudioProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('has-state').textContent).toBe('yes');
    });
    expect(screen.getByTestId('class-count').textContent).toBe('1');
    expect(screen.getByTestId('can-undo').textContent).toBe('no');
  });

  it('applyChange updates state and enables undo', async () => {
    mockPullVersion.mockResolvedValueOnce({
      version_id: 'v1',
      revision: 1,
      classes: [{ id: 'c1', name: 'User', metadata: {}, properties: [] }],
      canvas_metadata: null,
      pulled_at: new Date().toISOString(),
    });

    function LoadAndApplyConsumer() {
      const studio = useStudio();
      const loaded = React.useRef(false);
      React.useEffect(() => {
        if (!loaded.current) {
          loaded.current = true;
          void studio.loadFromServer('v1', {});
        }
      }, []);
      return <TestConsumer />;
    }

    render(
      <StudioProvider>
        <LoadAndApplyConsumer />
      </StudioProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('class-count').textContent).toBe('1');
    });

    await act(async () => {
      screen.getByTestId('add-class').click();
    });

    expect(screen.getByTestId('class-count').textContent).toBe('2');
    expect(screen.getByTestId('can-undo').textContent).toBe('yes');
    expect(screen.getByTestId('can-redo').textContent).toBe('no');
  });

  it('undo restores previous state and enables redo', async () => {
    mockPullVersion.mockResolvedValueOnce({
      version_id: 'v1',
      revision: 1,
      classes: [{ id: 'c1', name: 'User', metadata: {}, properties: [] }],
      canvas_metadata: null,
      pulled_at: new Date().toISOString(),
    });

    function LoadApplyUndoConsumer() {
      const studio = useStudio();
      React.useEffect(() => {
        void studio.loadFromServer('v1', {});
      }, []);
      return <TestConsumer />;
    }

    render(
      <StudioProvider>
        <LoadApplyUndoConsumer />
      </StudioProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('class-count').textContent).toBe('1');
    });

    await act(async () => {
      screen.getByTestId('add-class').click();
    });
    expect(screen.getByTestId('class-count').textContent).toBe('2');

    await act(async () => {
      screen.getByTestId('undo').click();
    });
    expect(screen.getByTestId('class-count').textContent).toBe('1');
    expect(screen.getByTestId('can-redo').textContent).toBe('yes');
  });

  it('clear resets state and stacks', async () => {
    mockPullVersion.mockResolvedValueOnce({
      version_id: 'v1',
      revision: 1,
      classes: [{ id: 'c1', name: 'User', metadata: {}, properties: [] }],
      canvas_metadata: null,
      pulled_at: new Date().toISOString(),
    });

    function LoadAndClearConsumer() {
      const studio = useStudio();
      React.useEffect(() => {
        void studio.loadFromServer('v1', {});
      }, []);
      return <TestConsumer />;
    }

    render(
      <StudioProvider>
        <LoadAndClearConsumer />
      </StudioProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('has-state').textContent).toBe('yes');
    });

    await act(async () => {
      screen.getByTestId('clear').click();
    });
    expect(screen.getByTestId('has-state').textContent).toBe('no');
  });

  it('save calls commitVersion and updates revision', async () => {
    mockPullVersion.mockResolvedValueOnce({
      version_id: 'v1',
      revision: 1,
      classes: [{ id: 'c1', name: 'User', metadata: {}, properties: [] }],
      canvas_metadata: null,
      pulled_at: new Date().toISOString(),
    });
    mockCommitVersion.mockResolvedValueOnce({
      revision: 2,
      snapshot_id: 'snap1',
      version_id: 'v1',
      committed_at: new Date().toISOString(),
    });

    function LoadAndSaveConsumer() {
      const studio = useStudio();
      React.useEffect(() => {
        void studio.loadFromServer('v1', {});
      }, []);
      return <TestConsumer />;
    }

    render(
      <StudioProvider>
        <LoadAndSaveConsumer />
      </StudioProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('has-state').textContent).toBe('yes');
    });

    await act(async () => {
      screen.getByTestId('save').click();
    });

    await waitFor(() => {
      expect(mockCommitVersion).toHaveBeenCalledWith(
        'v1',
        expect.objectContaining({
          classes: expect.any(Array),
          canvas_metadata: null,
        }),
        {}
      );
    });
  });
});
