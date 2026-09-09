import { NextRequest, NextResponse } from 'next/server';
import { getRecentArticles, getLatestCollectionDate, updateArticlePriority } from '@/lib/db';
import { demoteDuplicatePriorities } from '@/lib/duplicates';

// one-off corrections for articles analyzed before today's new prompt rules landed --
// prompt changes never retroactively re-analyze already-cached articles.
const CORRECTIONS: { id: number; priority: 'high' | 'medium' | 'low' }[] = [
  { id: 676, priority: 'medium' }, // 실손보험 전자 청구... 청구 건수 고작 4.6% (실적 발표성)
  { id: 663, priority: 'medium' }, // 외래진료 횟수한도 365->300회 (순수 보험 행정)
  { id: 635, priority: 'high' }, // 마운자로 등 GLP-1... 지정 임박
  { id: 646, priority: 'high' }, // 위고비·마운자로 오남용우려의약품 지정 임박
];

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  for (const c of CORRECTIONS) {
    await updateArticlePriority(c.id, c.priority);
  }

  const collectedDate = await getLatestCollectionDate();
  if (!collectedDate) return NextResponse.json({ error: 'no data' }, { status: 404 });

  const { articles } = await getRecentArticles({ collectedDate, limit: 500 });
  const dedupe = await demoteDuplicatePriorities(articles);

  return NextResponse.json({ corrected: CORRECTIONS.length, collectedDate, dedupe });
}
