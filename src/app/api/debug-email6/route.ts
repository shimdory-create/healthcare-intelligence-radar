import { NextRequest, NextResponse } from 'next/server';
import { getRecentArticles, getPriorityCounts, getLatestCollectionDate, getAiAnalysesForArticles, getDuplicatesOf } from '@/lib/db';
import { formatKstDate } from '@/lib/dateFormat';
import { buildDigestHtml, resolveDashboardUrl } from '@/lib/email';
import { getCandidatesForReport } from '@/lib/reportCandidates';
import { analyzeCandidatesDeep } from '@/lib/reportAnalysis';
import { buildReportSections, buildReportDocx, type ReportSection } from '@/lib/report';
import { reportDateRange } from '@/lib/reportSchedule';

export const maxDuration = 300;

function escapeHtml(text: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return text.replace(/[&<>"']/g, (c) => map[c]);
}

// Renders the report as plain HTML text (no screenshot image) so it can be tested as an
// alternative to the rendered PNG preview -- mirrors report.ts's docx structure (title,
// numbered sections, □ headlines, * notes, - bullets, · sub-bullets).
function buildReportTextHtml(sections: ReportSection[], dateLabel: string): string {
  const sectionsHtml = sections
    .map((section, i) => {
      const itemsHtml = section.items
        .map((item) => {
          const noteHtml = item.note
            ? `<p style="margin:2px 0 0 24px;font-size:11px;color:#777;">* ${escapeHtml(item.note)}</p>`
            : '';
          const bulletsHtml = item.bullets
            .map((b) => {
              const subHtml = b.subBullets
                .map((s) => `<p style="margin:2px 0 0 40px;font-size:12px;">· ${escapeHtml(s)}</p>`)
                .join('');
              return `<p style="margin:2px 0 0 28px;font-size:12px;">- ${escapeHtml(b.text)}</p>${subHtml}`;
            })
            .join('');
          return `<p style="margin:10px 0 2px;font-size:13px;font-weight:600;">□ ${escapeHtml(item.headline)}</p>${noteHtml}${bulletsHtml}`;
        })
        .join('');
      return `<h3 style="margin:16px 0 4px;font-size:14px;">${i + 1}. ${escapeHtml(section.title)}</h3>${itemsHtml}`;
    })
    .join('');

  return `
    <div style="border:1px solid #e5e5e5;border-radius:8px;padding:16px;margin:0 0 16px;">
      <h2 style="text-align:center;margin:0 0 4px;font-size:16px;">Healthcare Market Intelligence</h2>
      <p style="text-align:right;margin:0 0 8px;font-size:11px;color:#666;">${escapeHtml(dateLabel)}</p>
      ${sectionsHtml}
    </div>`;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const collectedDate = await getLatestCollectionDate();
  if (!collectedDate) return NextResponse.json({ error: 'no collection date' });

  const reportDates = reportDateRange(collectedDate);
  let reportSections: ReportSection[] = [];
  let docxBuffer: Buffer | undefined;
  if (reportDates) {
    const candidates = await getCandidatesForReport(reportDates);
    const deadline = Date.now() + 200_000;
    const deepResults = await analyzeCandidatesDeep(candidates, deadline);
    const missingIds = candidates.filter((c) => !deepResults.has(c.id)).map((c) => c.id);
    const fallbackAnalyses = await getAiAnalysesForArticles(missingIds);
    const fallbackSummaries = new Map(fallbackAnalyses.map((a) => [a.articleId, a.summary]));
    reportSections = buildReportSections(candidates, deepResults, fallbackSummaries);
    docxBuffer = await buildReportDocx(reportSections, formatKstDate(collectedDate), '헬스케어사업팀');
  }

  const [{ articles }, counts] = await Promise.all([
    getRecentArticles({ collectedDate, limit: 500 }),
    getPriorityCounts(collectedDate),
  ]);
  const analyses = await getAiAnalysesForArticles(articles.map((a) => a.id));
  const analysesById = new Map(analyses.map((a) => [a.articleId, a]));
  const duplicatesById = await getDuplicatesOf(articles.map((a) => a.id));

  const digestHtml = buildDigestHtml(
    articles,
    counts,
    formatKstDate(collectedDate),
    resolveDashboardUrl(),
    analysesById,
    duplicatesById,
  );
  const reportTextHtml = reportSections.length > 0 ? buildReportTextHtml(reportSections, formatKstDate(collectedDate)) : '';
  const html = reportTextHtml + digestHtml;

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? 'Healthcare Radar <onboarding@resend.dev>';
  const to = process.env.EMAIL_TO?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];

  let sendResult: unknown = null;
  if (apiKey && to.length > 0) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        subject: '[헬스케어 레이더] 이미지 없이 텍스트 리포트 + docx 첨부 진단',
        html,
        ...(docxBuffer
          ? { attachments: [{ filename: 'healthcare-market-intelligence-test.docx', content: docxBuffer.toString('base64') }] }
          : {}),
      }),
    });
    const body = await res.json().catch(() => null);
    sendResult = { httpStatus: res.status, body };
  }

  return NextResponse.json({
    articleCount: articles.length,
    sectionCount: reportSections.length,
    htmlBytes: Buffer.byteLength(html, 'utf8'),
    docxBufferBytes: docxBuffer?.length ?? 0,
    sendResult,
  });
}
