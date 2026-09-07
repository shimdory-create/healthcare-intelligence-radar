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
import { enrichArticles } from '@/lib/aiEnrichment';

export const maxDuration = 300;

interface LatestBatch {
  collectedDate: string;
  articles: ArticleRow[];
  counts: PriorityCounts;
}

async function loadBatch(collectedDate: string): Promise<LatestBatch> {
  const [{ articles }, counts] = await Promise.all([
    getRecentArticles({ collectedDate, limit: 500 }),
    getPriorityCounts(collectedDate),
  ]);
  return { collectedDate, articles, counts };
}

/** email digests are meant to be a quick read -- cap highlights even on a day where most of
 *  the analyzed articles turn out high-priority. The dashboard (and each article's own page)
 *  still shows AI summaries for every analyzed article regardless of this cap. */
const MAX_EMAIL_HIGHLIGHTS = 5;

/** AI-high-priority highlights for the day's batch, resolved from whatever enrichArticles
 *  already analyzed and cached -- empty if AI enrichment was skipped or found nothing high
 *  priority. Sorted by the article's own rule-based score so the cap keeps the strongest ones. */
async function loadHighlights(batch: LatestBatch): Promise<DigestHighlight[]> {
  const analyses = await getAiAnalysesForArticles(batch.articles.map((a) => a.id));
  const articleById = new Map(batch.articles.map((a) => [a.id, a]));
  return analyses
    .filter((a) => a.priority === 'high')
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

  const collectedDate = await getLatestCollectionDate();

  let email = 'no-collection-date';
  let kakao = 'no-collection-date';
  let ai = 'no-collection-date';
  if (collectedDate) {
    // AI runs first (and is fully isolated by its own catch) so its priority updates, if any,
    // are ready in time for today's email/kakao -- a failure here must never block delivery.
    const preAiArticles = await getRecentArticles({ collectedDate, limit: 500 }).then((p) => p.articles);
    ai = await enrichArticles(preAiArticles)
      .then((r) => r.skipped ?? `analyzed ${r.analyzed}, cached ${r.cached}`)
      .catch((err) => `error: ${err instanceof Error ? err.message : String(err)}`);

    // re-fetched after enrichment so the batch reflects AI-updated priorities rather than
    // the pre-AI snapshot enrichArticles was given
    const batch = await loadBatch(collectedDate);

    const highlights = await loadHighlights(batch).catch(() => []);

    email = await sendEmailDigest(batch, highlights).catch((err) => `error: ${err instanceof Error ? err.message : String(err)}`);
    kakao = await sendKakaoDigest(batch).catch((err) => `error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return NextResponse.json({ summary, email, kakao, ai });
}
