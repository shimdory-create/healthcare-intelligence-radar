import { NextRequest, NextResponse } from 'next/server';
import { collectAll } from '@/lib/collect';
import {
  getRecentArticles,
  getPriorityCounts,
  getLatestCollectionDate,
  getAiAnalysesForArticles,
  type ArticleRow,
  type PriorityCounts,
} from '@/lib/db';
import { formatKstDate } from '@/lib/dateFormat';
import { sendDigestEmail, resolveDashboardUrl, type DigestHighlight } from '@/lib/email';
import { sendKakaoMemo } from '@/lib/kakao';
import { enrichTopArticles } from '@/lib/aiEnrichment';

export const maxDuration = 300;

interface LatestBatch {
  collectedDate: string;
  articles: ArticleRow[];
  counts: PriorityCounts;
}

async function loadLatestBatch(): Promise<LatestBatch | null> {
  const collectedDate = await getLatestCollectionDate();
  if (!collectedDate) return null;

  const [{ articles }, counts] = await Promise.all([
    getRecentArticles({ collectedDate, limit: 500 }),
    getPriorityCounts(collectedDate),
  ]);

  return { collectedDate, articles, counts };
}

/** email digests are meant to be a quick read -- cap highlights even on a day where most of
 *  the analyzed top articles turn out relevant. The dashboard (and each article's own page)
 *  still shows AI summaries for every analyzed article regardless of this cap. */
const MAX_EMAIL_HIGHLIGHTS = 5;

/** relevant-only AI highlights for the day's batch, resolved from whatever enrichTopArticles
 *  already analyzed and cached -- empty if AI enrichment was skipped or found nothing relevant.
 *  Sorted by the article's own rule-based score so the cap keeps the strongest ones. */
async function loadHighlights(batch: LatestBatch): Promise<DigestHighlight[]> {
  const analyses = await getAiAnalysesForArticles(batch.articles.map((a) => a.id));
  const articleById = new Map(batch.articles.map((a) => [a.id, a]));
  return analyses
    .filter((a) => a.relevant)
    .map((a) => {
      const article = articleById.get(a.articleId);
      if (!article) return null;
      return { article, highlight: { title: article.title, url: article.url, summary: a.summary, watchPoint: a.watchPoint } };
    })
    .filter((x): x is { article: ArticleRow; highlight: DigestHighlight } => x !== null)
    .sort((a, b) => b.article.score - a.article.score)
    .slice(0, MAX_EMAIL_HIGHLIGHTS)
    .map((x) => x.highlight);
}

async function sendEmailDigest(batch: LatestBatch, highlights: DigestHighlight[]): Promise<string> {
  if (batch.articles.length === 0) return 'no-articles';
  await sendDigestEmail(batch.articles, batch.counts, formatKstDate(batch.collectedDate), highlights);
  return 'sent';
}

async function sendKakaoDigest(batch: LatestBatch): Promise<string> {
  if (batch.articles.length === 0) return 'no-articles';
  const { counts } = batch;
  const text = `🩺 헬스케어 레이더\n${formatKstDate(batch.collectedDate)} 수집 · 총 ${counts.total}건\n🔴 높음 ${counts.high} · 🟡 보통 ${counts.medium} · ⚪ 참고 ${counts.low}`;
  await sendKakaoMemo(text, resolveDashboardUrl());
  return 'sent';
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const summary = await collectAll();

  const batch = await loadLatestBatch();

  let email = 'no-collection-date';
  let kakao = 'no-collection-date';
  let ai = 'no-collection-date';
  if (batch) {
    // AI runs first (and is fully isolated by its own catch) so its results, if any, are
    // ready in time to appear in today's email -- a failure here must never block delivery.
    ai = await enrichTopArticles(batch.articles)
      .then((r) => r.skipped ?? `analyzed ${r.analyzed}, cached ${r.cached}`)
      .catch((err) => `error: ${err instanceof Error ? err.message : String(err)}`);

    const highlights = await loadHighlights(batch).catch(() => []);

    email = await sendEmailDigest(batch, highlights).catch((err) => `error: ${err instanceof Error ? err.message : String(err)}`);
    kakao = await sendKakaoDigest(batch).catch((err) => `error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return NextResponse.json({ summary, email, kakao, ai });
}
