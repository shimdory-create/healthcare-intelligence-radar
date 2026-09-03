import { ArticleCard } from './ArticleCard';
import type { ArticleRow } from '@/lib/db';

export function ArticleList({ articles }: { articles: ArticleRow[] }) {
  if (articles.length === 0) {
    return <p>조건에 맞는 기사가 없습니다.</p>;
  }
  return (
    <div>
      {articles.map((a) => (
        <ArticleCard key={a.id} article={a} />
      ))}
    </div>
  );
}
