import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import TenantSsoPage from '../../../src/app/dashboard/tenants/[tenantId]/sso/page';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    status: 'authenticated',
    data: {
      user: { name: 'Admin', email: 'admin@example.com', is_administrator: true },
      accessToken: 'token',
    },
  })),
}));

jest.mock('next/navigation', () => ({
  useParams: jest.fn(() => ({ tenantId: 'tenant-123' })),
}));

const mockListTenantSsoProviders = jest.fn();
const mockCreateTenantSsoProvider = jest.fn();
const mockUpdateTenantSsoProvider = jest.fn();
const mockDeleteTenantSsoProvider = jest.fn();

jest.mock('@lib/api/rest-client', () => ({
  listTenantSsoProviders: (...args: unknown[]) => mockListTenantSsoProviders(...args),
  createTenantSsoProvider: (...args: unknown[]) => mockCreateTenantSsoProvider(...args),
  updateTenantSsoProvider: (...args: unknown[]) => mockUpdateTenantSsoProvider(...args),
  deleteTenantSsoProvider: (...args: unknown[]) => mockDeleteTenantSsoProvider(...args),
  isForbiddenError: jest.fn(() => false),
  getRestClientOptions: jest.fn(() => ({})),
}));

jest.mock('@/app/components/providers/DialogProvider', () => ({
  useDialog: jest.fn(() => ({
    confirm: jest.fn(() => Promise.resolve(false)),
    alert: jest.fn(() => Promise.resolve()),
  })),
}));

const _OIDC_PROVIDER = {
  id: 'provider-1',
  tenant_id: 'tenant-123',
  provider_type: 'oidc' as const,
  name: 'Okta',
  enabled: true,
  oidc_discovery: { issuer: 'https://idp.example.com' },
  saml_metadata_xml: null,
  metadata: {},
  created_at: '2024-01-01T00:00:00Z',
  updated_at: null,
  deleted_at: null,
};

describe('TenantSsoPage', () => {
  beforeEach(() => {
    mockListTenantSsoProviders.mockReset();
    mockCreateTenantSsoProvider.mockReset();
    mockUpdateTenantSsoProvider.mockReset();
    mockDeleteTenantSsoProvider.mockReset();
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      status: 'authenticated',
      data: {
        user: { name: 'Admin', email: 'admin@example.com', is_administrator: true },
        accessToken: 'token',
      },
    });
  });

  it('shows loading spinner initially', () => {
    mockListTenantSsoProviders.mockReturnValue(new Promise(() => {}));
    render(<TenantSsoPage />);
    expect(document.querySelector('svg.animate-spin')).toBeInTheDocument();
  });

  it('renders heading and back link after load', async () => {
    mockListTenantSsoProviders.mockResolvedValue([]);
    render(<TenantSsoPage />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /tenant sso/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /tenants/i })).toBeInTheDocument();
  });

  it('shows empty state when no providers configured', async () => {
    mockListTenantSsoProviders.mockResolvedValue([]);
    render(<TenantSsoPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/no sso providers configured for this tenant yet/i)
      ).toBeInTheDocument();
    });
  });

  it('shows provider cards when providers exist', async () => {
    mockListTenantSsoProviders.mockResolvedValue([_OIDC_PROVIDER]);
    render(<TenantSsoPage />);
    await waitFor(() => {
      expect(screen.getByText('Okta')).toBeInTheDocument();
    });
    expect(screen.getByText('OIDC (Discovery JSON)')).toBeInTheDocument();
  });

  it('shows Add provider button for administrators', async () => {
    mockListTenantSsoProviders.mockResolvedValue([]);
    render(<TenantSsoPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add provider/i })).toBeInTheDocument();
    });
  });

  it('hides Add provider button for non-administrators', async () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({
      status: 'authenticated',
      data: {
        user: { name: 'Member', email: 'member@example.com', is_administrator: false },
        accessToken: 'token',
      },
    });
    mockListTenantSsoProviders.mockResolvedValue([]);
    render(<TenantSsoPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/no sso providers configured/i)
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /add provider/i })).not.toBeInTheDocument();
  });

  it('shows sign-in message when unauthenticated', async () => {
    const { useSession } = require('next-auth/react');
    useSession.mockReturnValue({ status: 'unauthenticated', data: null });
    render(<TenantSsoPage />);
    await waitFor(() => {
      expect(screen.getByText(/you must be signed in/i)).toBeInTheDocument();
    });
  });

  it('shows error message when provider fetch fails', async () => {
    mockListTenantSsoProviders.mockRejectedValue(new Error('Network error'));
    render(<TenantSsoPage />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText(/network error/i)).toBeInTheDocument();
  });

  it('shows forbidden error message when user lacks access', async () => {
    const { isForbiddenError } = require('@lib/api/rest-client');
    isForbiddenError.mockReturnValue(true);
    mockListTenantSsoProviders.mockRejectedValue(new Error('Forbidden'));
    render(<TenantSsoPage />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/you do not have permission to view sso configuration/i)
    ).toBeInTheDocument();
  });
});
