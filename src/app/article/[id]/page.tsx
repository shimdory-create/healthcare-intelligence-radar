import { notFound } from 'next/navigation';
import { getArticleById } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    notFound();
  }
  const article = await getArticleById(numericId);
  if (!article) notFound();

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl leading-snug font-semibold">{article.title}</CardTitle>
          <p className="text-muted-foreground text-sm">
            {article.sourceId} ·{' '}
            {article.publishedAt
              ? article.publishedAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
              : '날짜 미상'}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1">
            {article.tags.length > 0 ? (
              article.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground text-sm">태그 없음</span>
            )}
          </div>
          {article.snippet && <p className="text-sm leading-relaxed">{article.snippet}</p>}
          <Separator />
          <a
            href={article.url}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: 'default' }))}
          >
            원문 보기
          </a>
        </CardContent>
      </Card>
    </main>
  );
}
