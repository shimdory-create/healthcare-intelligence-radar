import { NextRequest, NextResponse } from 'next/server';
import { analyzeArticles } from '@/lib/gemini';

// TEMPORARY diagnostic route -- delete after use. See feedback_rollback_tags_and_verification
// memory's established pattern. Purpose: aiEnrichment.ts's batch loop swallows the real Gemini
// error (bare `catch { failedBatches++; continue; }`), so live prod shows "failed-batches 9"
// with zero information about *why*. This calls analyzeArticles directly and surfaces the raw
// error message/stack instead of swallowing it.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const results = await analyzeArticles([
      { id: 999999, title: '테스트 기사 제목', snippet: '진단용 테스트 기사입니다.' },
    ]);
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      errorMessage: err instanceof Error ? err.message : String(err),
      errorStack: err instanceof Error ? err.stack : undefined,
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
      model: process.env.GEMINI_MODEL ?? '(default)',
    });
  }
}
