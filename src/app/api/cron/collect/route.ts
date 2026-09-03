import { NextRequest, NextResponse } from 'next/server';
import { collectAll } from '@/lib/collect';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const summary = await collectAll();
  return NextResponse.json({ summary });
}
