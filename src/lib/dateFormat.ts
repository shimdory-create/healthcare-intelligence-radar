/** formats a KST calendar date ('YYYY-MM-DD') as e.g. "9월 3일 (목)" */
export function formatKstDate(dateStr: string): string {
  // noon avoids any DST/boundary edge cases when formatting a bare calendar date
  return new Date(`${dateStr}T12:00:00+09:00`).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

const WEEKDAY_KR = ['일', '월', '화', '수', '목', '금', '토'];

/** formats a KST calendar date ('YYYY-MM-DD') as e.g. "'26.9.15(화)" -- the compact numeric
 *  style the Market Intelligence report's date line uses, distinct from formatKstDate's longer
 *  "9월 15일 (목)" style used by the digest email/Kakao/dashboard. No leading zeros on
 *  month/day, no space before the weekday parenthesis. Computes the weekday directly with
 *  Date.UTC/getUTCDay (same pattern as reportSchedule.ts/holidays.ts) rather than relying on
 *  Intl's locale-dependent weekday formatting, so the exact output doesn't depend on the
 *  runtime's ICU data. */
export function formatReportDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const weekday = WEEKDAY_KR[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `'${String(y).slice(2)}.${m}.${d}(${weekday})`;
}
