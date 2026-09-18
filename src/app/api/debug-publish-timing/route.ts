import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // KST hour-of-day distribution of published_at over the last 30 days -- shows when Korean
  // outlets actually publish, to size the collection cadence around real volume, not a guess
  const byHour = (await sql`
    select extract(hour from (published_at at time zone 'Asia/Seoul'))::int as kst_hour, count(*)::int as n
    from articles
    where published_at is not null
      and published_at >= now() - interval '30 days'
    group by kst_hour
    order by kst_hour
  `) as unknown as { kst_hour: number; n: number }[];

  // also by weekday to see if weekends differ
  const byDow = (await sql`
    select extract(dow from (published_at at time zone 'Asia/Seoul'))::int as kst_dow, count(*)::int as n
    from articles
    where published_at is not null
      and published_at >= now() - interval '30 days'
    group by kst_dow
    order by kst_dow
  `) as unknown as { kst_dow: number; n: number }[];

  const totalArticles = await sql`select count(*)::int as n from articles where published_at >= now() - interval '30 days'`;

  return NextResponse.json({ totalLast30Days: totalArticles[0].n, byHourKst: byHour, byWeekdayKst: byDow });
}
