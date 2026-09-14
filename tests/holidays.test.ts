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

  it('returns false for an ordinary weekday with no matching holiday entry', () => {
    expect(isNonBusinessDay('2027-06-15')).toBe(false); // Tuesday, not a holiday
  });

  it('applies fixed no-substitute holidays permanently, in a year with no lunar/substitute entries at all', () => {
    expect(isNonBusinessDay('2042-01-01')).toBe(true); // 신정, Wednesday, beyond the configured table
  });

  it('applies the base date of a substitute-eligible fixed holiday permanently, in a year with no lunar/substitute entries at all', () => {
    expect(isNonBusinessDay('2042-05-05')).toBe(true); // 어린이날, Monday, beyond the configured table
  });

  it('does not know about a substitute day for a fixed holiday in a year with no entry', () => {
    // if a FIXED_SUBSTITUTE_ELIGIBLE date lands on a weekend in a year beyond the configured
    // table, its substitute weekday needs a WEEKDAY_HOLIDAYS entry to be caught -- this
    // documents that gap, not a bug
    expect(isNonBusinessDay('2042-08-18')).toBe(false); // hypothetical substitute Monday, not listed
  });

  it('does not catch a lunar-calendar holiday in a year beyond the configured table', () => {
    expect(isNonBusinessDay('2042-02-10')).toBe(false); // hypothetical Seollal-adjacent date, not listed
  });

  // Spot checks against the computed 2026-2041 table (korean_lunar_calendar / KASI-based
  // conversion, cross-verified 2026-09-15 -- see holidays.ts's module comment). A scraped wiki
  // table used during generation had off-by-one errors on more than one entry, so these lock
  // in specific known-correct dates rather than trusting the source blindly.
  it('gets 2027 Seollal right (a case a since-discarded scraped source got wrong by one day)', () => {
    expect(isNonBusinessDay('2027-02-06')).toBe(true); // Saturday (weekend, not Seollal itself)
    expect(isNonBusinessDay('2027-02-07')).toBe(true); // Sunday, actual Seollal
    expect(isNonBusinessDay('2027-02-08')).toBe(true); // Monday, day after
    expect(isNonBusinessDay('2027-02-09')).toBe(true); // Tuesday, substitute (Seollal overlapped Sunday)
    expect(isNonBusinessDay('2027-02-10')).toBe(false); // Wednesday, back to normal
  });

  it('does not add a substitute for 설날/추석 when they only overlap a Saturday, not a Sunday', () => {
    // 2028 Chuseok: Oct 2 (Mon), Oct 3 (Tue, actual), Oct 4 (Wed) -- no Sunday in the span
    expect(isNonBusinessDay('2028-10-02')).toBe(true);
    expect(isNonBusinessDay('2028-10-03')).toBe(true);
    expect(isNonBusinessDay('2028-10-04')).toBe(true);
    expect(isNonBusinessDay('2028-10-05')).toBe(false); // Thursday, no substitute needed
  });

  it('handles a year with multiple fixed-holiday substitutes landing close together (2032)', () => {
    expect(isNonBusinessDay('2032-10-04')).toBe(true); // 개천절 대체공휴일 (10/3 Sat)
    expect(isNonBusinessDay('2032-10-11')).toBe(true); // 한글날 대체공휴일 (10/9 Sat)
  });
});
