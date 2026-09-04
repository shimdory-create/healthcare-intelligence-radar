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
  const articleById = new Map(articles.map((a) => [a.id, a]));
  const highlights: DigestHighlight[] = analyses
    .filter((a) => a.relevant)
    .map((a) => {
      const article = articleById.get(a.articleId);
      if (!article) return null;
      return { title: article.title, url: article.url, summary: a.summary, watchPoint: a.watchPoint };
    })
    .filter((h): h is DigestHighlight => h !== null);

  await sendDigestEmail(articles, counts, formatKstDate(collectedDate), highlights);
  return NextResponse.json({ sent: true, collectedDate, total: counts.total, highlights: highlights.length });
}
