import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const rows = await sql`
    select
      date_trunc('hour', collected_at at time zone 'Asia/Seoul') as hour_kst,
      count(*)::int as n
    from articles
    where (collected_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
    group by 1
    order by 1
  `;

  return NextResponse.json({ hourly: rows });
}
