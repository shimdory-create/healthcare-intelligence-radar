/** Solar-calendar holidays with a fixed month/day every year that the 관공서의 공휴일에 관한
 *  규정 grants NO substitute holiday for even when they land on a weekend -- 근로자의 날 isn't
 *  a 공휴일 at all (separate law), so it has no substitute mechanism either way. Permanent:
 *  never needs a yearly update. */
const FIXED_NO_SUBSTITUTE: [month: number, day: number][] = [
  [1, 1], // 신정
  [5, 1], // 근로자의 날 (법정 공휴일이 아닌 별도 법률 대상)
  [6, 6], // 현충일
  [12, 25], // 크리스마스
];

/** Solar-calendar holidays with a fixed month/day every year that DO get a substitute holiday
 *  when they land on a weekend -- the original date itself never moves, so it's permanent.
 *  Only the substitute day (added in whichever years the original falls on Sat/Sun) needs a
 *  yearly lookup, in WEEKDAY_HOLIDAYS below. */
const FIXED_SUBSTITUTE_ELIGIBLE: [month: number, day: number][] = [
  [3, 1], // 삼일절
  [5, 5], // 어린이날
  [8, 15], // 광복절
  [10, 3], // 개천절
  [10, 9], // 한글날
];

/** Lunar-calendar holidays (설날, 추석, 부처님오신날) plus that year's substitute-holiday days,
 *  by year. Lunar dates were computed deterministically with the `korean_lunar_calendar`
 *  PyPI package (a KASI-based lunar/solar converter), not scraped from a web table -- a wiki
 *  table cross-check during generation (2026-09-15) turned out to have off-by-one errors on
 *  more than one entry, which this library's output contradicted and was independently
 *  confirmed against 3+ other sources, so scraped tables were discarded as a source entirely.
 *
 *  Substitute-holiday rule applied (per 관공서의 공휴일에 관한 규정 §3, confirmed 2026-09-15):
 *  설날/추석's 3-day span gets a substitute only if one of the 3 days is a SUNDAY (Saturday
 *  overlap alone does not trigger one); every other holiday here (삼일절, 어린이날, 광복절,
 *  개천절, 한글날, 부처님오신날) gets a substitute for either Saturday or Sunday overlap. The
 *  substitute lands on the next date that is not itself a weekend or another holiday already
 *  in this table for that year.
 *
 *  Only dates landing on Mon-Fri are listed -- a weekend-falling date needs no entry since the
 *  weekend check in isNonBusinessDay already covers it.
 *
 *  Covers 2026-2041. Extend this table (same computation method) before it runs out -- see
 *  isNonBusinessDay's fallback behavior for a year with no entry. */
