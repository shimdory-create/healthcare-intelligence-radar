import type { SourceConfig } from './sources.config';
import type { RawArticle } from './rss';

// same reasoning as scrape.ts's USER_AGENT
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, key) => (cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[key] : undefined), obj);
}

/** fetches a source's configured JSON API (source.jsonScrape) -- the same underlying API the
 *  site's own client-rendered list page calls -- and maps its items into the same RawArticle
 *  shape fetchSourceArticles/fetchScrapedArticles produce. Never throws for a per-item parse
 *  miss (skipped) -- only a failed fetch, a non-JSON response, or a missing items array throws,
 *  same contract as the other two fetch methods. */
export async function fetchJsonScrapedArticles(source: SourceConfig): Promise<RawArticle[]> {
  if (!source.jsonScrape) {
    throw new Error(`${source.id}: fetchMethod is 'json_scrape' but no jsonScrape config is set`);
  }
  const { url, itemsPath, titleField, idField, urlTemplate, dateField, parseDate } = source.jsonScrape;

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`fetch failed for ${source.id}: HTTP ${res.status}`);
  }
  const json = await res.json();

  const items = getPath(json, itemsPath);
  if (!Array.isArray(items)) {
    throw new Error(`${source.id}: itemsPath '${itemsPath}' did not resolve to an array`);
  }

  const results: RawArticle[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;

    const titleRaw = record[titleField];
    const title = typeof titleRaw === 'string' ? titleRaw.replace(/\s+/g, ' ').trim() : '';
    if (!title) continue;

    const idRaw = record[idField];
    const id = typeof idRaw === 'string' ? idRaw : typeof idRaw === 'number' ? String(idRaw) : '';
    if (!id) continue;

    let absoluteUrl: string;
    try {
      absoluteUrl = new URL(urlTemplate(id), url).href;
    } catch {
      continue;
    }

    const dateRaw = dateField ? record[dateField] : undefined;
    const dateText = typeof dateRaw === 'string' ? dateRaw : undefined;
    const publishedAt = dateText && parseDate ? parseDate(dateText) : null;

    results.push({ title, url: absoluteUrl, publishedAt, snippet: '' });
  }
  return results;
}
