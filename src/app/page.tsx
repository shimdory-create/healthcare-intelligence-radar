import { getRecentArticles, getLatestCollectionDate, getLastCollectedAt, type PriorityFilter } from '@/lib/db';
import { ArticleList } from '@/components/ArticleList';
import { FilterBar } from '@/components/FilterBar';

const PAGE_SIZE = 50;
const VALID_PRIORITIES: PriorityFilter[] = ['high', 'medium', 'low', 'all'];

function formatKstDate(dateStr: string): string {
  // noon avoids any DST/boundary edge cases when formatting a bare calendar date
  return new Date(`${dateStr}T12:00:00+09:00`).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    tier?: string;
    priority?: string;
    sourceId?: string;
    tag?: string;
    search?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const tier = params.tier ? (Number(params.tier) as 1 | 2 | 3) : undefined;
  const priority = VALID_PRIORITIES.includes(params.priority as PriorityFilter)
    ? (params.priority as PriorityFilter)
    : undefined;
  const page = params.page ? Math.max(1, Number(params.page) || 1) : 1;

  const latestDate = (await getLatestCollectionDate()) ?? new Date().toISOString().slice(0, 10);
  const isAllTime = params.date === 'all-time';
  // no `date` param -> default to the latest collection batch; `all-time` -> no date constraint
  const collectedDate = isAllTime ? undefined : (params.date ?? latestDate);

  const [{ articles, hasNextPage }, lastCollectedAt] = await Promise.all([
    getRecentArticles({
      tier,
      priority,
      sourceId: params.sourceId || undefined,
      tag: params.tag || undefined,
      search: params.search || undefined,
      collectedDate,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    getLastCollectedAt(),
  ]);

  function buildPageHref(targetPage: number): string {
    const query = new URLSearchParams();
    if (params.date) query.set('date', params.date);
    if (params.tier) query.set('tier', params.tier);
    if (params.priority) query.set('priority', params.priority);
    if (params.sourceId) query.set('sourceId', params.sourceId);
    if (params.tag) query.set('tag', params.tag);
    if (params.search) query.set('search', params.search);
    if (targetPage > 1) query.set('page', String(targetPage));
    const qs = query.toString();
    return qs ? `/?${qs}` : '/';
  }

  const basisLabel = isAllTime
    ? '전체 기간'
    : collectedDate === latestDate && lastCollectedAt
      ? `${formatKstDate(collectedDate)} · ${lastCollectedAt.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })} 수집`
      : `${formatKstDate(collectedDate!)} 수집분`;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Healthcare Intelligence Radar</h1>
      <p className="text-muted-foreground mt-1 mb-1 text-sm">보험사 헬스케어 관점 뉴스 센싱 대시보드</p>
      <p className="text-muted-foreground mb-4 text-xs">{basisLabel} 기준 조회</p>
      <FilterBar
        tier={tier}
        priority={priority}
        sourceId={params.sourceId}
        currentDate={collectedDate ?? latestDate}
        latestDate={latestDate}
        isAllTime={isAllTime}
        tag={params.tag}
        search={params.search}
      />
      <div className="overflow-hidden rounded-lg border">
        <ArticleList articles={articles} page={page} hasNextPage={hasNextPage} buildPageHref={buildPageHref} />
      </div>
    </main>
  );
}
