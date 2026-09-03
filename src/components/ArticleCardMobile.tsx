import Link from 'next/link';
import { PriorityBadge } from './PriorityBadge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { sourceDisplayName, TIER_LABELS } from '@/lib/sourceLookup';
import type { ArticleRow } from '@/lib/db';

export function ArticleCardMobile({ article }: { article: ArticleRow }) {
  return (
    <Card size="sm">
      <CardContent className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <PriorityBadge score={article.score} />
          <span className="text-muted-foreground">{TIER_LABELS[article.tier]}</span>
          <span className="text-muted-foreground ml-auto whitespace-nowrap">
            {article.publishedAt
              ? article.publishedAt.toLocaleString('ko-KR', {
                  timeZone: 'Asia/Seoul',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '날짜 미상'}
          </span>
        </div>
        <Link href={`/article/${article.id}`} className="block text-sm font-medium hover:underline">
          {article.title}
        </Link>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground truncate text-xs">{sourceDisplayName(article.sourceId)}</span>
          <div className="flex flex-wrap justify-end gap-1">
            {article.tags.length > 0 ? (
              article.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground text-xs">태그 없음</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
