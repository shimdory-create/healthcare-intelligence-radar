import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

// A standard desktop browser UA -- Node's default fetch sends none at all, and some news
// outlets 403 or serve a bot-interstitial to such requests, silently degrading this
// (never-throws) function to its null/fallback path with no visible error.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

// Guard against a pathological response body -- this is the single heaviest memory
// operation in the deep-analysis pipeline (raw HTML held in memory, then re-parsed into a
// full DOM by JSDOM). 5MB comfortably covers any real article page.
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

/** fetches `url` and extracts its main article text with Readability (the same engine
 *  behind Firefox Reader Mode) -- far more robust across 24 different outlet HTML
 *  structures than hand-rolled tag stripping. Never throws: any failure (network, no
 *  extractable content, malformed HTML) resolves to null so callers can fall back. */
export async function extractArticleText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) return null;

    const contentLength = res.headers.get('content-length');
    if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) return null;

    let html = await res.text();
    if (html.length > MAX_RESPONSE_BYTES) html = html.slice(0, MAX_RESPONSE_BYTES);

    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    if (!article?.textContent) return null;

    const text = article.textContent.trim();
    // Readability can return a short non-null textContent (a couple of characters) for
    // pages with no real article body -- a >100 floor (not >0) distinguishes "no article"
    // from a trivially short but technically present body.
    return text.length > 100 ? text : null;
  } catch {
    return null;
  }
}
