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
import { sendDigestEmail, resolveDashboardUrl } from '@/lib/email';
import { sendKakaoMemo } from '@/lib/kakao';
import { enrichArticles } from '@/lib/aiEnrichment';
import { demoteDuplicatePriorities } from '@/lib/duplicates';

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

async function sendEmailDigest(batch: LatestBatch): Promise<string> {
  if (batch.articles.length === 0) return 'no-articles';
  const analyses = await getAiAnalysesForArticles(batch.articles.map((a) => a.id));
  const analysesById = new Map(analyses.map((a) => [a.articleId, a]));
  await sendDigestEmail(batch.articles, batch.counts, formatKstDate(batch.collectedDate), analysesById);
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
  let dedupe = 'no-collection-date';
  if (collectedDate) {
    // AI runs first (and is fully isolated by its own catch) so its priority updates, if any,
    // are ready in time for today's email/kakao -- a failure here must never block delivery.
    const preAiArticles = await getRecentArticles({ collectedDate, limit: 500 }).then((p) => p.articles);
    ai = await enrichArticles(preAiArticles)
      .then((r) => r.skipped ?? `analyzed ${r.analyzed}, cached ${r.cached}`)
      .catch((err) => `error: ${err instanceof Error ? err.message : String(err)}`);

    // cross-outlet duplicate coverage of the same story (2+ shared tags, same day) shouldn't
    // each count as their own "high" -- demote all but the strongest one, using whatever
    // priority AI (or the rule-based fallback) just set
    const postAiArticles = await getRecentArticles({ collectedDate, limit: 500 }).then((p) => p.articles);
    dedupe = await demoteDuplicatePriorities(postAiArticles)
      .then((r) => `demoted ${r.demoted} across ${r.groups} groups`)
      .catch((err) => `error: ${err instanceof Error ? err.message : String(err)}`);

    // re-fetched again so the batch reflects both AI-updated and dedupe-demoted priorities
    // rather than an earlier snapshot
    const batch = await loadBatch(collectedDate);

    email = await sendEmailDigest(batch).catch((err) => `error: ${err instanceof Error ? err.message : String(err)}`);
    kakao = await sendKakaoDigest(batch).catch((err) => `error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return NextResponse.json({ summary, email, kakao, ai, dedupe });
}
