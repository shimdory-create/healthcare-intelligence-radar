import { NextRequest, NextResponse } from 'next/server';
import { collectAll } from '@/lib/collect';

// TEMPORARY diagnostic route -- runs the real collectAll() (all 56 sources) so source_health
// actually updates, without touching AI/report/send. Used to confirm a source-config fix is
// visible on /monitoring, not just working in isolation. Delete after confirming.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const summaries = await collectAll();
  const relevant = summaries.filter((s) => s.sourceId === 'hankyung' || s.sourceId === 'joongang');
  return NextResponse.json({ total: summaries.length, relevant });
}
