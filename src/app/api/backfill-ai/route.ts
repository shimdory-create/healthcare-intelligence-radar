import { NextRequest, NextResponse } from 'next/server';
import { getRecentArticles } from '@/lib/db';
import { enrichArticles } from '@/lib/aiEnrichment';

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { articles } = await getRecentArticles({ limit: 1000 });
  const result = await enrichArticles(articles);
  return NextResponse.json({ total: articles.length, ...result });
}
