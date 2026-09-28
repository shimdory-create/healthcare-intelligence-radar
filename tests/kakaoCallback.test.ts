import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const ORIGINAL_ENV = { ...process.env };

const exchangeCodeForTokens = vi.fn();
vi.mock('@/lib/kakao', () => ({ exchangeCodeForTokens }));

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  exchangeCodeForTokens.mockReset();
});

describe('GET /api/kakao/callback', () => {
  it('returns 400 when Kakao reports an error, before any state check', async () => {
    const { GET } = await import('@/app/api/kakao/callback/route');
    const req = new NextRequest('http://localhost/api/kakao/callback?error=access_denied');

    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(exchangeCodeForTokens).not.toHaveBeenCalled();
  });

  it('returns 401 when state is missing (CSRF guard, 2026-09-23)', async () => {
    process.env.KAKAO_STATE_SECRET = 'the-secret';
    const { GET } = await import('@/app/api/kakao/callback/route');
    const req = new NextRequest('http://localhost/api/kakao/callback?code=abc');

    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(exchangeCodeForTokens).not.toHaveBeenCalled();
  });

  it('returns 401 when state does not match KAKAO_STATE_SECRET', async () => {
    process.env.KAKAO_STATE_SECRET = 'the-secret';
    const { GET } = await import('@/app/api/kakao/callback/route');
    const req = new NextRequest('http://localhost/api/kakao/callback?code=abc&state=wrong');

    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(exchangeCodeForTokens).not.toHaveBeenCalled();
  });

  it('returns 401 when KAKAO_STATE_SECRET is not configured at all, even with a state param present', async () => {
    delete process.env.KAKAO_STATE_SECRET;
    const { GET } = await import('@/app/api/kakao/callback/route');
    const req = new NextRequest('http://localhost/api/kakao/callback?code=abc&state=anything');

    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(exchangeCodeForTokens).not.toHaveBeenCalled();
  });

  it('returns 400 when state matches but code is missing', async () => {
    process.env.KAKAO_STATE_SECRET = 'the-secret';
    const { GET } = await import('@/app/api/kakao/callback/route');
    const req = new NextRequest('http://localhost/api/kakao/callback?state=the-secret');

    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(exchangeCodeForTokens).not.toHaveBeenCalled();
  });

  it('exchanges the code and returns 200 when state matches and code is present', async () => {
    process.env.KAKAO_STATE_SECRET = 'the-secret';
    exchangeCodeForTokens.mockResolvedValue(undefined);
    const { GET } = await import('@/app/api/kakao/callback/route');
    const req = new NextRequest('http://localhost/api/kakao/callback?code=abc&state=the-secret');

    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(exchangeCodeForTokens).toHaveBeenCalledWith('abc', 'http://localhost/api/kakao/callback');
  });
});
