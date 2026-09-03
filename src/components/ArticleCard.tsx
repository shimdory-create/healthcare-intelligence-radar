import Link from 'next/link';
import { PriorityBadge } from './PriorityBadge';
import { Badge } from '@/components/ui/badge';
import { TableCell, TableRow } from '@/components/ui/table';
import { sourceDisplayName } from '@/lib/sourceLookup';
import type { ArticleRow } from '@/lib/db';

export function ArticleCard({ article }: { article: ArticleRow }) {
  return (
    <TableRow>
      <TableCell className="text-center">
        <Badge variant="outline">T{article.tier}</Badge>
      </TableCell>
      <TableCell className="text-center">
        <PriorityBadge score={article.score} />
      </TableCell>
      <TableCell className="max-w-[420px] whitespace-normal">
        <Link href={`/article/${article.id}`} className="font-medium hover:underline">
          {article.title}
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground text-center text-sm whitespace-nowrap">
        {sourceDisplayName(article.sourceId)}
      </TableCell>
      <TableCell className="whitespace-normal">
        <div className="flex flex-wrap justify-center gap-1">
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
      <TableCell className="text-muted-foreground text-center text-sm whitespace-nowrap">
        {article.publishedAt
          ? article.publishedAt.toLocaleString('ko-KR', {
              timeZone: 'Asia/Seoul',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '날짜 미상'}
      </TableCell>
    </TableRow>
  );
}
