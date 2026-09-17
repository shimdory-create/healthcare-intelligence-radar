import { NextRequest, NextResponse } from 'next/server';
import { sql, getLatestCollectionDate } from '@/lib/db';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const collectedDate = await getLatestCollectionDate();
  if (!collectedDate) return NextResponse.json({ error: 'no collection date' });

  const rows = (await sql`
    select a.priority, (aa.article_id is not null) as ai_judged, count(*)::int as n
    from articles a
    left join ai_analysis aa on aa.article_id = a.id
    where (a.collected_at at time zone 'Asia/Seoul')::date = ${collectedDate}::date
      and a.duplicate_of_id is null
    group by a.priority, ai_judged
    order by a.priority, ai_judged
  `) as unknown as { priority: string; ai_judged: boolean; n: number }[];

  const envCheck = {
    FREE_ONLY: process.env.FREE_ONLY ?? '(unset)',
    GEMINI_API_KEY_set: !!process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL ?? '(unset, uses default)',
  };

  return NextResponse.json({ collectedDate, breakdown: rows, envCheck });
}
