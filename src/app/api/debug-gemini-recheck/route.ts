import { NextRequest, NextResponse } from 'next/server';

// TEMPORARY diagnostic route -- delete after use. Rigorous re-check of the 2026-09-28 Gemini
// 503 outage: user asked "are you sure the cause isn't something else" after 12+ hours of
// failures, which is fair to double-check rather than just repeat the earlier read. This tests
// THREE things with the same API key to isolate the failure to one specific cause:
// 1. models.list -- confirms the key itself is valid and enumerates what Google currently
//    thinks is available (a revoked/invalid key would fail here with 400/401/403, not 503).
// 2. the primary model (gemini-3.5-flash-lite) -- reproduces the original failure.
// 3. a different model (gemini-2.5-flash) with the SAME key -- if this succeeds while #2
//    fails, it's specific to that one model being overloaded, not an account/key/region issue.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });

  async function tryModel(model: string) {
    const start = Date.now();
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Say "ok" and nothing else.' }] }] }),
          signal: AbortSignal.timeout(20000),
        },
      );
      const bodyText = await res.text();
      return { model, status: res.status, ok: res.ok, ms: Date.now() - start, body: bodyText.slice(0, 500) };
    } catch (err) {
      return { model, error: err instanceof Error ? err.message : String(err), ms: Date.now() - start };
    }
  }

  async function tryModelsList() {
    const start = Date.now();
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      const modelNames = Array.isArray(data.models) ? data.models.map((m: { name: string }) => m.name).slice(0, 30) : data;
      return { status: res.status, ok: res.ok, ms: Date.now() - start, modelNames };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err), ms: Date.now() - start };
    }
  }

  const [modelsList, primaryModel, altModel] = await Promise.all([
    tryModelsList(),
    tryModel(process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite'),
    tryModel('gemini-2.5-flash'),
  ]);

  return NextResponse.json({ modelsList, primaryModel, altModel, checkedAt: new Date().toISOString() });
}
