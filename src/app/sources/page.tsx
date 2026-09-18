import Link from 'next/link';
import { getSourceHealth, type SourceHealthRow } from '@/lib/db';
import { SOURCES } from '@/lib/sources.config';
import { TIER_LABELS } from '@/lib/sourceLookup';
import { Badge } from '@/components/ui/badge';

// no static params to make this dynamic automatically (unlike / with its searchParams) -- this
// page's whole purpose is showing the latest state, so it must never serve a build-time snapshot
export const dynamic = 'force-dynamic';

// no data yet for a configured source (e.g. added but no collectAll() run has completed since
// deploy) -- rendered as its own row state below rather than silently omitted, since a source
// that's never once produced a health row is exactly as worth noticing as one that's broken.
type Row = { sourceId: string; name: string; tier: 1 | 2 | 3; health: SourceHealthRow | null };

function statusOf(health: SourceHealthRow | null): { label: string; variant: 'destructive' | 'outline' | 'secondary'; className?: string } {
  if (!health) return { label: '데이터 없음', variant: 'secondary' };
  if (health.consecutiveErrors >= 2) return { label: `연속 오류 ${health.consecutiveErrors}회`, variant: 'destructive' };
  if (health.error) return { label: '오류 (1회)', variant: 'outline', className: 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200' };
  if (health.consecutiveZeroFetch >= 3) return { label: `연속 0건 수집 ${health.consecutiveZeroFetch}회`, variant: 'destructive' };
  if (health.fetched === 0) return { label: '0건 수집 (1회)', variant: 'outline', className: 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200' };
  return { label: '정상', variant: 'outline' };
}

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  return `${Math.round(diffHr / 24)}일 전`;
}

export default async function SourcesPage() {
  const healthRows = await getSourceHealth();
  const healthById = new Map(healthRows.map((h) => [h.sourceId, h]));

  const rows: Row[] = SOURCES.map((s) => ({
    sourceId: s.id,
    name: s.name,
    tier: s.tier,
    health: healthById.get(s.id) ?? null,
  }));

  // most-attention-needed first: no data, then error streaks, then zero-fetch streaks, then
  // everything else by tier/name -- this page exists so a broken source is the first thing
  // seen, not something found by scrolling a 38-row alphabetical list
  const severity = (r: Row): number => {
    if (!r.health) return 0;
    if (r.health.consecutiveErrors >= 2) return 1;
    if (r.health.error) return 2;
    if (r.health.consecutiveZeroFetch >= 3) return 3;
    if (r.health.fetched === 0) return 4;
    return 5;
  };
  const sorted = [...rows].sort((a, b) => severity(a) - severity(b) || a.tier - b.tier || a.name.localeCompare(b.name, 'ko'));

  const needsAttention = sorted.filter((r) => severity(r) <= 4).length;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/" className="inline-block">
        <h1 className="text-2xl font-semibold tracking-tight hover:underline">헬스케어 레이더</h1>
      </Link>
      <p className="text-muted-foreground mt-1 mb-1 text-sm">소스별 수집 상태 모니터링</p>
      <p className="text-muted-foreground mb-6 text-xs">
        총 {SOURCES.length}개 소스 · 확인 필요 {needsAttention}개 · collectAll() 실행마다 자동 갱신 (몇 시간 내 최신 상태로 반영)
      </p>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground border-b text-left">
            <tr>
              <th className="px-4 py-2 font-medium">소스</th>
              <th className="px-4 py-2 font-medium">등급</th>
              <th className="px-4 py-2 font-medium">상태</th>
              <th className="px-4 py-2 font-medium">최근 수집</th>
              <th className="px-4 py-2 font-medium">가져옴/추가됨</th>
              <th className="px-4 py-2 font-medium">중복/무관 제외</th>
              <th className="px-4 py-2 font-medium">오류 메시지</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((r) => {
              const status = statusOf(r.health);
              return (
                <tr key={r.sourceId}>
                  <td className="px-4 py-2">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-muted-foreground text-xs">{r.sourceId}</div>
                  </td>
                  <td className="text-muted-foreground px-4 py-2">{TIER_LABELS[r.tier]}</td>
                  <td className="px-4 py-2">
                    <Badge variant={status.variant} className={status.className}>
                      {status.label}
                    </Badge>
                  </td>
                  <td className="text-muted-foreground px-4 py-2" title={r.health ? r.health.lastRunAt.toISOString() : undefined}>
                    {r.health ? relativeTime(r.health.lastRunAt) : '-'}
                  </td>
                  <td className="px-4 py-2">{r.health ? `${r.health.fetched} / ${r.health.inserted}` : '-'}</td>
                  <td className="text-muted-foreground px-4 py-2">
                    {r.health ? `중복 ${r.health.skippedDuplicate} · 무관 ${r.health.skippedNoTagMatch}${r.health.skippedInvalidUrl > 0 ? ` · URL오류 ${r.health.skippedInvalidUrl}` : ''}` : '-'}
                  </td>
                  <td className="max-w-xs truncate px-4 py-2 text-red-600 dark:text-red-400" title={r.health?.error ?? undefined}>
                    {r.health?.error ?? ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
