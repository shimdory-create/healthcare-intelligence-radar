import { NextRequest, NextResponse } from 'next/server';

// TEMPORARY diagnostic route -- delete after use. Deeper look at the 503 "high demand" error:
// 1. captures full response headers (rate-limit/retry-after/x-goog-* info the earlier checks
//    never looked at, only status+body)
// 2. fires 5 back-to-back attempts to see whether it's a hard 100% block or genuine contention
//    (some succeed, some don't) -- a real "spike in demand" should show some variance
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });

  const model = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite';

  async function attempt(n: number) {
    const start = Date.now();
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Say "ok" and nothing else.' }] }] }),
        signal: AbortSignal.timeout(20000),
      });
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k] = v;
      });
      const bodyText = await res.text();
      return { n, status: res.status, ok: res.ok, ms: Date.now() - start, headers, body: bodyText.slice(0, 300) };
    } catch (err) {
      return { n, error: err instanceof Error ? err.message : String(err), ms: Date.now() - start };
    }
  }

  // sequential, not parallel -- want to see if repeated hammering changes anything, and
  // parallel requests to the same endpoint could themselves look like a burst that gets shed
  const results = [];
  for (let i = 1; i <= 5; i++) {
    results.push(await attempt(i));
  }

  return NextResponse.json({
    model,
    successCount: results.filter((r) => 'ok' in r && r.ok).length,
    results,
    checkedAt: new Date().toISOString(),
  });
}
