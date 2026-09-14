import { NextRequest, NextResponse } from 'next/server';
import { getCandidatesForReport } from '@/lib/reportCandidates';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const date = req.nextUrl.searchParams.get('date');
  if (!date) return NextResponse.json({ error: 'missing ?date=YYYY-MM-DD' });

  const candidates = await getCandidatesForReport([date]);

  return NextResponse.json({
    multiOutlet: candidates
      .filter((c) => c.isMultiOutlet)
      .map((c) => ({ title: c.title, outletCount: c.outletCount, outletSourceIds: c.outletSourceIds })),
  });
}
