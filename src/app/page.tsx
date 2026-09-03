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
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <h1>Healthcare Intelligence Radar</h1>
      <FilterBar tier={tier} tag={params.tag} search={params.search} />
      <ArticleList articles={articles} />
    </main>
  );
}
