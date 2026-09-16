import { NextRequest, NextResponse } from 'next/server';
import { fetchSourceArticles } from '@/lib/rss';
import { extractArticleText } from '@/lib/articleExtract';
import { SOURCES } from '@/lib/sources.config';

export const maxDuration = 90;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // dry run only -- fetchSourceArticles never writes to the DB, so this is safe to call
  // outside the normal collection cron
  const khidi = SOURCES.find((s) => s.id === 'khidi')!;
  const khidiArticles = await fetchSourceArticles(khidi);

  const joongang = SOURCES.find((s) => s.id === 'joongang')!;
  const joongangArticles = await fetchSourceArticles(joongang);

  const testUrls = {
    chosun: 'https://www.chosun.com/economy/science/2026/09/16/Q4VZQ2YZJVEBDIJPLHLUCLGY4M/',
    kormedi: 'https://kormedi.com/2865667/',
    mk: 'https://www.mk.co.kr/news/economy/12153243',
  };

  const extraction: Record<string, { ok: boolean; len: number }> = {};
  for (const [key, url] of Object.entries(testUrls)) {
    const text = await extractArticleText(url);
    extraction[key] = { ok: !!text, len: text?.length ?? 0 };
  }

  return NextResponse.json({
    khidi: {
      count: khidiArticles.length,
      sampleUrls: khidiArticles.slice(0, 3).map((a) => a.url),
      allAbsolute: khidiArticles.every((a) => /^https?:\/\//i.test(a.url)),
    },
    joongang: {
      count: joongangArticles.length,
      sampleUrls: joongangArticles.slice(0, 3).map((a) => a.url),
      anyStillOnGoogle: joongangArticles.some((a) => a.url.includes('news.google.com')),
    },
    extraction,
  });
}
