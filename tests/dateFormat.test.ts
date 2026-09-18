import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatReportDate, todayKstDate } from '@/lib/dateFormat';

afterEach(() => {
  vi.useRealTimers();
});

describe('todayKstDate', () => {
  it('reports the KST calendar date, not UTC\'s, during the ~9 hours a day they differ', () => {
    // 2026-09-17T16:30:00Z is still 2026-09-18 01:30 KST -- UTC would say the 17th
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T16:30:00Z'));
    expect(todayKstDate()).toBe('2026-09-18');
  });

  it('matches UTC\'s date once past the boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-18T10:00:00Z')); // 2026-09-18 19:00 KST
    expect(todayKstDate()).toBe('2026-09-18');
  });
});

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
