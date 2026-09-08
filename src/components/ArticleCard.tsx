import Link from 'next/link';
import { PriorityBadge } from './PriorityBadge';
import { Badge } from '@/components/ui/badge';
import { TableCell, TableRow } from '@/components/ui/table';
import { sourceDisplayName, TIER_LABELS } from '@/lib/sourceLookup';
import type { ArticleRow, AiAnalysis } from '@/lib/db';

export function ArticleCard({ article, analysis }: { article: ArticleRow; analysis?: AiAnalysis }) {
  return (
    <TableRow>
      <TableCell className="text-center">
        <PriorityBadge priority={article.priority} aiJudged={analysis !== undefined} />
      </TableCell>
      <TableCell className="text-center">
        <Badge variant="outline">{TIER_LABELS[article.tier]}</Badge>
      </TableCell>
      <TableCell className="text-muted-foreground text-center text-sm whitespace-normal">
        {sourceDisplayName(article.sourceId)}
      </TableCell>
      <TableCell className="whitespace-normal">
        <a href={article.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
          {article.title}
        </a>
        {analysis && (
          <>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{analysis.summary}</p>
            {analysis.watchPoint && (
              <p className="text-muted-foreground mt-1 text-xs">Watch: {analysis.watchPoint}</p>
            )}
            <Link href={`/article/${article.id}`} className="text-muted-foreground mt-1 inline-block text-xs hover:underline">
              AI 분석 →
            </Link>
          </>
        )}
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
