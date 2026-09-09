import { NextRequest, NextResponse } from 'next/server';
import { getRecentArticles, getPriorityCounts, getLatestCollectionDate, getAiAnalysesForArticles, getDuplicatesOf } from '@/lib/db';
import { formatKstDate } from '@/lib/dateFormat';
import { sendDigestEmail } from '@/lib/email';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const env = {
    hasResendKey: !!process.env.RESEND_API_KEY,
    hasEmailTo: !!process.env.EMAIL_TO,
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    freeOnly: process.env.FREE_ONLY ?? null,
    hasCronSecret: !!process.env.CRON_SECRET,
    hasKakaoConfig: !!process.env.KAKAO_ACCESS_TOKEN,
  };

  const collectedDate = await getLatestCollectionDate();
  if (!collectedDate) return NextResponse.json({ error: 'no data', env }, { status: 404 });

  const [{ articles }, counts] = await Promise.all([
    getRecentArticles({ collectedDate, limit: 500 }),
    getPriorityCounts(collectedDate),
  ]);

  const analyses = await getAiAnalysesForArticles(articles.map((a) => a.id));
  const analysesById = new Map(analyses.map((a) => [a.articleId, a]));
  const duplicatesById = await getDuplicatesOf(articles.map((a) => a.id));

  let emailResult: string;
  try {
    await sendDigestEmail(articles, counts, formatKstDate(collectedDate), analysesById, duplicatesById);
    emailResult = 'sent';
  } catch (err) {
    emailResult = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  return NextResponse.json({ env, collectedDate, total: counts.total, emailResult });
}
