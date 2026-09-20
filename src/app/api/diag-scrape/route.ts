import { NextRequest, NextResponse } from 'next/server';
import { fetchScrapedArticles } from '@/lib/scrape';
import { SOURCES } from '@/lib/sources.config';

// TEMPORARY diagnostic route -- verifies a given html_scrape source works from Vercel's
// egress, not just local dev. ?id=<sourceId>. Same pattern as every other prod-verification
// route this project has used. Delete after confirming.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get('id');
  const source = SOURCES.find((s) => s.id === id);
  if (!source) return NextResponse.json({ error: `unknown source id: ${id}` }, { status: 400 });
  try {
    const articles = await fetchScrapedArticles(source);
    return NextResponse.json({
      count: articles.length,
      sample: articles.slice(0, 5).map((a) => ({ title: a.title, url: a.url, publishedAt: a.publishedAt })),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
