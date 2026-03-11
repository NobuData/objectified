import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import UsersPage from '../../../src/app/dashboard/users/page';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockListUsers = jest.fn();
const mockCreateUser = jest.fn();
const mockUpdateUser = jest.fn();
const mockDeactivateUser = jest.fn();

jest.mock('@lib/api/rest-client', () => ({
  listUsers: (...args: unknown[]) => mockListUsers(...args),
  createUser: (...args: unknown[]) => mockCreateUser(...args),
  updateUser: (...args: unknown[]) => mockUpdateUser(...args),
  deactivateUser: (...args: unknown[]) => mockDeactivateUser(...args),
}));

const mockConfirm = jest.fn();
const mockAlert = jest.fn();

jest.mock('@/app/components/providers/DialogProvider', () => ({
  useDialog: () => ({
    confirm: mockConfirm,
    alert: mockAlert,
  }),
}));

const mockUseSession = jest.fn();

jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/users',
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_USERS = [
  {
    id: 'u1',
    name: 'Alice Admin',
    email: 'alice@example.com',
    verified: true,
    enabled: true,
    metadata: {},
    created_at: '2025-01-15T10:00:00Z',
    updated_at: null,
    deleted_at: null,
  },
  {
    id: 'u2',
    name: 'Bob Builder',
    email: 'bob@example.com',
    verified: false,
    enabled: true,
    metadata: {},
    created_at: '2025-02-20T12:00:00Z',
    updated_at: null,
    deleted_at: null,
  },
  {
    id: 'u3',
    name: 'Carol Deactivated',
    email: 'carol@example.com',
    verified: true,
    enabled: false,
    metadata: {},
    created_at: '2025-03-01T08:00:00Z',
    updated_at: null,
    deleted_at: '2025-03-05T08:00:00Z',
  },
];

function setAdminSession() {
  mockUseSession.mockReturnValue({
    data: {
      user: { name: 'Admin', email: 'admin@test.com', is_administrator: true },
      accessToken: 'tok',
    },
    status: 'authenticated',
  });
}

function setNonAdminSession() {
  mockUseSession.mockReturnValue({
    data: {
      user: { name: 'User', email: 'user@test.com', is_administrator: false },
      accessToken: 'tok',
    },
    status: 'authenticated',
  });
}

