/**
 * Unit tests for verifyCredentials (core auth: email normalization, SQL filter, bcrypt).
 * Mocks queryOne and bcrypt.compare to assert SQL, params, and success/failure paths.
 */

import { getAccountByEmail, verifyCredentials } from '@lib/auth/verifyCredentials';
import { queryOne } from '@lib/db/postgres';
import { compare } from 'bcryptjs';

jest.mock('@lib/db/postgres', () => ({
  queryOne: jest.fn(),
}));
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
}));

const mockQueryOne = queryOne as jest.MockedFunction<typeof queryOne>;
const mockCompare = compare as jest.MockedFunction<typeof compare>;

describe('verifyCredentials', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('input validation', () => {
    it('returns null when email is empty string', async () => {
      const result = await verifyCredentials('', 'password');
      expect(result).toBeNull();
      expect(mockQueryOne).not.toHaveBeenCalled();
      expect(mockCompare).not.toHaveBeenCalled();
    });

    it('returns null when email is only whitespace', async () => {
      const result = await verifyCredentials('   \t  ', 'password');
      expect(result).toBeNull();
      expect(mockQueryOne).not.toHaveBeenCalled();
      expect(mockCompare).not.toHaveBeenCalled();
    });

    it('returns null when password is empty', async () => {
      const result = await verifyCredentials('user@example.com', '');
      expect(result).toBeNull();
      expect(mockQueryOne).not.toHaveBeenCalled();
      expect(mockCompare).not.toHaveBeenCalled();
    });

    it('returns null when password is undefined (falsy)', async () => {
      const result = await verifyCredentials('user@example.com', undefined as unknown as string);
      expect(result).toBeNull();
      expect(mockQueryOne).not.toHaveBeenCalled();
    });
  });

  describe('email normalization', () => {
    it('trims and lowercases email and passes normalized value to query', async () => {
      mockQueryOne.mockResolvedValue(null);

      await verifyCredentials('  User@Example.COM  ', 'secret');

      expect(mockQueryOne).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQueryOne.mock.calls[0];
      expect(params).toEqual(['user@example.com']);
      expect(sql).toContain('LOWER(email)');
      expect(sql).toContain('objectified.account');
    });

    it('uses SQL that filters on deleted_at IS NULL and enabled = true', async () => {
      mockQueryOne.mockResolvedValue(null);

      await verifyCredentials('user@example.com', 'secret');

      const [sql] = mockQueryOne.mock.calls[0];
      expect(sql).toMatch(/deleted_at\s+IS\s+NULL/i);
      expect(sql).toMatch(/enabled\s*=\s*true/i);
    });

    it('selects id, name, email, password from objectified.account', async () => {
      mockQueryOne.mockResolvedValue(null);

      await verifyCredentials('user@example.com', 'secret');

      const [sql] = mockQueryOne.mock.calls[0];
      expect(sql).toContain('SELECT id, name, email, password');
      expect(sql).toContain('FROM objectified.account');
    });
  });

  describe('no account or missing password hash', () => {
    it('returns null when queryOne returns null', async () => {
      mockQueryOne.mockResolvedValue(null);

      const result = await verifyCredentials('nobody@example.com', 'secret');

      expect(result).toBeNull();
      expect(mockCompare).not.toHaveBeenCalled();
    });

    it('returns null when row has no password field', async () => {
      mockQueryOne.mockResolvedValue({
        id: 'id-1',
        name: 'User',
        email: 'user@example.com',
      } as { id: string; name: string; email: string; password: string });

      const result = await verifyCredentials('user@example.com', 'secret');

      expect(result).toBeNull();
      expect(mockCompare).not.toHaveBeenCalled();
    });

    it('returns null when row password is empty string', async () => {
      mockQueryOne.mockResolvedValue({
        id: 'id-1',
        name: 'User',
        email: 'user@example.com',
        password: '',
      });

      const result = await verifyCredentials('user@example.com', 'secret');

      expect(result).toBeNull();
      expect(mockCompare).not.toHaveBeenCalled();
    });

    it('returns null when stored hash does not start with bcrypt prefix', async () => {
      mockQueryOne.mockResolvedValue({
        id: 'id-1',
        name: 'User',
        email: 'user@example.com',
        password: 'plaintext-not-a-hash',
      });

      const result = await verifyCredentials('user@example.com', 'secret');

      expect(result).toBeNull();
      expect(mockCompare).not.toHaveBeenCalled();
    });
  });

  describe('bcrypt verification', () => {
    it('returns null when compare returns false', async () => {
      mockQueryOne.mockResolvedValue({
        id: 'id-1',
        name: 'User',
        email: 'user@example.com',
        password: '$2a$10$hashed',
      });
      mockCompare.mockResolvedValue(false as never);

      const result = await verifyCredentials('user@example.com', 'wrong');

      expect(result).toBeNull();
      expect(mockCompare).toHaveBeenCalledTimes(1);
      expect(mockCompare).toHaveBeenCalledWith('wrong', '$2a$10$hashed');
    });

    it('calls compare with (plainPassword, rowPassword) in that order', async () => {
      mockQueryOne.mockResolvedValue({
        id: 'id-1',
        name: 'User',
        email: 'user@example.com',
        password: '$2a$10$storedHash',
      });
      mockCompare.mockResolvedValue(false as never);

      await verifyCredentials('user@example.com', 'plain');

      expect(mockCompare).toHaveBeenCalledWith('plain', '$2a$10$storedHash');
    });

    it('trims password before compare', async () => {
      mockQueryOne.mockResolvedValue({
        id: 'id-1',
        name: 'User',
        email: 'user@example.com',
        password: '$2a$10$hashed',
      });
      mockCompare.mockResolvedValue(true as never);

      await verifyCredentials('user@example.com', '  correct  ');

      expect(mockCompare).toHaveBeenCalledWith('correct', '$2a$10$hashed');
    });
  });

  describe('success path', () => {
    it('returns VerifiedUser when compare returns true', async () => {
      mockQueryOne.mockResolvedValue({
        id: 'uuid-123',
        name: 'Test User',
        email: 'user@example.com',
        password: '$2a$10$hashed',
      });
      mockCompare.mockResolvedValue(true as never);

      const result = await verifyCredentials('user@example.com', 'correct');

      expect(result).toEqual({
        id: 'uuid-123',
        name: 'Test User',
        email: 'user@example.com',
      });
      expect(mockCompare).toHaveBeenCalledWith('correct', '$2a$10$hashed');
    });

    it('returns id, name, email only (no password in result)', async () => {
      mockQueryOne.mockResolvedValue({
        id: 'id-1',
        name: 'Alice',
        email: 'alice@example.com',
        password: '$2a$10$hash',
      });
      mockCompare.mockResolvedValue(true as never);

      const result = await verifyCredentials('alice@example.com', 'secret');

      expect(result).not.toBeNull();
      expect(result).toEqual({ id: 'id-1', name: 'Alice', email: 'alice@example.com' });
      expect(Object.keys(result!)).toEqual(['id', 'name', 'email']);
    });
  });
});

