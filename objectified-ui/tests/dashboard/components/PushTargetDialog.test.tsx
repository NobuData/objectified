/**
 * Unit tests for PushTargetDialog.
 * Covers: successful push closes dialog, failed push keeps dialog open with error,
 * 409 conflict suggestion display, and Pull/Merge action buttons.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PushTargetDialog from '@/app/dashboard/components/PushTargetDialog';

jest.mock('@lib/api/rest-client', () => ({
  listVersions: jest.fn(),
}));

const { listVersions } = require('@lib/api/rest-client') as { listVersions: jest.Mock };

const baseProps = {
  open: true,
  onOpenChange: jest.fn(),
  tenantId: 't1',
  projectId: 'p1',
  currentVersionId: 'v1',
  options: { jwt: 'tok' },
  onPush: jest.fn(),
};

const versions = [
  { id: 'v1', name: 'Version 1' },
  { id: 'v2', name: 'Version 2' },
  { id: 'v3', name: 'Version 3' },
];

beforeEach(() => {
  jest.clearAllMocks();
  listVersions.mockResolvedValue(versions);
});

describe('PushTargetDialog', () => {
  it('renders the dialog title when open', async () => {
    render(<PushTargetDialog {...baseProps} />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Version 2' })).toBeInTheDocument());
    expect(screen.getByText('Push to version')).toBeInTheDocument();
  });

  it('does not render dialog content when closed', () => {
    render(<PushTargetDialog {...baseProps} open={false} />);
    expect(screen.queryByText('Push to version')).toBeNull();
  });

  it('loads and displays versions excluding currentVersionId', async () => {
    render(<PushTargetDialog {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Version 2' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Version 3' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('option', { name: 'Version 1' })).toBeNull();
  });

  it('closes dialog on successful push', async () => {
    const user = userEvent.setup();
    const onPush = jest.fn().mockResolvedValue(undefined);
    const onOpenChange = jest.fn();
    render(<PushTargetDialog {...baseProps} onPush={onPush} onOpenChange={onOpenChange} />);
    await waitFor(() => screen.getByRole('option', { name: 'Version 2' }));
    await user.selectOptions(screen.getByRole('combobox'), 'v2');
    await user.click(screen.getByRole('button', { name: /^push$/i }));
    await waitFor(() => {
      expect(onPush).toHaveBeenCalledWith('v2');
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('keeps dialog open when push fails', async () => {
    const user = userEvent.setup();
    const onPush = jest.fn().mockRejectedValue(new Error('Push failed'));
    const onOpenChange = jest.fn();
    render(<PushTargetDialog {...baseProps} onPush={onPush} onOpenChange={onOpenChange} />);
    await waitFor(() => screen.getByRole('option', { name: 'Version 2' }));
    await user.selectOptions(screen.getByRole('combobox'), 'v2');
    await user.click(screen.getByRole('button', { name: /^push$/i }));
    await waitFor(() => expect(onPush).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('displays pushError when provided', async () => {
    render(<PushTargetDialog {...baseProps} pushError="Something went wrong" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong'));
  });

  it('does not show conflict suggestion when pushConflict409 is false', async () => {
    render(<PushTargetDialog {...baseProps} pushConflict409={false} onPull={jest.fn()} />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Version 2' })).toBeInTheDocument());
    expect(screen.queryByText('Server has newer changes')).toBeNull();
  });

  it('does not show conflict suggestion when pushConflict409 is true but no onPull/onMerge', async () => {
    render(<PushTargetDialog {...baseProps} pushConflict409={true} />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Version 2' })).toBeInTheDocument());
    expect(screen.queryByText('Server has newer changes')).toBeNull();
  });

  it('shows conflict suggestion when pushConflict409 is true with onPull handler', async () => {
    const user = userEvent.setup();
    render(<PushTargetDialog {...baseProps} pushConflict409={true} onPull={jest.fn()} />);
    await waitFor(() => screen.getByRole('option', { name: 'Version 2' }));
    await user.selectOptions(screen.getByRole('combobox'), 'v2');
    expect(screen.getByText('Server has newer changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pull/i })).toBeInTheDocument();
  });

  it('shows conflict suggestion when pushConflict409 is true with onMerge handler', async () => {
    const user = userEvent.setup();
    render(<PushTargetDialog {...baseProps} pushConflict409={true} onMerge={jest.fn()} />);
    await waitFor(() => screen.getByRole('option', { name: 'Version 2' }));
    await user.selectOptions(screen.getByRole('combobox'), 'v2');
    expect(screen.getByText('Server has newer changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /merge/i })).toBeInTheDocument();
  });

  it('calls onPull and clearPushConflict409 and closes dialog when Pull is clicked', async () => {
    const user = userEvent.setup();
    const onPull = jest.fn();
    const clearPushConflict409 = jest.fn();
    const onOpenChange = jest.fn();
    render(
      <PushTargetDialog
        {...baseProps}
        onOpenChange={onOpenChange}
        pushConflict409={true}
        onPull={onPull}
        clearPushConflict409={clearPushConflict409}
      />
    );
    await waitFor(() => screen.getByRole('option', { name: 'Version 2' }));
    await user.selectOptions(screen.getByRole('combobox'), 'v2');
    await user.click(screen.getByRole('button', { name: /pull/i }));
    expect(onPull).toHaveBeenCalled();
    expect(clearPushConflict409).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onMerge with selected version id and clearPushConflict409 and closes dialog when Merge is clicked', async () => {
    const user = userEvent.setup();
    const onMerge = jest.fn();
    const clearPushConflict409 = jest.fn();
    const onOpenChange = jest.fn();
    render(
      <PushTargetDialog
        {...baseProps}
        onOpenChange={onOpenChange}
        pushConflict409={true}
        onMerge={onMerge}
        clearPushConflict409={clearPushConflict409}
      />
    );
    await waitFor(() => screen.getByRole('option', { name: 'Version 2' }));
    await user.selectOptions(screen.getByRole('combobox'), 'v2');
    await user.click(screen.getByRole('button', { name: /merge/i }));
    expect(onMerge).toHaveBeenCalledWith('v2');
    expect(clearPushConflict409).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('disables Push button when no version is selected', async () => {
    render(<PushTargetDialog {...baseProps} />);
    await waitFor(() => screen.getByRole('option', { name: 'Version 2' }));
    expect(screen.getByRole('button', { name: /^push$/i })).toBeDisabled();
  });

  it('checks server-ahead before pushing and shows guidance instead of pushing', async () => {
    const user = userEvent.setup();
    const onPush = jest.fn().mockResolvedValue(undefined);
    const onCheckServerAhead = jest.fn().mockResolvedValue(true);
    render(
      <PushTargetDialog
        {...baseProps}
        onPush={onPush}
        onCheckServerAhead={onCheckServerAhead}
        onPull={jest.fn()}
      />
    );
    await waitFor(() => screen.getByRole('option', { name: 'Version 2' }));
    await user.selectOptions(screen.getByRole('combobox'), 'v2');
    await user.click(screen.getByRole('button', { name: /^push$/i }));
    await waitFor(() => {
      expect(onCheckServerAhead).toHaveBeenCalledWith('v2');
    });
    expect(onPush).not.toHaveBeenCalled();
    expect(screen.getByText('Server has newer changes')).toBeInTheDocument();
    expect(screen.getByText(/server has new changes\. pull first/i)).toBeInTheDocument();
  });

  it('shows overwrite action only when overwrite policy allows it', async () => {
    const user = userEvent.setup();
    const onCheckServerAhead = jest.fn().mockResolvedValue(true);
    const onOverwrite = jest.fn().mockResolvedValue(undefined);
    const onOpenChange = jest.fn();
    render(
      <PushTargetDialog
        {...baseProps}
        onOpenChange={onOpenChange}
        onCheckServerAhead={onCheckServerAhead}
        allowOverwriteOnServerAhead={true}
        onOverwrite={onOverwrite}
        onPull={jest.fn()}
      />
    );
    await waitFor(() => screen.getByRole('option', { name: 'Version 2' }));
    await user.selectOptions(screen.getByRole('combobox'), 'v2');
    await user.click(screen.getByRole('button', { name: /^push$/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /overwrite/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /overwrite/i }));
    await waitFor(() => {
      expect(onOverwrite).toHaveBeenCalledWith('v2');
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
