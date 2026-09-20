import { NextRequest, NextResponse } from 'next/server';
import { getAppSetting } from '@/lib/db';
import { formatReportDate, todayKstDate } from '@/lib/dateFormat';
import { datesSince, previousKstDate } from '@/lib/reportSchedule';
import { getCandidatesForReport } from '@/lib/reportCandidates';
import { analyzeCandidatesDeep } from '@/lib/reportAnalysis';
import { buildReportSections, buildReportDocx } from '@/lib/report';

// TEMPORARY diagnostic route -- dry-runs the exact report-generation logic the real 08:00 KST
// collect route will use this morning (same watermark, same date range, same deep-analysis
// pipeline), WITHOUT sending email/kakao and WITHOUT advancing the watermark. Purpose: catch
// a bug in the multi-day rollup (first real one since the schedule redesign) hours before the
// real send, while there's still time to fix it. Delete after confirming. Same pattern as the
// 2026-09-18 dry-run diagnostic documented in project memory.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const today = todayKstDate();
  const lastReportDate = (await getAppSetting('last_report_date')) ?? previousKstDate(today);
  const reportDates = datesSince(lastReportDate, today);

  if (reportDates.length === 0) {
    return NextResponse.json({ lastReportDate, today, reportDates, summary: 'no-new-dates' });
  }

  const deadline = Date.now() + 200_000; // generous dry-run budget, not the real route's deadline math
  try {
    const candidates = await getCandidatesForReport(reportDates);
    const { results: deepResults, skipped } = await analyzeCandidatesDeep(candidates, deadline);
    const sections = buildReportSections(candidates, deepResults);
    const docxBuffer = await buildReportDocx(sections, formatReportDate(today), '헬스케어사업팀');

    const excludedIrrelevant = candidates.filter(
      (c) => deepResults.has(c.id) && !deepResults.get(c.id)!.isRelevant,
    ).length;
    const skipCounts = skipped.reduce<Record<string, number>>((acc, s) => {
      acc[s.reason] = (acc[s.reason] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      lastReportDate,
      today,
      reportDates,
      candidateCount: candidates.length,
      deepAnalyzed: deepResults.size,
      excludedIrrelevant,
      skipCounts,
      sections: sections.map((s) => ({ title: s.title, itemCount: s.items.length })),
      docxSizeBytes: docxBuffer.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : String(err), reportDates },
      { status: 500 },
    );
  }
}
