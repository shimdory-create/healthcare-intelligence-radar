/** returns the KST collected-date(s) this report run should cover, or null on a weekend (no
 *  report). Monday rolls up Saturday+Sunday+Monday since a weekend's volume is too thin to
 *  deserve its own report -- everything else covers just that one day.
 *
 *  `collectedDate` is a plain 'YYYY-MM-DD' KST calendar date (see getLatestCollectionDate in
 *  db.ts, which derives it via `at time zone 'Asia/Seoul'`). Its day-of-week is a fixed fact
 *  independent of any timezone, so this parses the components directly with Date.UTC/getUTCDay
 *  rather than `new Date(...).getDay()` -- the latter reads the *runtime's local* timezone,
 *  which on Vercel is UTC, not KST, and would silently shift every date's weekday by one. */
export function reportDateRange(collectedDate: string): string[] | null {
  const [y, m, d] = collectedDate.split('-').map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  const day = new Date(utcMidnight).getUTCDay(); // 0=Sun ... 6=Sat
  if (day === 0 || day === 6) return null; // Saturday/Sunday: no report
  if (day === 1) {
    const toDateStr = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const DAY_MS = 24 * 60 * 60 * 1000;
    return [toDateStr(utcMidnight - 2 * DAY_MS), toDateStr(utcMidnight - DAY_MS), collectedDate];
  }
  return [collectedDate];
}
