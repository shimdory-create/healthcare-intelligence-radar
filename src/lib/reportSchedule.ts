import { isNonBusinessDay } from './holidays';

// Generous upper bound on how many consecutive non-business days can precede a business day
// (longest realistic Korean stretch is ~6: a 3-day Chuseok/Seollal adjacent to a weekend).
// Guards the walk-back loop below against ever spinning unbounded if isNonBusinessDay were
// ever wrong for a long unbroken run of dates.
const MAX_ROLLUP_DAYS = 14;

/** returns the KST collected-date(s) this report run should cover, or null on a non-business
 *  day (weekend or a listed public holiday -- see holidays.ts) since no report is sent that
 *  day anyway. A business day rolls up every immediately-preceding non-business day plus
 *  itself -- e.g. a normal Tuesday covers just itself, a Monday after a plain weekend covers
 *  Sat+Sun+Mon, and a business day right after a midweek holiday (or a holiday adjacent to a
 *  weekend) covers that whole non-business stretch plus itself. This generalizes what used to
 *  be a Monday-only special case so a weekday holiday's high-priority findings aren't silently
 *  dropped (the report they'd have been in gets skipped like the email on the holiday itself,
 *  since nothing is sent that day -- but nothing is lost, because the next business day's
 *  range reaches back and picks them up).
 *
 *  `collectedDate` is a plain 'YYYY-MM-DD' KST calendar date (see getLatestCollectionDate in
 *  db.ts, which derives it via `at time zone 'Asia/Seoul'`). Uses Date.UTC/getUTCDay for
 *  weekday math (same as isNonBusinessDay), not `new Date(...).getDay()`, which reads the
 *  *runtime's local* timezone -- on Vercel that's UTC, not KST, and would silently shift every
 *  date's weekday by one. */
export function reportDateRange(collectedDate: string): string[] | null {
  if (isNonBusinessDay(collectedDate)) return null;

  const [y, m, d] = collectedDate.split('-').map(Number);
  const DAY_MS = 24 * 60 * 60 * 1000;
  const toDateStr = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  const precedingDays: string[] = [];
  let cursorMs = Date.UTC(y, m - 1, d) - DAY_MS;
  while (precedingDays.length < MAX_ROLLUP_DAYS) {
    const cursorDate = toDateStr(cursorMs);
    if (!isNonBusinessDay(cursorDate)) break;
    precedingDays.push(cursorDate);
    cursorMs -= DAY_MS;
  }

  return [...precedingDays.reverse(), collectedDate];
}