function setUnauthenticatedSession() {
  mockUseSession.mockReturnValue({
    data: null,
    status: 'unauthenticated',
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UsersPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListUsers.mockResolvedValue(MOCK_USERS);
    mockCreateUser.mockResolvedValue(MOCK_USERS[0]);
    mockUpdateUser.mockResolvedValue(MOCK_USERS[0]);
    mockDeactivateUser.mockResolvedValue(undefined);
    mockConfirm.mockResolvedValue(true);
    mockAlert.mockResolvedValue(undefined);
  });

  // --- Access control ---

  it('shows access denied for non-administrators', async () => {
    setNonAdminSession();
    await act(async () => {
      render(<UsersPage />);
    });
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText(/administrator/i)).toBeInTheDocument();
    expect(mockListUsers).not.toHaveBeenCalled();
  });

  it('shows access denied for unauthenticated users', async () => {
    setUnauthenticatedSession();
    await act(async () => {
      render(<UsersPage />);
    });
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
  });

  // --- Table rendering ---

  it('renders the Users heading and table with data for admin', async () => {
    setAdminSession();
    await act(async () => {
      render(<UsersPage />);
    });
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Users/i })).toBeInTheDocument();
    });
    expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('Bob Builder')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
  });

  it('shows Create User button', async () => {
    setAdminSession();
    await act(async () => {
      render(<UsersPage />);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create User/i })).toBeInTheDocument();
    });
  });

  it('shows Deactivated badge for soft-deleted users', async () => {
    setAdminSession();
    await act(async () => {
      render(<UsersPage />);
    });
    await waitFor(() => {
      expect(screen.getByText('Deactivated')).toBeInTheDocument();
    });
  });

  it('does not show deactivate button for already deactivated users', async () => {
    setAdminSession();
    await act(async () => {
      render(<UsersPage />);
    });
    await waitFor(() => {
      expect(screen.getByText('Carol Deactivated')).toBeInTheDocument();
    });
    // Alice and Bob have deactivate buttons, Carol does not
    expect(screen.getByLabelText('Deactivate Alice Admin')).toBeInTheDocument();
    expect(screen.getByLabelText('Deactivate Bob Builder')).toBeInTheDocument();
    expect(screen.queryByLabelText('Deactivate Carol Deactivated')).not.toBeInTheDocument();
  });

  // --- Create dialog ---

  it('opens create dialog on Create User button click', async () => {
    setAdminSession();
    await act(async () => {
      render(<UsersPage />);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create User/i })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create User/i }));
    });

    expect(screen.getByText('Create User', { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name$/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email$/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password$/)).toBeInTheDocument();
  });

  it('shows validation error when creating user without required fields', async () => {
    setAdminSession();
    await act(async () => {
      render(<UsersPage />);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create User/i })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create User/i }));
    });

    // Submit without filling fields
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    });

    expect(screen.getByText('Name is required.')).toBeInTheDocument();
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('calls createUser when form is submitted with valid data', async () => {
    setAdminSession();
    await act(async () => {
      render(<UsersPage />);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create User/i })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create User/i }));
    });

    fireEvent.change(screen.getByLabelText(/^Name$/), { target: { value: 'New User' } });
    fireEvent.change(screen.getByLabelText(/^Email$/), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText(/^Password$/), { target: { value: 'secret123' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    });

    expect(mockCreateUser).toHaveBeenCalledWith({
      name: 'New User',
      email: 'new@example.com',
      password: 'secret123',
    });
  });

  // --- Edit dialog ---

  it('opens edit dialog with user data pre-filled', async () => {
    setAdminSession();
    await act(async () => {
      render(<UsersPage />);
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Edit Alice Admin')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Edit Alice Admin'));
    });

    expect(screen.getByText('Edit User')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name$/)).toHaveValue('Alice Admin');
    expect(screen.getByLabelText(/^Email$/)).toHaveValue('alice@example.com');
  });

  it('calls updateUser when edit form is submitted', async () => {
    setAdminSession();
    await act(async () => {
      render(<UsersPage />);
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Edit Alice Admin')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Edit Alice Admin'));
    });

    fireEvent.change(screen.getByLabelText(/^Name$/), { target: { value: 'Alice Updated' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    });

    expect(mockUpdateUser).toHaveBeenCalledWith('u1', {
      name: 'Alice Updated',
      email: 'alice@example.com',
    });
  });

  // --- Deactivate ---

  it('calls deactivateUser after confirm dialog approval', async () => {
    setAdminSession();
    await act(async () => {
      render(<UsersPage />);
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Deactivate Alice Admin')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Deactivate Alice Admin'));
    });

    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Deactivate User',
        variant: 'danger',
      })
    );
    expect(mockDeactivateUser).toHaveBeenCalledWith('u1');
  });

  it('does not deactivate when confirm dialog is cancelled', async () => {
    mockConfirm.mockResolvedValue(false);
    setAdminSession();
    await act(async () => {
      render(<UsersPage />);
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Deactivate Alice Admin')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Deactivate Alice Admin'));
    });

    expect(mockConfirm).toHaveBeenCalled();
    expect(mockDeactivateUser).not.toHaveBeenCalled();
  });

  // --- Error handling ---

  it('displays error when listUsers fails', async () => {
    mockListUsers.mockRejectedValue(new Error('Network error'));
    setAdminSession();
    await act(async () => {
      render(<UsersPage />);
    });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('shows alert dialog when createUser fails', async () => {
    mockCreateUser.mockRejectedValue(new Error('Email already exists'));
    setAdminSession();
    await act(async () => {
      render(<UsersPage />);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create User/i })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create User/i }));
    });

    fireEvent.change(screen.getByLabelText(/^Name$/), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText(/^Email$/), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByLabelText(/^Password$/), { target: { value: 'pass' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    });

    expect(mockAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Create Failed',
        message: 'Email already exists',
        variant: 'error',
      })
    );
  });

  it('shows alert dialog when deactivateUser fails', async () => {
    mockDeactivateUser.mockRejectedValue(new Error('Forbidden'));
    setAdminSession();
    await act(async () => {
      render(<UsersPage />);
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Deactivate Alice Admin')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Deactivate Alice Admin'));
    });

    expect(mockAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Deactivation Failed',
        variant: 'error',
      })
    );
  });

  // --- Empty state ---

  it('shows empty message when no users are returned', async () => {
    mockListUsers.mockResolvedValue([]);
    setAdminSession();
    await act(async () => {
      render(<UsersPage />);
    });
    await waitFor(() => {
      expect(screen.getByText('No users found.')).toBeInTheDocument();
    });
  });

  // --- Show deactivated toggle ---

  it('renders the show deactivated users toggle', async () => {
    setAdminSession();
    await act(async () => {
      render(<UsersPage />);
    });
    await waitFor(() => {
      expect(screen.getByText('Show deactivated users')).toBeInTheDocument();
    });
  });
});

