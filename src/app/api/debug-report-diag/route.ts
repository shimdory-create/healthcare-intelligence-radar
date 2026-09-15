import { NextRequest, NextResponse } from 'next/server';
import { getLatestCollectionDate } from '@/lib/db';
import { getCandidatesForReport } from '@/lib/reportCandidates';
import { reportDateRange } from '@/lib/reportSchedule';
import { extractArticleText } from '@/lib/articleExtract';

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

  const enriched = await Promise.all(
    candidates.map(async (c) => {
      const text = await extractArticleText(c.url);
      return {
        id: c.id,
        title: c.title,
        priority: c.priority,
        outletCount: c.outletCount,
        outletSourceIds: c.outletSourceIds,
        reason: c.priority === 'high' ? 'high' : `multi-outlet(${c.outletCount})`,
        extractOk: !!text,
        extractLen: text?.length ?? 0,
      };
    }),
  );

  return NextResponse.json({
    collectedDate,
    reportDates,
    candidateCount: candidates.length,
    candidates: enriched,
  });
}
