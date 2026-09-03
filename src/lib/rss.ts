import Parser from 'rss-parser';
import type { SourceConfig } from './sources.config';

export interface RawArticle {
  title: string;
  url: string;
  publishedAt: Date | null;
  snippet: string;
}

const parser = new Parser();

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export async function fetchSourceArticles(source: SourceConfig): Promise<RawArticle[]> {
  const headers: Record<string, string> = {};
  if (source.requiresBrowserUA) {
    headers['User-Agent'] = BROWSER_USER_AGENT;
  }

  const res = await fetch(source.rssUrl, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    throw new Error(`fetch failed for ${source.id}: HTTP ${res.status}`);
  }
  const xml = await res.text();
  const feed = await parser.parseString(xml);
  const items = feed.items ?? [];

  const results: RawArticle[] = [];
  for (const item of items) {
    if (!item.title || !item.link) continue;

    let url = item.link;
    if (source.fetchMethod === 'google_news_rss') {
      const resolved = await resolveGoogleNewsUrl(item.link);
      if (!resolved) continue; // skip this one item, never abort the whole source
      url = resolved;
    }

    results.push({
      title: item.title.trim(),
      url,
      publishedAt: item.isoDate ? new Date(item.isoDate) : item.pubDate ? new Date(item.pubDate) : null,
      snippet: (item.contentSnippet || item.content || '').slice(0, 500),
    });
  }
  return results;
}

export async function resolveGoogleNewsUrl(redirectUrl: string): Promise<string | null> {
  try {
    const res = await fetch(redirectUrl, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    if (res.url && res.url !== redirectUrl) return res.url;
    return null;
  } catch {
    return null;
  }
}
