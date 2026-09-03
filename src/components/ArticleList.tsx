import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArticleCard } from './ArticleCard';
import type { ArticleRow } from '@/lib/db';

export function ArticleList({ articles }: { articles: ArticleRow[] }) {
  if (articles.length === 0) {
    return <p className="text-muted-foreground py-16 text-center text-sm">조건에 맞는 기사가 없습니다.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[92px]">우선순위</TableHead>
          <TableHead>제목</TableHead>
          <TableHead>출처</TableHead>
          <TableHead>태그</TableHead>
          <TableHead className="text-right">날짜</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {articles.map((a) => (
          <ArticleCard key={a.id} article={a} />
        ))}
      </TableBody>
    </Table>
  );
}
