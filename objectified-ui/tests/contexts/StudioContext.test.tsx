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

// ─── localStorage mock ──────────────────────────────────────────────────────
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: jest.fn((key: string) => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true });
// ────────────────────────────────────────────────────────────────────────────

function TestConsumer() {
  const studio = useStudio();
  return (
    <div>
      <span data-testid="has-state">{studio.state ? 'yes' : 'no'}</span>
      <span data-testid="can-undo">{studio.canUndo ? 'yes' : 'no'}</span>
      <span data-testid="can-redo">{studio.canRedo ? 'yes' : 'no'}</span>
      <span data-testid="is-dirty">{studio.isDirty ? 'yes' : 'no'}</span>
      <span data-testid="has-unpushed-commits">{studio.hasUnpushedCommits ? 'yes' : 'no'}</span>
      <span data-testid="server-has-changes">{studio.serverHasNewChanges ? 'yes' : 'no'}</span>
      <span data-testid="class-count">
        {studio.state?.classes?.length ?? 0}
      </span>
      <span data-testid="error">{studio.error ?? ''}</span>
      <span data-testid="loading">{studio.loading ? 'yes' : 'no'}</span>
      <span data-testid="version-id">{studio.state?.versionId ?? ''}</span>
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
    localStorageMock.clear();
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

  it('hasUnpushedCommits starts false', async () => {
    mockPullVersion.mockResolvedValueOnce({
      version_id: 'v1',
      revision: 1,
      classes: [],
      canvas_metadata: null,
      pulled_at: new Date().toISOString(),
    });

    function LoadConsumer() {
      const studio = useStudio();
      React.useEffect(() => { void studio.loadFromServer('v1', {}); }, []);
      return <TestConsumer />;
    }

    render(<StudioProvider><LoadConsumer /></StudioProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('has-state').textContent).toBe('yes');
    });
    expect(screen.getByTestId('has-unpushed-commits').textContent).toBe('no');
  });

  it('hasUnpushedCommits becomes true after save and is persisted to localStorage', async () => {
    mockPullVersion.mockResolvedValueOnce({
      version_id: 'v1',
      revision: 1,
      classes: [],
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
      React.useEffect(() => { void studio.loadFromServer('v1', {}); }, []);
      return <TestConsumer />;
    }

    render(<StudioProvider><LoadAndSaveConsumer /></StudioProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('has-state').textContent).toBe('yes');
    });

    await act(async () => {
      screen.getByTestId('save').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('has-unpushed-commits').textContent).toBe('yes');
    });

    // localStorage should have been written with hasUnpushedCommits: true
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      expect.stringContaining('v1'),
      expect.stringContaining('"hasUnpushedCommits":true')
    );
  });

  it('hasUnpushedCommits becomes false after push', async () => {
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
    mockPushVersion.mockResolvedValueOnce({
      revision: 2,
      snapshot_id: 'snap2',
      version_id: 'v1',
      committed_at: new Date().toISOString(),
    });

    function LoadSaveAndPushConsumer() {
      const studio = useStudio();
      React.useEffect(() => { void studio.loadFromServer('v1', {}); }, []);
      return <TestConsumer />;
    }

    render(<StudioProvider><LoadSaveAndPushConsumer /></StudioProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('has-state').textContent).toBe('yes');
    });

    // Add a class (making dirty) then save (commit)
    await act(async () => { screen.getByTestId('add-class').click(); });
    expect(screen.getByTestId('is-dirty').textContent).toBe('yes');

    await act(async () => { screen.getByTestId('save').click(); });
    await waitFor(() => {
      expect(screen.getByTestId('has-unpushed-commits').textContent).toBe('yes');
    });
    // After save, undo stack is cleared → no longer dirty
    expect(screen.getByTestId('is-dirty').textContent).toBe('no');

    // Push → should clear hasUnpushedCommits
    await act(async () => { screen.getByTestId('push').click(); });
    await waitFor(() => {
      expect(screen.getByTestId('has-unpushed-commits').textContent).toBe('no');
    });
    // Undo/redo stacks were cleared by save; push leaves them unchanged
    expect(screen.getByTestId('can-undo').textContent).toBe('no');
    expect(screen.getByTestId('can-redo').textContent).toBe('no');

    // localStorage should have been written with hasUnpushedCommits: false
    expect(localStorageMock.setItem).toHaveBeenLastCalledWith(
      expect.stringContaining('v1'),
      expect.stringContaining('"hasUnpushedCommits":false')
    );
  });

  it('hasUnpushedCommits is restored from localStorage on loadFromServer', async () => {
    // Pre-populate localStorage with a persisted commit info
    const storageKey = 'objectified:studio:v1:lastCommit';
    localStorageMock.getItem.mockImplementationOnce((key: string) =>
      key === storageKey
        ? JSON.stringify({ revision: 1, lastCommittedAt: new Date().toISOString(), hasUnpushedCommits: true })
        : null
    );

    mockPullVersion.mockResolvedValueOnce({
      version_id: 'v1',
      revision: 1,
      classes: [],
      canvas_metadata: null,
      pulled_at: new Date().toISOString(),
    });

    function LoadConsumer() {
      const studio = useStudio();
      React.useEffect(() => { void studio.loadFromServer('v1', {}); }, []);
      return <TestConsumer />;
    }

    render(<StudioProvider><LoadConsumer /></StudioProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('has-state').textContent).toBe('yes');
    });

    // Should have restored hasUnpushedCommits = true from localStorage
    expect(screen.getByTestId('has-unpushed-commits').textContent).toBe('yes');
  });

  it('hasUnpushedCommits is not restored when persisted revision does not match loaded revision', async () => {
    // Pre-populate localStorage with a persisted commit info for a different revision
    const storageKey = 'objectified:studio:v1:lastCommit';
    localStorageMock.getItem.mockImplementationOnce((key: string) =>
      key === storageKey
        ? JSON.stringify({ revision: 5, lastCommittedAt: new Date().toISOString(), hasUnpushedCommits: true })
        : null
    );

    mockPullVersion.mockResolvedValueOnce({
      version_id: 'v1',
      revision: 1,
      classes: [],
      canvas_metadata: null,
      pulled_at: new Date().toISOString(),
    });

    function LoadConsumer() {
      const studio = useStudio();
      React.useEffect(() => { void studio.loadFromServer('v1', {}); }, []);
      return <TestConsumer />;
    }

    render(<StudioProvider><LoadConsumer /></StudioProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('has-state').textContent).toBe('yes');
    });

    // Should NOT restore hasUnpushedCommits because persisted revision (5) != loaded revision (1)
    expect(screen.getByTestId('has-unpushed-commits').textContent).toBe('no');
  });

  it('clear resets hasUnpushedCommits to false', async () => {
    mockPullVersion.mockResolvedValueOnce({
      version_id: 'v1',
      revision: 1,
      classes: [],
      canvas_metadata: null,
      pulled_at: new Date().toISOString(),
    });
    mockCommitVersion.mockResolvedValueOnce({
      revision: 2,
      snapshot_id: 'snap1',
      version_id: 'v1',
      committed_at: new Date().toISOString(),
    });

    function LoadSaveAndClearConsumer() {
      const studio = useStudio();
      React.useEffect(() => { void studio.loadFromServer('v1', {}); }, []);
      return <TestConsumer />;
    }

    render(<StudioProvider><LoadSaveAndClearConsumer /></StudioProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('has-state').textContent).toBe('yes');
    });

    await act(async () => { screen.getByTestId('save').click(); });
    await waitFor(() => {
      expect(screen.getByTestId('has-unpushed-commits').textContent).toBe('yes');
    });

    await act(async () => { screen.getByTestId('clear').click(); });
    expect(screen.getByTestId('has-unpushed-commits').textContent).toBe('no');
  });

  it('loadFromServer sets valid empty state and error on API failure', async () => {
    mockPullVersion.mockRejectedValueOnce(new Error('Network error'));

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
      expect(screen.getByTestId('error').textContent).toBe('Network error');
    });
    // State should be a valid empty state (not null)
    expect(screen.getByTestId('has-state').textContent).toBe('yes');
    expect(screen.getByTestId('version-id').textContent).toBe('v1');
    expect(screen.getByTestId('class-count').textContent).toBe('0');
    expect(screen.getByTestId('loading').textContent).toBe('no');
  });

  it('applyChange works on fallback state after loadFromServer failure', async () => {
    mockPullVersion.mockRejectedValueOnce(new Error('Connection refused'));

    function LoadAndApplyConsumer() {
      const studio = useStudio();
      React.useEffect(() => {
        void studio.loadFromServer('v1', {});
      }, []);
      return <TestConsumer />;
    }

    render(
      <StudioProvider>
        <LoadAndApplyConsumer />
      </StudioProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('has-state').textContent).toBe('yes');
      expect(screen.getByTestId('error').textContent).toBe('Connection refused');
    });

    // User should still be able to add classes on the fallback empty state
    await act(async () => {
      screen.getByTestId('add-class').click();
    });

    expect(screen.getByTestId('class-count').textContent).toBe('1');
    expect(screen.getByTestId('can-undo').textContent).toBe('yes');
  });
});
