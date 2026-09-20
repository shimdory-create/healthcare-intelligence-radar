import { NextRequest, NextResponse } from 'next/server';
import { collectAll } from '@/lib/collect';

// TEMPORARY diagnostic route -- runs the real collectAll() so source_health actually updates.
// Delete after confirming.
const CHECK_IDS = new Set(['kbs', 'mbc', 'sbs']);

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const summaries = await collectAll();
  const relevant = summaries.filter((s) => CHECK_IDS.has(s.sourceId));
  return NextResponse.json({ total: summaries.length, relevant });
}
