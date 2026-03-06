/**
 * Unit tests for NextAuth callbacks: GitHub SSO allowlist (signIn) and
 * internal ID mapping (jwt). Ensures sign-in is rejected when email is
 * missing or not in DB, and token.sub is set from DB account for GitHub.
 */

const mockGetAccountByEmail = jest.fn();
jest.mock('@lib/auth/verifyCredentials', () => ({
  getAccountByEmail: (...args: unknown[]) => mockGetAccountByEmail(...args),
  verifyCredentials: jest.fn(),
}));

import { authOptions } from '@lib/auth/authOptions';

const signIn = authOptions.callbacks!.signIn!;
const jwt = authOptions.callbacks!.jwt!;

describe('GitHub signIn callback', () => {
  beforeEach(() => {
    mockGetAccountByEmail.mockReset();
  });

  it('returns true when account provider is not github', async () => {
    const result = await signIn({
      user: { id: '1', name: 'U', email: 'u@x.com' },
      account: { provider: 'credentials', type: 'credentials' },
      profile: {},
    });
    expect(result).toBe(true);
    expect(mockGetAccountByEmail).not.toHaveBeenCalled();
  });

  it('returns false when provider is github and profile has no email', async () => {
    const result = await signIn({
      user: { id: 'gh-1', name: 'U', email: null },
      account: { provider: 'github', type: 'oauth' },
      profile: {},
    });
    expect(result).toBe(false);
    expect(mockGetAccountByEmail).not.toHaveBeenCalled();
  });

  it('returns false when provider is github and profile.email is empty', async () => {
    const result = await signIn({
      user: { id: 'gh-1', name: 'U', email: null },
      account: { provider: 'github', type: 'oauth' },
      profile: { email: '' },
    });
    expect(result).toBe(false);
    expect(mockGetAccountByEmail).not.toHaveBeenCalled();
  });

  it('calls getAccountByEmail and returns false when email not in DB', async () => {
    mockGetAccountByEmail.mockResolvedValue(null);
    const result = await signIn({
      user: { id: 'gh-1', name: 'U', email: 'unknown@example.com' },
      account: { provider: 'github', type: 'oauth' },
      profile: { email: 'unknown@example.com' },
    });
    expect(result).toBe(false);
    expect(mockGetAccountByEmail).toHaveBeenCalledTimes(1);
    expect(mockGetAccountByEmail).toHaveBeenCalledWith('unknown@example.com');
  });

  it('returns false when getAccountByEmail throws', async () => {
    mockGetAccountByEmail.mockRejectedValue(new Error('DB connection failed'));
    const result = await signIn({
      user: { id: 'gh-1', name: 'U', email: 'user@example.com' },
      account: { provider: 'github', type: 'oauth' },
      profile: { email: 'user@example.com' },
    });
    expect(result).toBe(false);
  });

  it('returns true when provider is github and email is in DB', async () => {
    mockGetAccountByEmail.mockResolvedValue({
      id: 'db-uuid-1',
      name: 'DB User',
      email: 'user@example.com',
    });
    const result = await signIn({
      user: { id: 'gh-1', name: 'U', email: 'user@example.com' },
      account: { provider: 'github', type: 'oauth' },
      profile: { email: 'user@example.com' },
    });
    expect(result).toBe(true);
    expect(mockGetAccountByEmail).toHaveBeenCalledWith('user@example.com');
  });

  it('uses profile.emails[0].value when profile.email is missing', async () => {
    mockGetAccountByEmail.mockResolvedValue({
      id: 'db-uuid-2',
      name: 'DB User',
      email: 'alt@example.com',
    });
    const result = await signIn({
      user: { id: 'gh-2', name: 'U', email: null },
      account: { provider: 'github', type: 'oauth' },
      profile: { emails: [{ value: 'alt@example.com' }] },
    });
    expect(result).toBe(true);
    expect(mockGetAccountByEmail).toHaveBeenCalledWith('alt@example.com');
  });
});

describe('jwt callback', () => {
  beforeEach(() => {
    mockGetAccountByEmail.mockReset();
  });

  it('sets token.sub to user.id when user is provided (e.g. credentials)', async () => {
    const token = { sub: undefined };
    const result = await jwt({
      token,
      user: { id: 'cred-user-id', name: 'U', email: 'u@x.com' },
      account: { provider: 'credentials', type: 'credentials' },
      profile: undefined,
    });
    expect(result.sub).toBe('cred-user-id');
    expect(mockGetAccountByEmail).not.toHaveBeenCalled();
  });

  it('sets token.sub to DB account id for GitHub when getAccountByEmail returns user', async () => {
    mockGetAccountByEmail.mockResolvedValue({
      id: 'db-account-id',
      name: 'DB User',
      email: 'gh@example.com',
    });
    const token = { sub: 'github-oauth-id' };
    const result = await jwt({
      token,
      user: { id: 'gh-1', name: 'U', email: 'gh@example.com' },
      account: { provider: 'github', type: 'oauth' },
      profile: { email: 'gh@example.com' },
    });
    expect(result.sub).toBe('db-account-id');
    expect(mockGetAccountByEmail).toHaveBeenCalledWith('gh@example.com');
  });

  it('leaves token.sub unchanged when provider is github but getAccountByEmail returns null', async () => {
    mockGetAccountByEmail.mockResolvedValue(null);
    const token = { sub: 'original-oauth-sub' };
    const result = await jwt({
      token,
      user: undefined,
      account: { provider: 'github', type: 'oauth' },
      profile: { email: 'nobody@example.com' },
    });
    expect(result.sub).toBe('original-oauth-sub');
  });

  it('leaves token.sub unchanged when getAccountByEmail throws', async () => {
    mockGetAccountByEmail.mockRejectedValue(new Error('DB error'));
    const token = { sub: 'fallback-sub' };
    const result = await jwt({
      token,
      user: undefined,
      account: { provider: 'github', type: 'oauth' },
      profile: { email: 'user@example.com' },
    });
    expect(result.sub).toBe('fallback-sub');
  });

  it('does not call getAccountByEmail when account is not github', async () => {
    const token = { sub: 'cred-id' };
    await jwt({
      token,
      user: { id: 'cred-id', name: 'U', email: 'u@x.com' },
      account: { provider: 'credentials', type: 'credentials' },
      profile: undefined,
    });
    expect(mockGetAccountByEmail).not.toHaveBeenCalled();
  });
});
