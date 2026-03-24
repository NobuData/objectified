/**
 * Tests for versionArchiveConfirm utilities:
 * countBranchVersionsFromSource, resolveVersionArchiveImpact, VersionArchiveConfirmMessage.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  countBranchVersionsFromSource,
  resolveVersionArchiveImpact,
  VersionArchiveConfirmMessage,
} from '@/app/dashboard/utils/versionArchiveConfirm';
import type { VersionSchema } from '@lib/api/rest-client';

jest.mock('@lib/api/rest-client', () => ({
  listVersions: jest.fn(),
  getVersion: jest.fn(),
}));

import { listVersions, getVersion } from '@lib/api/rest-client';
const mockListVersions = listVersions as jest.Mock;
const mockGetVersion = getVersion as jest.Mock;

function makeVersion(overrides: Partial<VersionSchema> = {}): VersionSchema {
  return {
    id: 'v1',
    name: 'Version 1',
    description: null,
    project_id: 'p1',
    tenant_id: 't1',
    source_version_id: null,
    last_revision: null,
    enabled: true,
    archived: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    change_log: null,
    code_generation_tag: null,
    ...overrides,
  } as VersionSchema;
}

describe('countBranchVersionsFromSource', () => {
  it('returns 0 when no versions branch from the source', () => {
    const versions = [
      makeVersion({ id: 'v1', source_version_id: null }),
      makeVersion({ id: 'v2', source_version_id: null }),
    ];
    expect(countBranchVersionsFromSource(versions, 'v1')).toBe(0);
  });

  it('counts versions that have source_version_id matching the given id', () => {
    const versions = [
      makeVersion({ id: 'v1', source_version_id: null }),
      makeVersion({ id: 'v2', source_version_id: 'v1' }),
      makeVersion({ id: 'v3', source_version_id: 'v1' }),
      makeVersion({ id: 'v4', source_version_id: 'v2' }),
    ];
    expect(countBranchVersionsFromSource(versions, 'v1')).toBe(2);
  });

  it('returns 0 for an empty list', () => {
    expect(countBranchVersionsFromSource([], 'v1')).toBe(0);
  });
});

describe('resolveVersionArchiveImpact', () => {
  const opts = {};

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses projectVersions when provided to compute branchCount and lastRevision', async () => {
    const versions = [
      makeVersion({ id: 'v1', last_revision: 5, source_version_id: null }),
      makeVersion({ id: 'v2', source_version_id: 'v1' }),
      makeVersion({ id: 'v3', source_version_id: 'v1' }),
    ];
    const impact = await resolveVersionArchiveImpact('v1', {
      projectVersions: versions,
      options: opts,
    });
    expect(impact.branchCount).toBe(2);
    expect(impact.lastRevision).toBe(5);
    expect(mockListVersions).not.toHaveBeenCalled();
    expect(mockGetVersion).not.toHaveBeenCalled();
  });

  it('returns null lastRevision when last_revision is 0 or null in projectVersions', async () => {
    const versions = [makeVersion({ id: 'v1', last_revision: 0 })];
    const impact = await resolveVersionArchiveImpact('v1', {
      projectVersions: versions,
      options: opts,
    });
    expect(impact.lastRevision).toBeNull();
  });

  it('falls back to listVersions when projectVersions is not provided but tenantId/projectId are', async () => {
    const versions = [
      makeVersion({ id: 'v1', last_revision: 3, source_version_id: null }),
      makeVersion({ id: 'v2', source_version_id: 'v1' }),
    ];
    mockListVersions.mockResolvedValueOnce(versions);
    const impact = await resolveVersionArchiveImpact('v1', {
      tenantId: 't1',
      projectId: 'p1',
      options: opts,
    });
    expect(mockListVersions).toHaveBeenCalledWith('t1', 'p1', opts);
    expect(impact.branchCount).toBe(1);
    expect(impact.lastRevision).toBe(3);
  });

  it('falls back to getVersion when no projectVersions and no tenantId/projectId', async () => {
    mockGetVersion.mockResolvedValueOnce(makeVersion({ id: 'v1', last_revision: 7 }));
    const impact = await resolveVersionArchiveImpact('v1', { options: opts });
    expect(mockGetVersion).toHaveBeenCalledWith('v1', opts);
    expect(impact.branchCount).toBe(0);
    expect(impact.lastRevision).toBe(7);
  });
});

describe('VersionArchiveConfirmMessage', () => {
  it('renders the version name', () => {
    render(
      <VersionArchiveConfirmMessage
        displayName="my-version"
        lastRevision={null}
        branchCount={0}
      />
    );
    expect(screen.getByText(/my-version/)).toBeInTheDocument();
  });

  it('shows revision count when lastRevision is provided', () => {
    render(
      <VersionArchiveConfirmMessage
        displayName="my-version"
        lastRevision={4}
        branchCount={0}
      />
    );
    expect(screen.getByText(/4/)).toBeInTheDocument();
    expect(screen.getByText(/committed revision/)).toBeInTheDocument();
  });

  it('does not show revision count when lastRevision is null', () => {
    render(
      <VersionArchiveConfirmMessage
        displayName="my-version"
        lastRevision={null}
        branchCount={0}
      />
    );
    expect(screen.queryByText(/committed revision/)).not.toBeInTheDocument();
  });

  it('shows branch cascade warning when branchCount is greater than 0', () => {
    render(
      <VersionArchiveConfirmMessage
        displayName="my-version"
        lastRevision={null}
        branchCount={3}
      />
    );
    const warning = screen.getByRole('status');
    expect(warning).toBeInTheDocument();
    expect(warning).toHaveTextContent(/3 other versions in this project branch from this one/);
  });

  it('uses singular phrasing in branch warning when branchCount is 1', () => {
    render(
      <VersionArchiveConfirmMessage
        displayName="my-version"
        lastRevision={null}
        branchCount={1}
      />
    );
    const warning = screen.getByRole('status');
    expect(warning).toHaveTextContent(/One other version in this project branches from this one/);
  });

  it('does not show branch cascade warning when branchCount is 0', () => {
    render(
      <VersionArchiveConfirmMessage
        displayName="my-version"
        lastRevision={null}
        branchCount={0}
      />
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
