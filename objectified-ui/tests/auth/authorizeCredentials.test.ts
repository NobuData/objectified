/**
 * Unit tests for credential authorization used by NextAuth (authorizeCredentials).
 * Verification is done server-side in authorize(); no public verify endpoint.
 */

import { authorizeCredentials, authOptions } from '../../lib/auth/authOptions';

const mockVerifyCredentials = jest.fn();
jest.mock('@lib/auth/verifyCredentials', () => ({
  verifyCredentials: (...args: unknown[]) => mockVerifyCredentials(...args),
}));

describe('authorizeCredentials', () => {
  beforeEach(() => {
    mockVerifyCredentials.mockReset();
  });

  it('returns null when verifyCredentials returns null', async () => {
    mockVerifyCredentials.mockResolvedValue(null);
    const result = await authorizeCredentials('bad@example.com', 'wrong');
    expect(result).toBeNull();
    expect(mockVerifyCredentials).toHaveBeenCalledWith('bad@example.com', 'wrong');
  });

  it('returns user when verifyCredentials returns user', async () => {
    const user = { id: 'user-1', name: 'Test User', email: 'user@example.com', is_administrator: false };
    mockVerifyCredentials.mockResolvedValue(user);
    const result = await authorizeCredentials('user@example.com', 'correct');
    expect(result).toEqual({ id: user.id, name: user.name, email: user.email, is_administrator: false });
    expect(mockVerifyCredentials).toHaveBeenCalledWith('user@example.com', 'correct');
  });

  it('returns null when verifyCredentials throws', async () => {
    mockVerifyCredentials.mockRejectedValue(new Error('DB error'));
    const result = await authorizeCredentials('user@example.com', 'secret');
    expect(result).toBeNull();
  });
});

describe('Credentials provider authorize()', () => {
  beforeEach(() => {
    mockVerifyCredentials.mockReset();
  });

  it('returns null when email is missing', async () => {
    const provider = authOptions.providers[0] as { options: { authorize: (c: unknown) => Promise<unknown> } };
    const result = await provider.options.authorize({ password: 'secret' });
    expect(result).toBeNull();
    expect(mockVerifyCredentials).not.toHaveBeenCalled();
  });

  it('returns null when password is missing', async () => {
    const provider = authOptions.providers[0] as { options: { authorize: (c: unknown) => Promise<unknown> } };
    const result = await provider.options.authorize({ email: 'user@example.com' });
    expect(result).toBeNull();
    expect(mockVerifyCredentials).not.toHaveBeenCalled();
  });

  it('returns user when credentials are valid', async () => {
    const user = { id: 'user-1', name: 'Test User', email: 'user@example.com', is_administrator: false };
    mockVerifyCredentials.mockResolvedValue(user);
    const provider = authOptions.providers[0] as { options: { authorize: (c: unknown) => Promise<unknown> } };
    const result = await provider.options.authorize({
      email: 'user@example.com',
      password: 'correct',
    });
    expect(result).toEqual({ id: user.id, name: user.name, email: user.email, is_administrator: false });
    expect(mockVerifyCredentials).toHaveBeenCalledWith('user@example.com', 'correct');
  });
});
