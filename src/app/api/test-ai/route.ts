import { NextRequest, NextResponse } from 'next/server';
import { getRecentArticles, getLatestCollectionDate } from '@/lib/db';
import { enrichTopArticles } from '@/lib/aiEnrichment';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const collectedDate = await getLatestCollectionDate();
  if (!collectedDate) return NextResponse.json({ error: 'no data' }, { status: 404 });

  const { articles } = await getRecentArticles({ collectedDate, limit: 500 });
  const result = await enrichTopArticles(articles);
  return NextResponse.json(result);
}
