import { NextRequest, NextResponse } from 'next/server';
import { getCandidatesForReport } from '@/lib/reportCandidates';
import { analyzeCandidatesDeep } from '@/lib/reportAnalysis';
import { buildReportSections } from '@/lib/report';

// TEMPORARY diagnostic route -- confirms consolidatedNote actually renders for a real merged
// item against the same 09-18~09-21 data. Delete after confirming.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const reportDates = ['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21'];
  const deadline = Date.now() + 250_000;
  try {
    const candidates = await getCandidatesForReport(reportDates);
    const { results } = await analyzeCandidatesDeep(candidates, deadline);
    const sections = buildReportSections(candidates, results);
    const withTrace = sections.flatMap((s) => s.items.filter((i) => i.consolidatedNote));
    return NextResponse.json({
      totalItems: sections.reduce((n, s) => n + s.items.length, 0),
      withTraceCount: withTrace.length,
      withTrace: withTrace.map((i) => ({ headline: i.headline, consolidatedNote: i.consolidatedNote })),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
