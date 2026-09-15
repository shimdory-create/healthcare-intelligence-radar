import { NextRequest, NextResponse } from 'next/server';
import { formatReportDate } from '@/lib/dateFormat';
import { getCandidatesForReport } from '@/lib/reportCandidates';
import { analyzeCandidatesDeep } from '@/lib/reportAnalysis';
import { buildReportSections, buildReportDocx } from '@/lib/report';

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const date = req.nextUrl.searchParams.get('date');
  if (!date) return NextResponse.json({ error: 'missing ?date=YYYY-MM-DD' });

  const candidates = await getCandidatesForReport([date]);
  const deadline = Date.now() + 200_000;
  const deepResults = await analyzeCandidatesDeep(candidates, deadline);
  const sections = buildReportSections(candidates, deepResults);

  const docxBuffer = await buildReportDocx(sections, formatReportDate(date), '헬스케어사업팀');

  return new NextResponse(new Uint8Array(docxBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="healthcare-market-intelligence-${date}.docx"`,
      'X-Candidate-Count': String(candidates.length),
      'X-Deep-Analyzed-Count': String(deepResults.size),
    },
  });
}
