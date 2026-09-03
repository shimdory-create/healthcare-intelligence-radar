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

function parseDate(raw?: string): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Some feeds double-escape HTML entities (e.g. "&amp;apos;" in the source XML
// decodes once, via the XML parser, to the literal text "&apos;" rather than
// an actual apostrophe). Run a second pass over the common named/numeric
// entities so titles/snippets never show raw entity text on screen.
const HTML_ENTITIES: Record<string, string> = {
  '&apos;': "'",
  '&quot;': '"',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&(apos|quot|amp|lt|gt|nbsp);/g, (match) => HTML_ENTITIES[match])
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

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
      title: decodeHtmlEntities(item.title.trim()),
      url,
      publishedAt: parseDate(item.isoDate) ?? parseDate(item.pubDate),
      snippet: decodeHtmlEntities((item.contentSnippet || item.content || '').slice(0, 500)),
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
