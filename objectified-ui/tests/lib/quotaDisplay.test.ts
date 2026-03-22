import { atQuotaLimit, formatUsageLine, quotaSeverity } from '@lib/quotaDisplay';

describe('quotaDisplay', () => {
  it('quotaSeverity returns block at or over cap', () => {
    expect(quotaSeverity(5, 5)).toBe('block');
    expect(quotaSeverity(5, 10)).toBe('block');
  });

  it('quotaSeverity returns warn one below cap', () => {
    expect(quotaSeverity(5, 4)).toBe('warn');
  });

  it('quotaSeverity returns ok when unlimited', () => {
    expect(quotaSeverity(null, 99)).toBe('ok');
    expect(quotaSeverity(undefined, 99)).toBe('ok');
  });

  it('formatUsageLine includes max when set', () => {
    expect(formatUsageLine('Projects', 2, 5)).toBe('Projects: 2 / 5');
    expect(formatUsageLine('Projects', 2, null)).toBe('Projects: 2');
  });

  it('atQuotaLimit respects null max', () => {
    expect(atQuotaLimit(null, 100)).toBe(false);
    expect(atQuotaLimit(5, 5)).toBe(true);
    expect(atQuotaLimit(5, 4)).toBe(false);
  });
});
