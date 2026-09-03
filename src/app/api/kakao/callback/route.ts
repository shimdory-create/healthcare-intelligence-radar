import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/kakao';

/** one-time OAuth bootstrap: visit the Kakao authorize URL, approve, and land here to store the refresh token */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
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
