import { describe, it, expect } from 'vitest';
import { reportDateRange } from '@/lib/reportSchedule';

// All calendar dates below were independently verified (not by trusting the function under
// test) via:
//   new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
//
// 2026-09-19 = Saturday, 2026-09-20 = Sunday, 2026-09-21 = Monday (plain, mid-month)
// 2026-02-28 = Saturday, 2026-03-01 = Sunday, 2026-03-02 = Monday (crosses a month boundary)
// 2028-12-30 = Saturday, 2028-12-31 = Sunday, 2029-01-01 = Monday (crosses a year boundary)
// 2026-09-15..18 = Tuesday..Friday

describe('reportDateRange', () => {
  it('returns null for a Saturday', () => {
    expect(reportDateRange('2026-09-19')).toBeNull();
  });

  it('returns null for a Sunday', () => {
    expect(reportDateRange('2026-09-20')).toBeNull();
  });

  it('returns [saturday, sunday, monday] for a plain Monday', () => {
    expect(reportDateRange('2026-09-21')).toEqual(['2026-09-19', '2026-09-20', '2026-09-21']);
  });

  it('rolls back correctly across a month boundary', () => {
    expect(reportDateRange('2026-03-02')).toEqual(['2026-02-28', '2026-03-01', '2026-03-02']);
  });

  it('rolls back correctly across a year boundary', () => {
    expect(reportDateRange('2029-01-01')).toEqual(['2028-12-30', '2028-12-31', '2029-01-01']);
  });

  it.each(['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'])(
    'returns a single-element array for a plain weekday (%s)',
    (date) => {
      expect(reportDateRange(date)).toEqual([date]);
    },
  );
});
