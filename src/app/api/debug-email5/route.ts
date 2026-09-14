import { NextRequest, NextResponse } from 'next/server';
import { Document, Packer, Paragraph } from 'docx';
import { getRecentArticles, getPriorityCounts, getLatestCollectionDate, getAiAnalysesForArticles, getDuplicatesOf } from '@/lib/db';
import { formatKstDate } from '@/lib/dateFormat';
import { buildDigestHtml, resolveDashboardUrl } from '@/lib/email';

// 1x1 transparent PNG
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const collectedDate = await getLatestCollectionDate();
  if (!collectedDate) return NextResponse.json({ error: 'no collection date' });

  const [{ articles }, counts] = await Promise.all([
    getRecentArticles({ collectedDate, limit: 500 }),
    getPriorityCounts(collectedDate),
  ]);
  const analyses = await getAiAnalysesForArticles(articles.map((a) => a.id));
  const analysesById = new Map(analyses.map((a) => [a.articleId, a]));
  const duplicatesById = await getDuplicatesOf(articles.map((a) => a.id));

  const html = buildDigestHtml(
    articles,
    counts,
    formatKstDate(collectedDate),
    resolveDashboardUrl(),
    analysesById,
    duplicatesById,
    Buffer.from(TINY_PNG_BASE64, 'base64'),
  );

  const doc = new Document({ sections: [{ children: [new Paragraph('진단용 테스트 문서입니다.')] }] });
  const docxBuffer = await Packer.toBuffer(doc);

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
        subject: '[헬스케어 레이더] 링크+더미첨부 조합 진단',
        html,
        attachments: [
          { filename: 'report-preview.png', content: TINY_PNG_BASE64, content_id: 'report-preview' },
          { filename: 'report-test.docx', content: docxBuffer.toString('base64') },
        ],
      }),
    });
    const body = await res.json().catch(() => null);
    sendResult = { httpStatus: res.status, body };
  }

  return NextResponse.json({
    articleCount: articles.length,
    htmlBytes: Buffer.byteLength(html, 'utf8'),
    sendResult,
  });
}
