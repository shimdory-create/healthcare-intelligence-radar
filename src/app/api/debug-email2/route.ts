import { NextRequest, NextResponse } from 'next/server';
import { Document, Packer, Paragraph } from 'docx';

// 1x1 transparent PNG
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? 'Healthcare Radar <onboarding@resend.dev>';
  const to = process.env.EMAIL_TO?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  if (!apiKey || to.length === 0) {
    return NextResponse.json({ error: 'missing config' });
  }

  const doc = new Document({
    sections: [{ children: [new Paragraph('진단용 테스트 문서입니다.')] }],
  });
  const docxBuffer = await Packer.toBuffer(doc);

  const html = `<div><p>첨부파일 배송 테스트</p><img src="cid:report-preview" alt="test" /></div>`;

  const attachments = [
    { filename: 'report-preview.png', content: TINY_PNG_BASE64, content_id: 'report-preview' },
    { filename: 'healthcare-market-intelligence-test.docx', content: docxBuffer.toString('base64') },
  ];

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to,
      subject: '[헬스케어 레이더] 첨부파일 배송 진단',
      html,
      attachments,
    }),
  });
  const body = await res.json().catch(() => null);

  return NextResponse.json({
    from,
    pngBase64Len: TINY_PNG_BASE64.length,
    docxBufferBytes: docxBuffer.length,
    sendHttpStatus: res.status,
    sendResponse: body,
  });
}
