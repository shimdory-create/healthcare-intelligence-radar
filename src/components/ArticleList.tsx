import Link from 'next/link';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ArticleCard } from './ArticleCard';
import type { ArticleRow } from '@/lib/db';

export function ArticleList({
  articles,
  page,
  hasNextPage,
  buildPageHref,
}: {
  articles: ArticleRow[];
  page: number;
  hasNextPage: boolean;
  buildPageHref: (page: number) => string;
}) {
  if (articles.length === 0) {
    return <p className="text-muted-foreground py-16 text-center text-sm">조건에 맞는 기사가 없습니다.</p>;
  }

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[92px] text-center">우선순위</TableHead>
            <TableHead className="text-center">제목</TableHead>
            <TableHead className="text-center">출처</TableHead>
            <TableHead className="text-center">태그</TableHead>
            <TableHead className="text-center">날짜</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {articles.map((a) => (
            <ArticleCard key={a.id} article={a} />
          ))}
        </TableBody>
      </Table>
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
        <span className="text-muted-foreground px-2 text-sm">{page} 페이지</span>
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
