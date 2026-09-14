import { NextRequest, NextResponse } from 'next/server';
import { getCandidatesForReport } from '@/lib/reportCandidates';

// TEMPORARY diagnostic route for Task 9 production verification -- sanity-checks the
// getCandidatesForReport DB query and reportDateRange wiring against real production data
// without spending a Gemini deep-analysis quota or sending a live email. Remove after use.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const todayKst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const candidates = await getCandidatesForReport([todayKst]);

  return NextResponse.json({ todayKst, count: candidates.length, candidates });
}
