import { NextRequest, NextResponse } from 'next/server';
import { getRecentArticles, getPriorityCounts, getLatestCollectionDate, getAiAnalysesForArticles } from '@/lib/db';
import { formatKstDate } from '@/lib/dateFormat';
import { sendDigestEmail, type DigestHighlight } from '@/lib/email';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const collectedDate = await getLatestCollectionDate();
  if (!collectedDate) return NextResponse.json({ error: 'no data' }, { status: 404 });

  const [{ articles }, counts] = await Promise.all([
    getRecentArticles({ collectedDate, limit: 500 }),
    getPriorityCounts(collectedDate),
  ]);

  const analyses = await getAiAnalysesForArticles(articles.map((a) => a.id));
  const analysesById = new Map(analyses.map((a) => [a.articleId, a]));
  const articleById = new Map(articles.map((a) => [a.id, a]));
  const highlights: DigestHighlight[] = analyses
    .filter((a) => a.priority === 'high')
    .map((a) => {
      const article = articleById.get(a.articleId);
      if (!article) return null;
      return { title: article.title, url: article.url, summary: a.summary, watchPoint: a.watchPoint };
    })
    .filter((h): h is DigestHighlight => h !== null)
    .slice(0, 5);

  await sendDigestEmail(articles, counts, formatKstDate(collectedDate), highlights, analysesById);
  return NextResponse.json({ sent: true, collectedDate, total: counts.total, highlights: highlights.length, analyzed: analyses.length });
}
