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

/** Everything that can't be reduced to a fixed month/day rule above: lunar-calendar holidays
 *  (설날, 추석, 부처님오신날 -- date shifts every year) and substitute holidays for the
 *  FIXED_SUBSTITUTE_ELIGIBLE dates (only needed in years the original lands on a weekend).
 *  Only dates landing on Mon-Fri are listed -- a weekend-falling date needs no entry since the
 *  weekend check already covers it. By year. Sourced 2026-09-15 from
 *  https://gyesan.co.kr/guides/workday-2026-holidays.
 *
 *  Requires a yearly update -- add next year's entries before this one runs out. Until then,
 *  isNonBusinessDay silently falls back to the FIXED_* rules plus weekends only for any year
 *  with no entry here, which under-counts non-business days (misses lunar holidays and that
 *  year's substitute days) but never over-counts. */
const WEEKDAY_HOLIDAYS: Record<string, string[]> = {
  '2026': [
    '2026-02-16', // 설 연휴
    '2026-02-17', // 설날
    '2026-02-18', // 설 연휴
    '2026-03-02', // 삼일절 대체공휴일 (3.1이 일요일)
    '2026-05-25', // 부처님오신날 대체공휴일 (5.24 부처님오신날 자체가 일요일)
    '2026-08-17', // 광복절 대체공휴일 (8.15가 토요일)
    '2026-09-24', // 추석 연휴
    '2026-09-25', // 추석
    '2026-10-05', // 개천절 대체공휴일 (10.3이 토요일)
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
