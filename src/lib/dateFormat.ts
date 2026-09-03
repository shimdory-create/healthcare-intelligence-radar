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
