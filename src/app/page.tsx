import { getRecentArticles } from '@/lib/db';
import { ArticleList } from '@/components/ArticleList';

export default async function HomePage() {
  const articles = await getRecentArticles({ limit: 50 });

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <h1>Healthcare Intelligence Radar</h1>
      <ArticleList articles={articles} />
    </main>
  );
}
