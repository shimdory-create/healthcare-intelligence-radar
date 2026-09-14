import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

/** fetches `url` and extracts its main article text with Readability (the same engine
 *  behind Firefox Reader Mode) -- far more robust across 24 different outlet HTML
 *  structures than hand-rolled tag stripping. Never throws: any failure (network, no
 *  extractable content, malformed HTML) resolves to null so callers can fall back. */
export async function extractArticleText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;

    const html = await res.text();
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    if (!article?.textContent) return null;

    const text = article.textContent.trim();
    return text.length > 100 ? text : null;
  } catch {
    return null;
  }
}
