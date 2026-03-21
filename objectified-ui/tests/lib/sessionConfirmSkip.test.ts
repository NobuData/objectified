import {
  isSessionConfirmSkipped,
  setSessionConfirmSkipped,
} from '../../lib/sessionConfirmSkip';

describe('sessionConfirmSkip', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('returns false when key is not set', () => {
    expect(isSessionConfirmSkipped('test-key')).toBe(false);
  });

  it('returns true after setSessionConfirmSkipped', () => {
    setSessionConfirmSkipped('test-key');
    expect(isSessionConfirmSkipped('test-key')).toBe(true);
  });

  it('uses distinct keys', () => {
    setSessionConfirmSkipped('a');
    expect(isSessionConfirmSkipped('a')).toBe(true);
    expect(isSessionConfirmSkipped('b')).toBe(false);
  });
});
