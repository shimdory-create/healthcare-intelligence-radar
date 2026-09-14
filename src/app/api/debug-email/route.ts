import { NextRequest, NextResponse } from 'next/server';

function mask(addr: string): string {
  const [user, domain] = addr.split('@');
  if (!domain) return '***';
  return `${user.slice(0, 2)}***@${domain}`;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? 'Healthcare Radar <onboarding@resend.dev>';
  const toRaw = process.env.EMAIL_TO?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];

  if (!apiKey || toRaw.length === 0) {
    return NextResponse.json({ error: 'RESEND_API_KEY or EMAIL_TO not set', hasApiKey: !!apiKey, toCount: toRaw.length });
  }

  const sendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: toRaw,
      subject: '[헬스케어 레이더] 배송 진단 테스트',
      html: '<p>이 메일은 배송 진단을 위한 테스트 메일입니다.</p>',
    }),
  });
  const sendBody = await sendRes.json().catch(() => null);

  let statusCheck: unknown = null;
  if (sendRes.ok && sendBody?.id) {
    await new Promise((r) => setTimeout(r, 3000));
    const statusRes = await fetch(`https://api.resend.com/emails/${sendBody.id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    statusCheck = await statusRes.json().catch(() => null);
  }

  return NextResponse.json({
    from,
    to: toRaw.map(mask),
    sendHttpStatus: sendRes.status,
    sendResponse: sendBody,
    statusCheck,
  });
}
