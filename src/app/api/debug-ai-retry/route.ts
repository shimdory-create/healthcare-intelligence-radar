import { NextRequest, NextResponse } from 'next/server';
import { getRecentArticles, getLatestCollectionDate } from '@/lib/db';
import { enrichArticles } from '@/lib/aiEnrichment';
import { analyzeArticles } from '@/lib/gemini';

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const collectedDate = await getLatestCollectionDate();
  if (!collectedDate) return NextResponse.json({ error: 'no collection date' });

  const { articles } = await getRecentArticles({ collectedDate, limit: 500 });

  // reproduce one raw Gemini call directly (bypassing enrichArticles' try/catch) on a small
  // batch of still-unanalyzed medium articles, to capture the exact error if one occurs
  const candidates = articles.filter((a) => a.priority !== 'low').slice(20, 30);
  let rawError: string | null = null;
  let rawResult: unknown = null;
  try {
    rawResult = await analyzeArticles(candidates.map((a) => ({ id: a.id, title: a.title, snippet: a.snippet ?? '' })));
  } catch (err) {
    rawError = err instanceof Error ? err.message : String(err);
  }

  // also run the real enrichArticles path (with the new per-batch isolation) on everything
  // still unanalyzed, no deadline, to see the full failedBatches/analyzed breakdown
  const result = await enrichArticles(articles);

  return NextResponse.json({ collectedDate, totalCandidates: candidates.length, rawError, rawResultLength: Array.isArray(rawResult) ? rawResult.length : null, enrichResult: result });
}
