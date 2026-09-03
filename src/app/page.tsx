import { getRecentArticles } from '@/lib/db';
import { ArticleList } from '@/components/ArticleList';
import { FilterBar } from '@/components/FilterBar';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string; tag?: string; search?: string }>;
}) {
  const params = await searchParams;
  const tier = params.tier ? (Number(params.tier) as 1 | 2 | 3) : undefined;

  const articles = await getRecentArticles({
    tier,
    tag: params.tag || undefined,
    search: params.search || undefined,
    limit: 50,
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Healthcare Intelligence Radar</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">보험사 헬스케어 관점 뉴스 센싱 대시보드</p>
      <FilterBar tier={tier} tag={params.tag} search={params.search} />
      <div className="overflow-hidden rounded-lg border">
        <ArticleList articles={articles} />
      </div>
    </main>
  );
}
