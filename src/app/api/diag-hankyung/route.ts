import { NextRequest, NextResponse } from 'next/server';
import { fetchScrapedArticles } from '@/lib/scrape';
import { SOURCES } from '@/lib/sources.config';

// TEMPORARY diagnostic route -- verifies the new hankyung Naver-scrape config actually works
// from Vercel's egress (not just local dev), same pattern as every other prod-verification
// route this project has used. Delete after confirming.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const hankyung = SOURCES.find((s) => s.id === 'hankyung')!;
  try {
    const articles = await fetchScrapedArticles(hankyung);
    return NextResponse.json({
      count: articles.length,
      sample: articles.slice(0, 5).map((a) => ({ title: a.title, url: a.url, publishedAt: a.publishedAt })),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
