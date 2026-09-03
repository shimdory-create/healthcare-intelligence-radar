import { NextRequest, NextResponse } from 'next/server';
import { collectAll } from '@/lib/collect';

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const summary = await collectAll();
  return NextResponse.json({ summary });
}
