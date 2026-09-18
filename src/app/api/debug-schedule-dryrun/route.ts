import { NextRequest, NextResponse } from 'next/server';
import { getAppSetting, getPriorityCounts, getRecentArticles } from '@/lib/db';
import { datesSince, previousKstDate } from '@/lib/reportSchedule';
import { isNonBusinessDay } from '@/lib/holidays';
import { todayKstDate } from '@/lib/dateFormat';
import { getCandidatesForReport } from '@/lib/reportCandidates';

// Dry run only -- mirrors /api/cron/collect's watermark/date-range/candidate-selection logic
// with NO send (no email, no kakao, no watermark write), to verify the new schedule's logic
// end-to-end without risking a duplicate or premature real send.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const today = todayKstDate();
  const isNonBusiness = isNonBusinessDay(today);
  const lastReportDate = (await getAppSetting('last_report_date')) ?? previousKstDate(today);
  const reportDates = datesSince(lastReportDate, today);

  const counts = reportDates.length > 0 ? await getPriorityCounts(reportDates) : null;
  const { articles } = reportDates.length > 0 ? await getRecentArticles({ collectedDate: reportDates, limit: 500 }) : { articles: [] };
  const candidates = reportDates.length > 0 ? await getCandidatesForReport(reportDates) : [];

  return NextResponse.json({
    today,
    isNonBusiness,
    lastReportDateWatermark: lastReportDate,
    watermarkWasSet: (await getAppSetting('last_report_date')) !== null,
    reportDates,
    wouldSendEmail: !isNonBusiness && reportDates.length > 0 && articles.length > 0,
    articleCount: articles.length,
    counts,
    reportCandidateCount: candidates.length,
  });
}
