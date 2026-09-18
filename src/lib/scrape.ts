import { JSDOM } from 'jsdom';
import type { SourceConfig } from './sources.config';
import type { RawArticle } from './rss';

// Same reasoning as rss.ts's BROWSER_USER_AGENT / articleExtract.ts's USER_AGENT -- a bare
// Node fetch with no UA gets 403'd or bot-interstitial'd by some sites.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/** fetches a source's configured board/list page (source.scrape) and parses its repeating
 *  item structure into the same RawArticle shape fetchSourceArticles (rss.ts) produces --
 *  collect.ts treats both the same way from here on. Unlike RSS, there is no feed-format
 *  standard to lean on: every site's list markup, and every site's date format, is bespoke,
 *  so each scraped source supplies its own CSS selectors (and optional date parser) in
 *  sources.config.ts. Never throws for a per-item parse miss (a malformed item is just
 *  skipped) -- only a failed fetch of the page itself throws, same contract as
 *  fetchSourceArticles. */
export async function fetchScrapedArticles(source: SourceConfig): Promise<RawArticle[]> {
  if (!source.scrape) {
    throw new Error(`${source.id}: fetchMethod is 'html_scrape' but no scrape config is set`);
  }
  const { url, selectors, parseDate } = source.scrape;

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`fetch failed for ${source.id}: HTTP ${res.status}`);
  }
  const html = await res.text();

  const dom = new JSDOM(html, { url });
  const items = Array.from(dom.window.document.querySelectorAll(selectors.item));

  const results: RawArticle[] = [];
  for (const item of items) {
    const titleEl = item.querySelector(selectors.title);
    const title = titleEl?.textContent?.replace(/\s+/g, ' ').trim();
    if (!title) continue;

    const linkEl = selectors.link
      ? item.querySelector(selectors.link)
      : item.tagName === 'A'
        ? item
        : item.querySelector('a');
    let href = linkEl?.getAttribute('href');

    // some boards navigate via JS instead of a real href -- either a separate onclick handler
    // (klia.or.kr: href="javascript:void(0);" onclick="fn_goView('123789',...)") or the call
    // embedded directly in the href itself as a javascript: pseudo-URL (kdca.go.kr:
    // href="javascript:jf_viewArtcl('kdca','41','312672')"). Match the pattern against
    // whichever of the two actually holds the call, and pull the article id out to build the
    // real URL from the configured template.
    if ((!href || href.startsWith('javascript:')) && selectors.onclick) {
      const onclickAttr = linkEl?.getAttribute('onclick') ?? '';
      const searchText = href?.startsWith('javascript:') ? `${onclickAttr} ${href}` : onclickAttr;
      const match = searchText.match(selectors.onclick.pattern);
      if (match?.[1]) href = selectors.onclick.urlTemplate(match[1]);
    }
    if (!href || href.startsWith('javascript:')) continue;

    let absoluteUrl: string;
    try {
      absoluteUrl = new URL(href, url).href;
    } catch {
      continue;
    }

    const dateText = selectors.date ? item.querySelector(selectors.date)?.textContent?.trim() : undefined;
    const publishedAt = dateText && parseDate ? parseDate(dateText) : null;

    results.push({ title, url: absoluteUrl, publishedAt, snippet: '' });
  }
  return results;
}
