// Generous safety cap on how large a "since the last report" span can grow, in case a stuck
// or missing watermark would otherwise produce an unbounded range (same reasoning as the old
// MAX_ROLLUP_DAYS this replaces).
const MAX_REPORT_SPAN_DAYS = 14;

/** every KST calendar date strictly after `afterDate` (exclusive) through `throughDate`
 *  (inclusive). Used to build the report's collected-date range from a persisted "last
 *  report date" watermark (app_settings) instead of reconstructing it from the business-day
 *  calendar.
 *
 *  This replaced the old business-day rollup (reportDateRange, which walked backward
 *  absorbing only the non-business days immediately preceding a given date) once collection
 *  moved from once daily to several times during business hours. Under that schedule, a
 *  business day's own afternoon collection happens AFTER that morning's report already went
 *  out -- a real pending chunk only the NEXT report can include, and the old rollup never
 *  reached back across a preceding *business* day to pick it up (only weekends/holidays).
 *  "Since the last report" needs no day-of-week special-casing at all: whatever was
 *  collected in the gap -- for whatever reason (a weekend, a holiday, a run that failed) --
 *  is included exactly once, automatically, the next time a report is sent.
 *
 *  Uses Date.UTC/getUTCDate for date math (not `new Date(...).getDate()`, which reads the
 *  *runtime's local* timezone -- on Vercel that's UTC, not KST). Returns an empty array if
 *  `afterDate >= throughDate` (nothing new since the last report) rather than throwing --
 *  callers should treat that as "no report to send", the same as null used to signal on the
 *  old function. */
export function datesSince(afterDate: string, throughDate: string): string[] {
  const [ay, am, ad] = afterDate.split('-').map(Number);
  const [ty, tm, td] = throughDate.split('-').map(Number);
  const DAY_MS = 24 * 60 * 60 * 1000;
  const toDateStr = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  const afterMs = Date.UTC(ay, am - 1, ad);
  const throughMs = Date.UTC(ty, tm - 1, td);

  const dates: string[] = [];
  let cursorMs = afterMs + DAY_MS;
  while (cursorMs <= throughMs && dates.length < MAX_REPORT_SPAN_DAYS) {
    dates.push(toDateStr(cursorMs));
    cursorMs += DAY_MS;
  }
  return dates;
}

/** the KST calendar date one day before `dateStr`, in the same 'YYYY-MM-DD' shape --
 *  the default watermark for a first-ever report run (before app_settings has a
 *  'last_report_date' row), giving that first send the same single-day scope the old
 *  once-daily design always had. */
export function previousKstDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const DAY_MS = 24 * 60 * 60 * 1000;
  return new Date(Date.UTC(y, m - 1, d) - DAY_MS).toISOString().slice(0, 10);
}
