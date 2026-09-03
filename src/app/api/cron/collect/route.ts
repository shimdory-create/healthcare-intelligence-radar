import { NextRequest, NextResponse } from 'next/server';
import { collectAll } from '@/lib/collect';
import { getRecentArticles, getPriorityCounts, getLatestCollectionDate, type ArticleRow, type PriorityCounts } from '@/lib/db';
import { formatKstDate } from '@/lib/dateFormat';
import { sendDigestEmail, resolveDashboardUrl } from '@/lib/email';
import { sendKakaoMemo } from '@/lib/kakao';

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

async function sendEmailDigest(batch: LatestBatch): Promise<string> {
  if (batch.articles.length === 0) return 'no-articles';
  await sendDigestEmail(batch.articles, batch.counts, formatKstDate(batch.collectedDate));
  return 'sent';
}

async function sendKakaoDigest(batch: LatestBatch): Promise<string> {
  if (batch.articles.length === 0) return 'no-articles';
  const { counts } = batch;
  const text = `🩺 헬스케어 심텔리전스 레이더\n${formatKstDate(batch.collectedDate)} 수집 · 총 ${counts.total}건\n🔴 높음 ${counts.high} · 🟡 보통 ${counts.medium} · ⚪ 참고 ${counts.low}`;
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
  if (batch) {
    email = await sendEmailDigest(batch).catch((err) => `error: ${err instanceof Error ? err.message : String(err)}`);
    kakao = await sendKakaoDigest(batch).catch((err) => `error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return NextResponse.json({ summary, email, kakao });
}
