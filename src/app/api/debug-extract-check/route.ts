import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { extractArticleText } from '@/lib/articleExtract';

export const maxDuration = 120;

interface Row {
  id: number;
  source_id: string;
  title: string;
  url: string;
  collected_at: Date;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // up to 4 most recent articles per source over the last 14 days, so we can tell whether a
  // failure is source-specific/persistent vs an isolated one-off
  const rows = (await sql`
    select id, source_id, title, url, collected_at
    from (
      select a.id, a.source_id, a.title, a.url, a.collected_at,
        row_number() over (partition by a.source_id order by a.collected_at desc) as rn
      from articles a
      where a.collected_at >= now() - interval '14 days'
        and a.duplicate_of_id is null
    ) x
    where rn <= 4
    order by source_id, collected_at desc
  `) as unknown as Row[];

  const results = await Promise.all(
    rows.map(async (r) => {
      const text = await extractArticleText(r.url);
      return {
        sourceId: r.source_id,
        id: r.id,
        title: r.title,
        url: r.url,
        collectedAt: r.collected_at,
        ok: !!text,
        len: text?.length ?? 0,
      };
    }),
  );

  const bySource: Record<string, { ok: number; fail: number; failures: { id: number; title: string; url: string }[] }> = {};
  for (const r of results) {
    if (!bySource[r.sourceId]) bySource[r.sourceId] = { ok: 0, fail: 0, failures: [] };
    if (r.ok) bySource[r.sourceId].ok++;
    else {
      bySource[r.sourceId].fail++;
      bySource[r.sourceId].failures.push({ id: r.id, title: r.title, url: r.url });
    }
  }

  return NextResponse.json({ sampledCount: results.length, bySource });
}
