import Link from 'next/link';
import { PriorityBadge } from './PriorityBadge';
import type { ArticleRow } from '@/lib/db';

export function ArticleCard({ article }: { article: ArticleRow }) {
  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid #e5e5e5' }}>
      <PriorityBadge score={article.score} />{' '}
      <Link href={`/article/${article.id}`}>{article.title}</Link>
      <div style={{ fontSize: 12, color: '#666' }}>
        {article.sourceId} · {article.tags.join(', ') || '태그 없음'}
      </div>
    </div>
  );
}
