import { notFound } from 'next/navigation';
import { getArticleById, getAiAnalysis } from '@/lib/db';
import { sourceDisplayName } from '@/lib/sourceLookup';
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
  const analysis = await getAiAnalysis(numericId);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl leading-snug font-semibold">{article.title}</CardTitle>
          <p className="text-muted-foreground text-sm">
            {sourceDisplayName(article.sourceId)} ·{' '}
            {article.publishedAt
              ? article.publishedAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
              : '날짜 미상'}
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
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
          {article.snippet && (
            <div className="border-primary/30 bg-muted/40 rounded-md border-l-2 py-3 pr-4 pl-4">
              <p className="text-sm leading-relaxed whitespace-pre-line">{article.snippet}</p>
            </div>
          )}
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
      {analysis && (
        <Card className="mt-4">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium">AI 분석</CardTitle>
              {!analysis.relevant && <Badge variant="outline">관련성 낮음</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm leading-relaxed">{analysis.summary}</p>
            {analysis.implications.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {analysis.implications.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            )}
            {analysis.watchPoint && (
              <p className="text-muted-foreground text-sm">
                <span className="font-medium">Watch:</span> {analysis.watchPoint}
              </p>
            )}
            <p className="text-muted-foreground text-xs">{analysis.model} 분석</p>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