describe('getAccountByEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when email is empty string', async () => {
    const result = await getAccountByEmail('');
    expect(result).toBeNull();
    expect(mockQueryOne).not.toHaveBeenCalled();
  });

  it('returns null when email is only whitespace', async () => {
    const result = await getAccountByEmail('   \t  ');
    expect(result).toBeNull();
    expect(mockQueryOne).not.toHaveBeenCalled();
  });

  it('trims and lowercases email and queries with normalized value', async () => {
    mockQueryOne.mockResolvedValue(null);

    await getAccountByEmail('  User@Example.COM  ');

    expect(mockQueryOne).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQueryOne.mock.calls[0];
    expect(params).toEqual(['user@example.com']);
    expect(sql).toContain('LOWER(email)');
    expect(sql).toContain('objectified.account');
    expect(sql).toContain('deleted_at IS NULL');
    expect(sql).toContain('enabled = true');
    expect(sql).not.toContain('password');
  });

  it('returns null when no account found', async () => {
    mockQueryOne.mockResolvedValue(null);

    const result = await getAccountByEmail('nobody@example.com');

    expect(result).toBeNull();
  });

  it('returns VerifiedUser when account exists and is enabled', async () => {
    mockQueryOne.mockResolvedValue({
      id: 'uuid-sso',
      name: 'SSO User',
      email: 'sso@example.com',
    });

    const result = await getAccountByEmail('sso@example.com');

    expect(result).toEqual({
      id: 'uuid-sso',
      name: 'SSO User',
      email: 'sso@example.com',
    });
  });
});
