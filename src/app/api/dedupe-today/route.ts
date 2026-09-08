import { NextRequest, NextResponse } from 'next/server';
import { getRecentArticles, getLatestCollectionDate } from '@/lib/db';
import { demoteDuplicatePriorities } from '@/lib/duplicates';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const collectedDate = await getLatestCollectionDate();
  if (!collectedDate) return NextResponse.json({ error: 'no data' }, { status: 404 });

  const { articles } = await getRecentArticles({ collectedDate, limit: 500 });
  const result = await demoteDuplicatePriorities(articles);
  return NextResponse.json({ collectedDate, total: articles.length, ...result });
}
