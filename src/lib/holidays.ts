/** Weekday-falling South Korean public holidays, by year. Requires a yearly update -- most
 *  Korean holidays are lunar-calendar-based (설날, 추석, 부처님오신날) and substitute-holiday
 *  assignment depends on which weekday the original date falls on that year, so this can't be
 *  computed from a fixed formula. Only dates that land on Mon-Fri are listed here; a holiday
 *  that falls on a weekend needs no entry since `isNonBusinessDay` already excludes weekends.
 *  Sourced 2026-09-15 from https://gyesan.co.kr/guides/workday-2026-holidays -- add next
 *  year's dates here before this list runs out, or every holiday next year will be silently
 *  treated as a normal business day. */
const WEEKDAY_HOLIDAYS: Record<string, string[]> = {
  '2026': [
    '2026-01-01', // 신정
    '2026-02-16', // 설 연휴
    '2026-02-17', // 설날
    '2026-02-18', // 설 연휴
    '2026-03-02', // 삼일절 대체공휴일 (3.1이 일요일)
    '2026-05-01', // 근로자의 날 (법정 공휴일은 아니나 통상 휴무)
    '2026-05-05', // 어린이날
    '2026-05-25', // 부처님오신날 대체공휴일 (5.24가 일요일)
    '2026-08-17', // 광복절 대체공휴일 (8.15가 토요일)
    '2026-09-24', // 추석 연휴
    '2026-09-25', // 추석
    '2026-10-05', // 개천절 대체공휴일 (10.3이 토요일)
    '2026-10-09', // 한글날
    '2026-12-25', // 크리스마스
  ],
};

/** true for Saturday, Sunday, or a listed weekday holiday -- i.e. not a business day.
 *  `dateStr` is a plain 'YYYY-MM-DD' KST calendar date (matches collected_at's KST date
 *  elsewhere in this codebase). Uses Date.UTC/getUTCDay for weekday, same as
 *  reportSchedule.ts's reportDateRange, so the result never depends on the runtime's local
 *  timezone. */
export function isNonBusinessDay(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun ... 6=Sat
  if (day === 0 || day === 6) return true;

  const year = dateStr.slice(0, 4);
  return (WEEKDAY_HOLIDAYS[year] ?? []).includes(dateStr);
}
