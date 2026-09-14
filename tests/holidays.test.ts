import { describe, it, expect } from 'vitest';
import { isNonBusinessDay } from '@/lib/holidays';

describe('isNonBusinessDay', () => {
  it('treats Saturday and Sunday as non-business days', () => {
    expect(isNonBusinessDay('2026-09-12')).toBe(true); // Saturday
    expect(isNonBusinessDay('2026-09-13')).toBe(true); // Sunday
  });

  it('treats an ordinary weekday as a business day', () => {
    expect(isNonBusinessDay('2026-09-15')).toBe(false); // Tuesday
  });

  it('treats a listed weekday holiday as a non-business day', () => {
    expect(isNonBusinessDay('2026-01-01')).toBe(true); // 신정, Thursday
    expect(isNonBusinessDay('2026-05-05')).toBe(true); // 어린이날, Tuesday
    expect(isNonBusinessDay('2026-12-25')).toBe(true); // 크리스마스, Friday
  });

  it('treats each day of a multi-day weekday holiday as a non-business day', () => {
    expect(isNonBusinessDay('2026-02-16')).toBe(true);
    expect(isNonBusinessDay('2026-02-17')).toBe(true);
    expect(isNonBusinessDay('2026-02-18')).toBe(true);
  });

  it('does not need a separate entry for a holiday that already falls on a weekend', () => {
    // 현충일 2026-06-06 falls on a Saturday -- covered by the weekend check alone
    expect(isNonBusinessDay('2026-06-06')).toBe(true);
  });

  it('is timezone-independent (uses UTC date math, not the runtime local timezone)', () => {
    const originalTZ = process.env.TZ;
    try {
      process.env.TZ = 'America/New_York';
      expect(isNonBusinessDay('2026-09-15')).toBe(false); // Tuesday
      expect(isNonBusinessDay('2026-09-12')).toBe(true); // Saturday
    } finally {
      process.env.TZ = originalTZ;
    }
  });

  it('returns false for an ordinary weekday in a year with no holiday list configured', () => {
    expect(isNonBusinessDay('2027-06-15')).toBe(false); // Tuesday, no 2027 entries yet
  });

  it('applies fixed no-substitute holidays permanently, with no yearly entry needed', () => {
    expect(isNonBusinessDay('2027-01-01')).toBe(true); // 신정, Friday, no 2027 entries exist
  });

  it('applies the base date of a substitute-eligible fixed holiday permanently, with no yearly entry needed', () => {
    expect(isNonBusinessDay('2027-05-05')).toBe(true); // 어린이날, Wednesday, no 2027 entries exist
  });

  it('does not know about a substitute day for a fixed holiday in a year with no entry', () => {
    // if a 2027 FIXED_SUBSTITUTE_ELIGIBLE date lands on a weekend, its substitute weekday
    // needs a 2027 WEEKDAY_HOLIDAYS entry to be caught -- this documents that gap, not a bug
    expect(isNonBusinessDay('2027-08-16')).toBe(false); // hypothetical substitute Monday, not listed
  });

  it('does not catch a lunar-calendar holiday in a year with no entry', () => {
    expect(isNonBusinessDay('2027-02-08')).toBe(false); // hypothetical Seollal-adjacent date, not listed
  });
});
