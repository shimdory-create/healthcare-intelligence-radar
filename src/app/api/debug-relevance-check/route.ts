import { NextRequest, NextResponse } from 'next/server';
import { getLatestCollectionDate } from '@/lib/db';
import { getCandidatesForReport } from '@/lib/reportCandidates';
import { reportDateRange } from '@/lib/reportSchedule';
import { analyzeCandidatesDeep } from '@/lib/reportAnalysis';

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const collectedDate = await getLatestCollectionDate();
  if (!collectedDate) return NextResponse.json({ error: 'no collection date' });

  const reportDates = reportDateRange(collectedDate);
  if (!reportDates) return NextResponse.json({ collectedDate, error: 'no report today (non-business day)' });

  const candidates = await getCandidatesForReport(reportDates);
  const { results, skipped } = await analyzeCandidatesDeep(candidates);

  const rows = candidates.map((c) => {
    const deep = results.get(c.id);
    return {
      id: c.id,
      title: c.title,
      priority: c.priority,
      outletCount: c.outletCount,
      isRelevant: deep ? deep.isRelevant : null,
      isReference: deep ? deep.isReference : null,
      headline: deep?.headline ?? null,
      skipReason: skipped.find((s) => s.articleId === c.id)?.reason ?? null,
    };
  });

  return NextResponse.json({ collectedDate, reportDates, candidateCount: candidates.length, rows });
}
