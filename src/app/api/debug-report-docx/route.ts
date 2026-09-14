import { NextRequest, NextResponse } from 'next/server';
import { getLatestCollectionDate } from '@/lib/db';
import { formatKstDate } from '@/lib/dateFormat';
import { getCandidatesForReport } from '@/lib/reportCandidates';
import { analyzeCandidatesDeep } from '@/lib/reportAnalysis';
import { buildReportSections, buildReportDocx } from '@/lib/report';
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
  const sections = buildReportSections(candidates, deepResults);

  const docxBuffer = await buildReportDocx(sections, formatKstDate(collectedDate), '헬스케어사업팀');

  return new NextResponse(new Uint8Array(docxBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="healthcare-market-intelligence-preview.docx"`,
    },
  });
}
