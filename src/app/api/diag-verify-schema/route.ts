import { NextRequest, NextResponse } from 'next/server';
import { getCandidatesForReport } from '@/lib/reportCandidates';
import { analyzeCandidatesDeep } from '@/lib/reportAnalysis';
import { buildReportSections, buildReportDocx } from '@/lib/report';
import { formatReportDate, todayKstDate } from '@/lib/dateFormat';

// TEMPORARY diagnostic route -- verifies the new headline_source/sub_bullet-note schema
// actually works end to end against the real Gemini API (not just unit-test mocks) and that
// buildReportDocx renders it without error. Delete after confirming.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const reportDates = ['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21'];
  const deadline = Date.now() + 200_000;

  try {
    const candidates = (await getCandidatesForReport(reportDates)).slice(0, 8);
    const { results, skipped } = await analyzeCandidatesDeep(candidates, deadline);
    const sections = buildReportSections(candidates, results);
    const docxBuffer = await buildReportDocx(sections, formatReportDate(todayKstDate()), '헬스케어사업팀');

    const withSubBulletNote = [...results.values()].filter((r) => r.bullets.some((b) => b.subBullets.some((sb) => sb.note)));
    const withHeadlineSource = [...results.values()].filter((r) => r.headlineSource);

    return NextResponse.json({
      candidateCount: candidates.length,
      analyzedCount: results.size,
      skipCounts: skipped.reduce<Record<string, number>>((acc, s) => {
        acc[s.reason] = (acc[s.reason] ?? 0) + 1;
        return acc;
      }, {}),
      docxSizeBytes: docxBuffer.length,
      sampleWithSubBulletNote: withSubBulletNote.map((r) => ({
        id: r.articleId,
        headline: r.headline,
        bullets: r.bullets.map((b) => ({ text: b.text, subBullets: b.subBullets })),
      })),
      sampleWithHeadlineSource: withHeadlineSource.map((r) => ({ id: r.articleId, headline: r.headline, headlineSource: r.headlineSource })),
      allHeadlines: [...results.values()].map((r) => ({
        id: r.articleId,
        headline: r.headline,
        headlineSource: r.headlineSource,
        subBulletNotes: r.bullets.flatMap((b) => b.subBullets.map((sb) => sb.note)).filter(Boolean),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : String(err) },
      { status: 500 },
    );
  }
}
