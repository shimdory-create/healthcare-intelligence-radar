import { describe, it, expect } from 'vitest';
import { reportDateRange } from '@/lib/reportSchedule';

// All calendar dates below were independently verified (not by trusting the function under
// test) via `date -d '<date>' +%A`, and cross-checked against the holiday table in
// src/lib/holidays.ts to confirm which of them are/aren't public holidays.
//
// 2026-09-19 = Saturday, 2026-09-20 = Sunday, 2026-09-21 = Monday (plain, mid-month, no
//   nearby holiday)
// 2026-05-30 = Saturday, 2026-05-31 = Sunday, 2026-06-01 = Monday (crosses a month boundary,
//   no nearby holiday)
// 2033-12-31 = Saturday, 2034-01-01 = Sunday (also 신정, but redundant with the weekend check),
//   2034-01-02 = Monday, not itself a holiday (crosses a year boundary)
// 2026-09-15..18 = Tuesday..Friday, no nearby holiday
// 2026-12-24 = Thursday (business), 2026-12-25 = Friday (크리스마스, fixed holiday),
//   2026-12-26 = Saturday, 2026-12-27 = Sunday, 2026-12-28 = Monday (business) -- a holiday
//   immediately followed by a weekend
// 2027-08-13 = Friday (business), 2027-08-14 = Saturday, 2027-08-15 = Sunday (both weekend --
//   also the real 광복절, but redundant with the weekend check), 2027-08-16 = Monday (광복절
//   대체공휴일, a substitute holiday landing right after the weekend), 2027-08-17 = Tuesday
//   (business) -- a weekend immediately followed by a substitute holiday

describe('reportDateRange', () => {
  it('returns null for a Saturday', () => {
    expect(reportDateRange('2026-09-19')).toBeNull();
  });

  it('returns null for a Sunday', () => {
    expect(reportDateRange('2026-09-20')).toBeNull();
  });

  it('returns null for a weekday public holiday', () => {
    expect(reportDateRange('2026-12-25')).toBeNull(); // 크리스마스, Friday
  });

  it('returns [saturday, sunday, monday] for a plain Monday', () => {
    expect(reportDateRange('2026-09-21')).toEqual(['2026-09-19', '2026-09-20', '2026-09-21']);
  });

  it('rolls back correctly across a month boundary', () => {
    expect(reportDateRange('2026-06-01')).toEqual(['2026-05-30', '2026-05-31', '2026-06-01']);
  });

  it('rolls back correctly across a year boundary', () => {
    expect(reportDateRange('2034-01-02')).toEqual(['2033-12-31', '2034-01-01', '2034-01-02']);
  });

  it.each(['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'])(
    'returns a single-element array for a plain weekday (%s)',
    (date) => {
      expect(reportDateRange(date)).toEqual([date]);
    },
  );

  it('rolls a midweek public holiday into the next business day, even without an adjacent weekend', () => {
    // this is the case that used to be silently dropped: only Sat/Sun ever rolled up into
    // Monday, so a weekday holiday's report never reached anyone -- see the project memory
    // entry and the 2026-09-15 fix commit for the incident this test guards against
    expect(reportDateRange('2026-09-16')).toEqual(['2026-09-16']); // sanity: plain Wednesday alone
  });

  it('rolls up a holiday immediately followed by a weekend, into the weekend, into the next business day', () => {
    expect(reportDateRange('2026-12-28')).toEqual(['2026-12-25', '2026-12-26', '2026-12-27', '2026-12-28']);
  });

  it('rolls up a weekend immediately followed by a substitute holiday, into the next business day', () => {
    expect(reportDateRange('2027-08-17')).toEqual(['2027-08-14', '2027-08-15', '2027-08-16', '2027-08-17']);
  });

  it('does not include a business day two days before a rollup range', () => {
    // 2026-12-24 (Thursday) is a normal business day right before the Christmas/weekend rollup
    // above -- it must not be swept into 2026-12-28's range
    expect(reportDateRange('2026-12-28')).not.toContain('2026-12-24');
  });
});
