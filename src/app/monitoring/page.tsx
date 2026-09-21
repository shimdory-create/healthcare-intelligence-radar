import Link from 'next/link';
import { getSourceHealth, getRecentPipelineRuns, type SourceHealthRow, type PipelineRunRow } from '@/lib/db';
import { SOURCES } from '@/lib/sources.config';
import { TIER_LABELS } from '@/lib/sourceLookup';
import { Badge } from '@/components/ui/badge';

// no static params to make this dynamic automatically (unlike / with its searchParams) -- this
// page's whole purpose is showing the latest state, so it must never serve a build-time snapshot
export const dynamic = 'force-dynamic';

// no data yet for a configured source (e.g. added but no collectAll() run has completed since
// deploy) -- rendered as its own row state below rather than silently omitted, since a source
// that's never once produced a health row is exactly as worth noticing as one that's broken.
type SourceRow = { sourceId: string; name: string; tier: 1 | 2 | 3; health: SourceHealthRow | null };

function sourceStatusOf(health: SourceHealthRow | null): { label: string; variant: 'destructive' | 'outline' | 'secondary'; className?: string } {
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

const ROUTE_LABELS: Record<string, string> = {
  collect: '일일 수집+리포트 (08:00)',
  enrich: '인트라데이 수집',
};

// short annotations for sources whose current error/저수율 pattern has already been
// investigated -- shown directly next to the source so a recurring, already-understood
// issue doesn't read as a new one needing fresh investigation. kicaa is worded differently
// on purpose: it's being watched, not root-caused -- don't blur that distinction with the
// other three, which are confirmed and accepted as unfixable from app code. See
// project_source_coverage_and_monitoring.md for the full diagnosis of each.
const KNOWN_ISSUES: Record<string, string> = {
  khidi: '원인 파악됨: Vercel 아웃바운드 IP 차단(2026-09-18 확인, hankyung과 동일 패턴) — 수용, 대체 경로 없음(뉴스사가 아니라 네이버 채널 없음)',
  kicaa: '원인 부분 파악(2026-09-21): 로컬은 항상 정상, 프로덕션에서만 간헐적 0건/연결오류 — 재시도 로직 추가로 연결오류는 해결됐으나 0건은 재발(hankyung/khidi와 유사한 Vercel IP 소프트 차단 추정), 대체 경로 없음(협회 자체 사이트뿐)',
  // hankyung/joongang intentionally have NO entry here -- 2026-09-20, both switched from their
  // blocked/near-zero-yield methods to scraping their official Naver News channels instead
  // (see sources.config.ts). Genuine fix attempts, verified live from Vercel -- if either
  // starts failing again, that's new information worth looking at fresh, not something to
  // wave off as the old accepted issue.
};

function StageCell({ value }: { value: string | null }) {
  if (value === null) return <span className="text-muted-foreground">-</span>;
  const isError = value.startsWith('error');
  return (
    <span className={isError ? 'text-red-600 dark:text-red-400' : undefined} title={value}>
      {value.length > 40 ? `${value.slice(0, 40)}…` : value}
    </span>
  );
}

export default async function MonitoringPage() {
  const [healthRows, runs] = await Promise.all([getSourceHealth(), getRecentPipelineRuns(20)]);
  const healthById = new Map(healthRows.map((h) => [h.sourceId, h]));

  const sourceRows: SourceRow[] = SOURCES.map((s) => ({
    sourceId: s.id,
    name: s.name,
    tier: s.tier,
    health: healthById.get(s.id) ?? null,
  }));

  // most-attention-needed first: no data, then error streaks, then zero-fetch streaks, then
  // everything else by tier/name -- this page exists so a broken source is the first thing
  // seen, not something found by scrolling a 39-row alphabetical list
  const severity = (r: SourceRow): number => {
    if (!r.health) return 0;
    if (r.health.consecutiveErrors >= 2) return 1;
    if (r.health.error) return 2;
    if (r.health.consecutiveZeroFetch >= 3) return 3;
    if (r.health.fetched === 0) return 4;
    return 5;
  };
  const sortedSources = [...sourceRows].sort((a, b) => severity(a) - severity(b) || a.tier - b.tier || a.name.localeCompare(b.name, 'ko'));
  const needsAttention = sortedSources.filter((r) => severity(r) <= 4).length;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/" className="inline-block">
        <h1 className="text-2xl font-semibold tracking-tight hover:underline">헬스케어 레이더</h1>
      </Link>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">파이프라인 모니터링 — 수집 · AI 분석 · 리포트 · 발송 전 과정</p>

      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold">소스별 수집 상태</h2>
        <p className="text-muted-foreground mb-3 text-xs">
          총 {SOURCES.length}개 소스 · 확인 필요 {needsAttention}개 · collectAll() 실행마다 자동 갱신
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
              {sortedSources.map((r) => {
                const status = sourceStatusOf(r.health);
                return (
                  <tr key={r.sourceId}>
                    <td className="px-4 py-2">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-muted-foreground text-xs">{r.sourceId}</div>
                      {KNOWN_ISSUES[r.sourceId] && (
                        <div className="mt-1 max-w-[14rem] text-xs text-blue-600 dark:text-blue-400">
                          {KNOWN_ISSUES[r.sourceId]}
                        </div>
                      )}
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
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold">최근 실행 이력</h2>
        <p className="text-muted-foreground mb-3 text-xs">
          AI 분석 · 중복 제거 · 리포트 생성 · 이메일/카카오 발송 — cron 라우트 실행마다 기록 (최근 {runs.length}건)
        </p>
        {runs.length === 0 ? (
          <p className="text-muted-foreground text-sm">아직 기록된 실행이 없습니다.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground border-b text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">시각</th>
                  <th className="px-4 py-2 font-medium">유형</th>
                  <th className="px-4 py-2 font-medium">상태</th>
                  <th className="px-4 py-2 font-medium">AI 분석</th>
                  <th className="px-4 py-2 font-medium">중복 제거</th>
                  <th className="px-4 py-2 font-medium">리포트</th>
                  <th className="px-4 py-2 font-medium">이메일</th>
                  <th className="px-4 py-2 font-medium">카카오</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {runs.map((run: PipelineRunRow) => (
                  <tr key={run.id}>
                    <td className="text-muted-foreground px-4 py-2" title={run.startedAt.toISOString()}>
                      {relativeTime(run.startedAt)}
                    </td>
                    <td className="px-4 py-2">{ROUTE_LABELS[run.route] ?? run.route}</td>
                    <td className="px-4 py-2">
                      <Badge variant={run.hasError ? 'destructive' : 'outline'}>{run.hasError ? '오류' : '정상'}</Badge>
                    </td>
                    <td className="px-4 py-2">
                      <StageCell value={run.aiResult} />
                    </td>
                    <td className="px-4 py-2">
                      <StageCell value={run.dedupeResult} />
                    </td>
                    <td className="px-4 py-2">
                      <StageCell value={run.reportResult} />
                    </td>
                    <td className="px-4 py-2">
                      <StageCell value={run.emailResult} />
                    </td>
                    <td className="px-4 py-2">
                      <StageCell value={run.kakaoResult} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