const WEEKDAY_HOLIDAYS: Record<string, string[]> = {
  '2026': [
    '2026-02-16', // 설날 (월)
    '2026-02-17', // 설날 (화)
    '2026-02-18', // 설날 (수)
    '2026-03-02', // 삼일절 대체공휴일 (월)
    '2026-05-25', // 부처님오신날 대체공휴일 (월)
    '2026-08-17', // 광복절 대체공휴일 (월)
    '2026-09-24', // 추석 (목)
    '2026-09-25', // 추석 (금)
    '2026-10-05', // 개천절 대체공휴일 (월)
  ],
  '2027': [
    '2027-02-08', // 설날 (월)
    '2027-02-09', // 설날 대체공휴일 (화)
    '2027-05-13', // 부처님오신날 (목)
    '2027-08-16', // 광복절 대체공휴일 (월)
    '2027-09-14', // 추석 (화)
    '2027-09-15', // 추석 (수)
    '2027-09-16', // 추석 (목)
    '2027-10-04', // 개천절 대체공휴일 (월)
    '2027-10-11', // 한글날 대체공휴일 (월)
  ],
  '2028': [
    '2028-01-26', // 설날 (수)
    '2028-01-27', // 설날 (목)
    '2028-01-28', // 설날 (금)
    '2028-05-02', // 부처님오신날 (화)
    '2028-10-02', // 추석 (월)
    '2028-10-03', // 추석 (화)
    '2028-10-04', // 추석 (수)
  ],
  '2029': [
    '2029-02-12', // 설날 (월)
    '2029-02-13', // 설날 (화)
    '2029-02-14', // 설날 (수)
    '2029-05-07', // 어린이날 대체공휴일 (월)
    '2029-05-21', // 부처님오신날 대체공휴일 (월)
    '2029-09-21', // 추석 (금)
    '2029-09-24', // 추석 대체공휴일 (월)
  ],
  '2030': [
    '2030-02-04', // 설날 (월)
    '2030-02-05', // 설날 대체공휴일 (화)
    '2030-05-06', // 어린이날 대체공휴일 (월)
    '2030-05-09', // 부처님오신날 (목)
    '2030-09-11', // 추석 (수)
    '2030-09-12', // 추석 (목)
    '2030-09-13', // 추석 (금)
  ],
  '2031': [
    '2031-01-22', // 설날 (수)
    '2031-01-23', // 설날 (목)
    '2031-01-24', // 설날 (금)
    '2031-03-03', // 삼일절 대체공휴일 (월)
    '2031-05-28', // 부처님오신날 (수)
    '2031-09-30', // 추석 (화)
    '2031-10-01', // 추석 (수)
    '2031-10-02', // 추석 (목)
  ],
  '2032': [
    '2032-02-10', // 설날 (화)
    '2032-02-11', // 설날 (수)
    '2032-02-12', // 설날 (목)
    '2032-05-17', // 부처님오신날 대체공휴일 (월)
    '2032-08-16', // 광복절 대체공휴일 (월)
    '2032-09-20', // 추석 (월)
    '2032-09-21', // 추석 대체공휴일 (화)
    '2032-10-04', // 개천절 대체공휴일 (월)
    '2032-10-11', // 한글날 대체공휴일 (월)
  ],
  '2033': [
    '2033-01-31', // 설날 (월)
    '2033-02-01', // 설날 (화)
    '2033-02-02', // 설날 대체공휴일 (수)
    '2033-05-06', // 부처님오신날 (금)
    '2033-09-07', // 추석 (수)
    '2033-09-08', // 추석 (목)
    '2033-09-09', // 추석 (금)
    '2033-10-10', // 한글날 대체공휴일 (월)
  ],
  '2034': [
    '2034-02-20', // 설날 (월)
    '2034-02-21', // 설날 대체공휴일 (화)
    '2034-05-25', // 부처님오신날 (목)
    '2034-09-26', // 추석 (화)
    '2034-09-27', // 추석 (수)
    '2034-09-28', // 추석 (목)
  ],
  '2035': [
    '2035-02-07', // 설날 (수)
    '2035-02-08', // 설날 (목)
    '2035-02-09', // 설날 (금)
    '2035-05-07', // 어린이날 대체공휴일 (월)
    '2035-05-15', // 부처님오신날 (화)
    '2035-09-17', // 추석 (월)
    '2035-09-18', // 추석 대체공휴일 (화)
  ],
  '2036': [
    '2036-01-28', // 설날 (월)
    '2036-01-29', // 설날 (화)
    '2036-01-30', // 설날 대체공휴일 (수)
    '2036-03-03', // 삼일절 대체공휴일 (월)
    '2036-05-06', // 부처님오신날 대체공휴일 (화)
    '2036-10-03', // 추석 (금)
    '2036-10-06', // 추석 대체공휴일 (월)
  ],
  '2037': [
    '2037-02-16', // 설날 (월)
    '2037-02-17', // 설날 대체공휴일 (화)
    '2037-03-02', // 삼일절 대체공휴일 (월)
    '2037-05-22', // 부처님오신날 (금)
    '2037-08-17', // 광복절 대체공휴일 (월)
    '2037-09-23', // 추석 (수)
    '2037-09-24', // 추석 (목)
    '2037-09-25', // 추석 (금)
    '2037-10-05', // 개천절 대체공휴일 (월)
  ],
  '2038': [
    '2038-02-03', // 설날 (수)
    '2038-02-04', // 설날 (목)
    '2038-02-05', // 설날 (금)
    '2038-05-11', // 부처님오신날 (화)
    '2038-08-16', // 광복절 대체공휴일 (월)
    '2038-09-13', // 추석 (월)
    '2038-09-14', // 추석 (화)
    '2038-09-15', // 추석 대체공휴일 (수)
    '2038-10-04', // 개천절 대체공휴일 (월)
    '2038-10-11', // 한글날 대체공휴일 (월)
  ],
  '2039': [
    '2039-01-24', // 설날 (월)
    '2039-01-25', // 설날 (화)
    '2039-01-26', // 설날 대체공휴일 (수)
    '2039-05-02', // 부처님오신날 대체공휴일 (월)
    '2039-10-03', // 추석 (월)
    '2039-10-04', // 추석 대체공휴일 (화)
    '2039-10-10', // 한글날 대체공휴일 (월)
  ],
  '2040': [
    '2040-02-13', // 설날 (월)
    '2040-02-14', // 설날 대체공휴일 (화)
    '2040-05-07', // 어린이날 대체공휴일 (월)
    '2040-05-18', // 부처님오신날 (금)
    '2040-09-20', // 추석 (목)
    '2040-09-21', // 추석 (금)
  ],
  '2041': [
    '2041-01-31', // 설날 (목)
    '2041-02-01', // 설날 (금)
    '2041-05-06', // 어린이날 대체공휴일 (월)
    '2041-05-07', // 부처님오신날 (화)
    '2041-09-09', // 추석 (월)
    '2041-09-10', // 추석 (화)
    '2041-09-11', // 추석 (수)
  ],
};

/** true for Saturday, Sunday, or a South Korean public holiday -- i.e. not a business day.
 *  `dateStr` is a plain 'YYYY-MM-DD' KST calendar date (matches collected_at's KST date
 *  elsewhere in this codebase). Uses Date.UTC/getUTCDay for weekday, same as
 *  reportSchedule.ts's reportDateRange, so the result never depends on the runtime's local
 *  timezone. */
export function isNonBusinessDay(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun ... 6=Sat
  if (day === 0 || day === 6) return true;

  if (FIXED_NO_SUBSTITUTE.some(([fm, fd]) => fm === m && fd === d)) return true;
  if (FIXED_SUBSTITUTE_ELIGIBLE.some(([fm, fd]) => fm === m && fd === d)) return true;

  const year = dateStr.slice(0, 4);
  return (WEEKDAY_HOLIDAYS[year] ?? []).includes(dateStr);
}
