/** sessionStorage keys for "don't ask again" confirm skips (browser session / tab). */

const PREFIX = 'objectified:confirm-skip:';

export function isSessionConfirmSkipped(sessionKey: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(`${PREFIX}${sessionKey}`) === '1';
  } catch {
    return false;
  }
}

export function setSessionConfirmSkipped(sessionKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(`${PREFIX}${sessionKey}`, '1');
  } catch {
    /* ignore quota / private mode */
  }
}
