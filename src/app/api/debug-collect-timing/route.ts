import { NextRequest, NextResponse } from 'next/server';
import { collectSource } from '@/lib/collect';
import { SOURCES } from '@/lib/sources.config';

export const maxDuration = 150;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  const timings = await Promise.all(
    SOURCES.map(async (source) => {
      const t0 = Date.now();
      const summary = await collectSource(source);
      return { sourceId: source.id, ms: Date.now() - t0, fetched: summary.fetched, inserted: summary.inserted, error: summary.error };
    }),
  );
  const totalMs = Date.now() - start;

  timings.sort((a, b) => b.ms - a.ms);

  return NextResponse.json({ totalMs, timings });
}
