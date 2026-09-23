import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/kakao';

/** one-time OAuth bootstrap: visit the Kakao authorize URL (append `&state=<CRON_SECRET>`) and
 *  land here to store the refresh token.
 *
 *  `state` is required and checked against CRON_SECRET as a CSRF guard (security review,
 *  2026-09-23): without it, this endpoint is a classic OAuth "authorization code injection"
 *  target -- an attacker gets their OWN Kakao authorization code (trivial, needs only their own
 *  Kakao account), then tricks the site owner into opening
 *  `/api/kakao/callback?code=<attacker's code>`. Without a state check, the server would happily
 *  exchange the attacker's code and overwrite the stored refresh token with the attacker's own,
 *  silently redirecting the daily digest's KakaoTalk "memo to me" to the attacker's account
 *  instead of the real owner's. Reusing CRON_SECRET (already a securely-held env var) avoids
 *  introducing a second secret to manage for a flow that's only ever run once. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');
  const state = req.nextUrl.searchParams.get('state');

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }
  const secret = process.env.CRON_SECRET;
  if (!secret || state !== secret) {
    return NextResponse.json({ error: 'invalid or missing state' }, { status: 401 });
  }
  if (!code) {
    return NextResponse.json({ error: 'missing code' }, { status: 400 });
  }

  const redirectUri = `${req.nextUrl.origin}/api/kakao/callback`;
  await exchangeCodeForTokens(code, redirectUri);

  return new NextResponse('카카오 연동 완료. 이 탭은 닫으셔도 됩니다.', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
