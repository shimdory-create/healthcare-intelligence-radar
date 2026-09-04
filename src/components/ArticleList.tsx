import Link from 'next/link';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ArticleCard } from './ArticleCard';
import { ArticleCardMobile } from './ArticleCardMobile';
import type { ArticleRow, AiAnalysis } from '@/lib/db';

export function ArticleList({
  articles,
  page,
  totalPages,
  hasNextPage,
  buildPageHref,
  analysesById,
}: {
  articles: ArticleRow[];
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  buildPageHref: (page: number) => string;
  analysesById: Map<number, AiAnalysis>;
}) {
  if (articles.length === 0) {
    return <p className="text-muted-foreground py-16 text-center text-sm">조건에 맞는 기사가 없습니다.</p>;
  }

  return (
    <div>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[72px] text-center">우선순위</TableHead>
              <TableHead className="w-[104px] text-center">티어</TableHead>
              <TableHead className="w-[108px] text-center">출처</TableHead>
              <TableHead className="text-center">제목</TableHead>
              <TableHead className="text-center">태그</TableHead>
              <TableHead className="text-center">날짜</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {articles.map((a) => (
              <ArticleCard key={a.id} article={a} analysis={analysesById.get(a.id)} />
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-2 py-2 md:hidden">
        {articles.map((a) => (
          <ArticleCardMobile key={a.id} article={a} analysis={analysesById.get(a.id)} />
        ))}
      </div>
      <div className="flex items-center justify-center gap-2 border-t py-3">
        {page > 1 ? (
          <Link href={buildPageHref(page - 1)} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            이전
          </Link>
        ) : (
          <span className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'pointer-events-none opacity-40')}>
            이전
          </span>
        )}
        {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map((n) =>
          n === page ? (
            <span key={n} className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'pointer-events-none')}>
              {n}
            </span>
          ) : (
            <Link key={n} href={buildPageHref(n)} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              {n}
            </Link>
          ),
        )}
        {hasNextPage ? (
          <Link href={buildPageHref(page + 1)} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            다음
          </Link>
        ) : (
          <span className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'pointer-events-none opacity-40')}>
            다음
          </span>
        )}
      </div>
    </div>
  );
}
