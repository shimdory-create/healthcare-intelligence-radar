import Link from 'next/link';
import { PriorityBadge } from './PriorityBadge';
import { Badge } from '@/components/ui/badge';
import { TableCell, TableRow } from '@/components/ui/table';
import type { ArticleRow } from '@/lib/db';

export function ArticleCard({ article }: { article: ArticleRow }) {
  return (
    <TableRow>
      <TableCell>
        <PriorityBadge score={article.score} />
      </TableCell>
      <TableCell className="max-w-[420px] whitespace-normal">
        <Link href={`/article/${article.id}`} className="font-medium hover:underline">
          {article.title}
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">{article.sourceId}</TableCell>
      <TableCell className="whitespace-normal">
        <div className="flex flex-wrap gap-1">
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
      </TableCell>
      <TableCell className="text-muted-foreground text-right text-sm">
        {article.publishedAt
          ? article.publishedAt.toLocaleDateString('ko-KR', {
              timeZone: 'Asia/Seoul',
              month: 'short',
              day: 'numeric',
            })
          : '날짜 미상'}
      </TableCell>
    </TableRow>
  );
}
