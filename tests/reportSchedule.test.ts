import { describe, it, expect } from 'vitest';
import { datesSince, previousKstDate } from '@/lib/reportSchedule';

describe('datesSince', () => {
  it('returns a single date for a normal one-day gap', () => {
    expect(datesSince('2026-09-17', '2026-09-18')).toEqual(['2026-09-18']);
  });

  it('returns every date strictly after the watermark through and including the target date', () => {
    expect(datesSince('2026-09-15', '2026-09-18')).toEqual(['2026-09-16', '2026-09-17', '2026-09-18']);
  });

  it('spans a weekend with no special-casing needed -- every date in the gap is just included', () => {
    // Friday report already sent through 2026-09-18 (Friday); next report on Monday
    // 2026-09-21 should pick up Sat/Sun/Mon in one pass
    expect(datesSince('2026-09-18', '2026-09-21')).toEqual(['2026-09-19', '2026-09-20', '2026-09-21']);
  });

  it('handles the case the old rollup design could not: a preceding business day\'s own leftover afternoon', () => {
    // under the new intraday-collection schedule, Friday's afternoon collection happens
    // AFTER Friday's own morning report already went out -- so Friday itself (a business
    // day) is a pending chunk the Monday report must still include, not just the weekend
    const range = datesSince('2026-09-17', '2026-09-21'); // watermark = Thursday (last report morning)
    expect(range).toContain('2026-09-18'); // Friday itself is included
  });

  it('rolls back correctly across a month boundary', () => {
    expect(datesSince('2026-05-29', '2026-06-01')).toEqual(['2026-05-30', '2026-05-31', '2026-06-01']);
  });

  it('rolls back correctly across a year boundary', () => {
    expect(datesSince('2033-12-30', '2034-01-02')).toEqual(['2033-12-31', '2034-01-01', '2034-01-02']);
  });

  it('returns an empty array when there is nothing new since the last report', () => {
    expect(datesSince('2026-09-18', '2026-09-18')).toEqual([]);
  });

  it('returns an empty array when the watermark is somehow ahead of the target date', () => {
    expect(datesSince('2026-09-19', '2026-09-18')).toEqual([]);
  });

  it('caps the span at MAX_REPORT_SPAN_DAYS as a safety net against a stuck watermark', () => {
    const range = datesSince('2020-01-01', '2026-09-18');
    expect(range).toHaveLength(14);
  });
});

describe('previousKstDate', () => {
  it('returns the day before, in the same YYYY-MM-DD shape', () => {
    expect(previousKstDate('2026-09-18')).toBe('2026-09-17');
  });

  it('rolls back correctly across a month boundary', () => {
    expect(previousKstDate('2026-06-01')).toBe('2026-05-31');
  });

  it('rolls back correctly across a year boundary', () => {
    expect(previousKstDate('2026-01-01')).toBe('2025-12-31');
  });
});
