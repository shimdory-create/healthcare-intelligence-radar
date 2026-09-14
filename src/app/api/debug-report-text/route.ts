import { NextRequest, NextResponse } from 'next/server';
import { getLatestCollectionDate, getAiAnalysesForArticles } from '@/lib/db';
import { getCandidatesForReport } from '@/lib/reportCandidates';
import { analyzeCandidatesDeep } from '@/lib/reportAnalysis';
import { buildReportSections } from '@/lib/report';
import { reportDateRange } from '@/lib/reportSchedule';

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const collectedDate = await getLatestCollectionDate();
  if (!collectedDate) return NextResponse.json({ error: 'no collection date' });

  const reportDates = reportDateRange(collectedDate);
  if (!reportDates) return NextResponse.json({ error: 'no report today' });

  const candidates = await getCandidatesForReport(reportDates);
  const deadline = Date.now() + 200_000;
  const deepResults = await analyzeCandidatesDeep(candidates, deadline);
  const missingIds = candidates.filter((c) => !deepResults.has(c.id)).map((c) => c.id);
  const fallbackAnalyses = await getAiAnalysesForArticles(missingIds);
  const fallbackSummaries = new Map(fallbackAnalyses.map((a) => [a.articleId, a.summary]));
  const sections = buildReportSections(candidates, deepResults, fallbackSummaries);

  return NextResponse.json({ sections });
}
