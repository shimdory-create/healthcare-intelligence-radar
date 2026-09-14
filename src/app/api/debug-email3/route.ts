import { NextRequest, NextResponse } from 'next/server';
import { getLatestCollectionDate, getAiAnalysesForArticles } from '@/lib/db';
import { getCandidatesForReport } from '@/lib/reportCandidates';
import { analyzeCandidatesDeep } from '@/lib/reportAnalysis';
import { buildReportSections, buildReportDocx } from '@/lib/report';
import { buildReportImage } from '@/lib/reportImage';
import { reportDateRange } from '@/lib/reportSchedule';
import { formatKstDate } from '@/lib/dateFormat';

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const collectedDate = await getLatestCollectionDate();
  if (!collectedDate) return NextResponse.json({ error: 'no collection date' });

  const reportDates = reportDateRange(collectedDate);
  if (!reportDates) return NextResponse.json({ error: 'no report today (weekend)' });

  const candidates = await getCandidatesForReport(reportDates);
  const deadline = Date.now() + 200_000;
  const deepResults = await analyzeCandidatesDeep(candidates, deadline);
  const missingIds = candidates.filter((c) => !deepResults.has(c.id)).map((c) => c.id);
  const fallbackAnalyses = await getAiAnalysesForArticles(missingIds);
  const fallbackSummaries = new Map(fallbackAnalyses.map((a) => [a.articleId, a.summary]));
  const sections = buildReportSections(candidates, deepResults, fallbackSummaries);

  const docxBuffer = await buildReportDocx(sections, formatKstDate(collectedDate), '헬스케어사업팀');
  const imageBuffer = await buildReportImage(sections);

  const docxBase64Len = docxBuffer.toString('base64').length;
  const imageBase64Len = imageBuffer.toString('base64').length;
  const totalBase64Bytes = docxBase64Len + imageBase64Len;

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? 'Healthcare Radar <onboarding@resend.dev>';
  const to = process.env.EMAIL_TO?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];

  let sendResult: unknown = null;
  if (apiKey && to.length > 0) {
    const html = `<div><p>실제 리포트 크기 테스트</p><img src="cid:report-preview" /></div>`;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        subject: '[헬스케어 레이더] 실제 리포트 크기 진단',
        html,
        attachments: [
          { filename: 'report-preview.png', content: imageBuffer.toString('base64'), content_id: 'report-preview' },
          { filename: 'report-test.docx', content: docxBuffer.toString('base64') },
        ],
      }),
    });
    const body = await res.json().catch(() => null);
    sendResult = { httpStatus: res.status, body };
  }

  return NextResponse.json({
    candidateCount: candidates.length,
    deepAnalyzed: deepResults.size,
    sectionCount: sections.length,
    docxBufferBytes: docxBuffer.length,
    imageBufferBytes: imageBuffer.length,
    docxBase64Bytes: docxBase64Len,
    imageBase64Bytes: imageBase64Len,
    totalBase64Bytes,
    sendResult,
  });
}
