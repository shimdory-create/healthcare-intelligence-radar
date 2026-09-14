import { describe, it, expect } from 'vitest';
import { formatReportDate } from '@/lib/dateFormat';

describe('formatReportDate', () => {
  it('formats a date as \'YY.M.D(요일) with no leading zeros and no space before the parenthesis', () => {
    expect(formatReportDate('2026-09-15')).toBe("'26.9.15(화)");
  });

  it('does not zero-pad a single-digit month or day', () => {
    expect(formatReportDate('2026-01-05')).toBe("'26.1.5(월)");
  });

  it('computes the weekday independent of the runtime local timezone', () => {
    const originalTZ = process.env.TZ;
    try {
      process.env.TZ = 'America/New_York';
      expect(formatReportDate('2026-09-15')).toBe("'26.9.15(화)");
    } finally {
      process.env.TZ = originalTZ;
    }
  });
});
