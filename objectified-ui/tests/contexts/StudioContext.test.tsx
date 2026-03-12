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
const mockPushVersion = jest.fn();
const mockMergeVersion = jest.fn();

jest.mock('@lib/api/rest-client', () => ({
  pullVersion: (...args: unknown[]) => mockPullVersion(...args),
  listProperties: (...args: unknown[]) => mockListProperties(...args),
  commitVersion: (...args: unknown[]) => mockCommitVersion(...args),
  pushVersion: (...args: unknown[]) => mockPushVersion(...args),
  mergeVersion: (...args: unknown[]) => mockMergeVersion(...args),
  getRestClientOptions: () => ({}),
}));

function TestConsumer() {
  const studio = useStudio();
  return (
    <div>
      <span data-testid="has-state">{studio.state ? 'yes' : 'no'}</span>
      <span data-testid="can-undo">{studio.canUndo ? 'yes' : 'no'}</span>
      <span data-testid="can-redo">{studio.canRedo ? 'yes' : 'no'}</span>
      <span data-testid="is-dirty">{studio.isDirty ? 'yes' : 'no'}</span>
      <span data-testid="server-has-changes">{studio.serverHasNewChanges ? 'yes' : 'no'}</span>
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
      <button
        type="button"
        onClick={() => studio.checkServerForUpdates({})}
        data-testid="check-updates"
      >
        Check updates
      </button>
      <button
        type="button"
        onClick={() => studio.push('v2', {})}
        data-testid="push"
      >
        Push
      </button>
      <button
        type="button"
        onClick={() => studio.merge({})}
        data-testid="merge"
      >
        Merge
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

  it('isDirty is true after applyChange', async () => {
    mockPullVersion.mockResolvedValueOnce({
      version_id: 'v1',
      revision: 1,
      classes: [{ id: 'c1', name: 'User', metadata: {}, properties: [] }],
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
      expect(screen.getByTestId('class-count').textContent).toBe('1');
    });

    expect(screen.getByTestId('is-dirty').textContent).toBe('no');

    await act(async () => {
      screen.getByTestId('add-class').click();
    });

    expect(screen.getByTestId('is-dirty').textContent).toBe('yes');
  });

  it('checkServerForUpdates sets serverHasNewChanges when server has newer revision', async () => {
    mockPullVersion
      .mockResolvedValueOnce({
        version_id: 'v1',
        revision: 1,
        classes: [],
        canvas_metadata: null,
        pulled_at: new Date().toISOString(),
      })
      .mockResolvedValueOnce({
        version_id: 'v1',
        revision: 2,
        classes: [],
        canvas_metadata: null,
        pulled_at: new Date().toISOString(),
        diff: null,
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

    expect(screen.getByTestId('server-has-changes').textContent).toBe('no');

    await act(async () => {
      screen.getByTestId('check-updates').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('server-has-changes').textContent).toBe('yes');
    });
  });

  it('checkServerForUpdates clears serverHasNewChanges when server is up-to-date', async () => {
    mockPullVersion
      .mockResolvedValueOnce({
        version_id: 'v1',
        revision: 2,
        classes: [],
        canvas_metadata: null,
        pulled_at: new Date().toISOString(),
      })
      // Simulate a previous check that set serverHasNewChanges to true, now cleared
      .mockResolvedValueOnce({
        version_id: 'v1',
        revision: 2,
        classes: [],
        canvas_metadata: null,
        pulled_at: new Date().toISOString(),
        diff: null,
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

    await act(async () => {
      screen.getByTestId('check-updates').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('server-has-changes').textContent).toBe('no');
    });
  });

  it('checkServerForUpdates handles revision=0 correctly (no falsy skip)', async () => {
    mockPullVersion
      .mockResolvedValueOnce({
        version_id: 'v1',
        revision: 0,
        classes: [],
        canvas_metadata: null,
        pulled_at: new Date().toISOString(),
      })
      .mockResolvedValueOnce({
        version_id: 'v1',
        revision: 1,
        classes: [],
        canvas_metadata: null,
        pulled_at: new Date().toISOString(),
        diff: null,
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

    await act(async () => {
      screen.getByTestId('check-updates').click();
    });

    // With explicit null check, revision=0 should NOT be skipped, so serverHasNewChanges=true
    await waitFor(() => {
      expect(screen.getByTestId('server-has-changes').textContent).toBe('yes');
    });
    // pullVersion should have been called twice (once for load, once for checkServerForUpdates)
    expect(mockPullVersion).toHaveBeenCalledTimes(2);
  });

  it('push calls pushVersion with the target version id', async () => {
    mockPullVersion.mockResolvedValueOnce({
      version_id: 'v1',
      revision: 1,
      classes: [{ id: 'c1', name: 'User', metadata: {}, properties: [] }],
      canvas_metadata: null,
      pulled_at: new Date().toISOString(),
    });
    mockPushVersion.mockResolvedValueOnce({
      revision: 2,
      snapshot_id: 'snap1',
      version_id: 'v1',
      committed_at: new Date().toISOString(),
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

    await act(async () => {
      screen.getByTestId('push').click();
    });

    await waitFor(() => {
      expect(mockPushVersion).toHaveBeenCalledWith(
        'v1',
        'v2',
        expect.objectContaining({ classes: expect.any(Array) }),
        {}
      );
    });
  });

  it('merge calls mergeVersion with source_version_id and reloads state', async () => {
    mockPullVersion
      .mockResolvedValueOnce({
        version_id: 'v1',
        revision: 1,
        classes: [{ id: 'c1', name: 'User', metadata: {}, properties: [] }],
        canvas_metadata: null,
        pulled_at: new Date().toISOString(),
      })
      // Reload pull after merge
      .mockResolvedValueOnce({
        version_id: 'v1',
        revision: 2,
        classes: [
          { id: 'c1', name: 'User', metadata: {}, properties: [] },
          { id: 'c2', name: 'Post', metadata: {}, properties: [] },
        ],
        canvas_metadata: null,
        pulled_at: new Date().toISOString(),
      });
    mockMergeVersion.mockResolvedValueOnce({
      revision: 2,
      snapshot_id: 'snap1',
      version_id: 'v1',
      committed_at: new Date().toISOString(),
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

    await act(async () => {
      screen.getByTestId('merge').click();
    });

    await waitFor(() => {
      expect(mockMergeVersion).toHaveBeenCalledWith(
        'v1',
        expect.objectContaining({
          strategy: 'override',
          source_version_id: 'v1',
        }),
        {}
      );
    });

    // State should be reloaded with merged result (2 classes)
    await waitFor(() => {
      expect(screen.getByTestId('class-count').textContent).toBe('2');
    });
  });
});
