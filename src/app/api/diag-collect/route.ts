import { NextRequest, NextResponse } from 'next/server';
import { collectAll } from '@/lib/collect';

// TEMPORARY diagnostic route -- runs the real collectAll() (all sources) so source_health
// actually updates, without touching AI/report/send. Used to confirm source-config fixes are
// visible on /monitoring, not just working in isolation. Delete after confirming.
const CHECK_IDS = new Set(['inews24', 'dailian', 'news1', 'munhwa', 'nocutnews', 'hankookilbo']);

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const summaries = await collectAll();
  const relevant = summaries.filter((s) => CHECK_IDS.has(s.sourceId));
  return NextResponse.json({ total: summaries.length, relevant });
}
