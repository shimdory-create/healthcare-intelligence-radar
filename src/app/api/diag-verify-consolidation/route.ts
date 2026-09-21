import { NextRequest, NextResponse } from 'next/server';
import { getCandidatesForReport } from '@/lib/reportCandidates';
import { analyzeCandidatesDeep } from '@/lib/reportAnalysis';

// TEMPORARY diagnostic route -- re-runs deep analysis + the new consolidation pass against the
// EXACT same date range as this morning's already-sent report (09-18 through 09-21, hardcoded
// since the watermark already advanced past it), to confirm the GLP-1/삼성생명 duplicate items
// the user flagged actually get merged now. Delete after confirming.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const reportDates = ['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21'];
  const deadline = Date.now() + 250_000;

  try {
    const candidates = await getCandidatesForReport(reportDates);
    const { results, skipped } = await analyzeCandidatesDeep(candidates, deadline);

    const consolidatedAway = skipped.filter((s) => s.reason === 'consolidated-duplicate');
    const byId = new Map(candidates.map((c) => [c.id, c]));

    return NextResponse.json({
      candidateCount: candidates.length,
      finalItemCount: results.size,
      consolidatedAwayCount: consolidatedAway.length,
      consolidatedAway: consolidatedAway.map((s) => ({
        id: s.articleId,
        title: byId.get(s.articleId)?.title,
      })),
      skipCounts: skipped.reduce<Record<string, number>>((acc, s) => {
        acc[s.reason] = (acc[s.reason] ?? 0) + 1;
        return acc;
      }, {}),
      finalHeadlines: [...results.values()].map((r) => ({ id: r.articleId, category: r.category, headline: r.headline, bulletCount: r.bullets.length })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) },
      { status: 500 },
    );
  }
}
