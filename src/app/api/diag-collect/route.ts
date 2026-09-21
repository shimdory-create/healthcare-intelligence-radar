import { NextRequest, NextResponse } from 'next/server';
import { collectAll } from '@/lib/collect';

// TEMPORARY diagnostic route -- verifies 쿠키뉴스 (cookienews) and confirms kicaa's retry logic
// via real collectAll(). Delete after confirming.
const CHECK_IDS = new Set(['cookienews', 'kicaa']);

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const summaries = await collectAll();
  const relevant = summaries.filter((s) => CHECK_IDS.has(s.sourceId));
  return NextResponse.json({ total: summaries.length, relevant });
}
