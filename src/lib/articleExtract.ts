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

// a >100 floor (not >0) distinguishes "no real article" from a trivially short but
// technically present body -- shared by both extraction strategies below.
const MIN_ARTICLE_LENGTH = 100;

/** extracts every content_elements[].content of type "text" from an Arc Publishing/Fusion
 *  CMS page's embedded `Fusion.globalContent = {...}` state blob (chosun.com and other Arc
 *  sites render their article body entirely client-side -- the static HTML Readability sees
 *  has no <p> tags at all, just this one JSON blob with the real content). Scans for the
 *  matching closing brace by hand (tracking string/escape state) rather than a regex, since
 *  the JSON itself can contain semicolons or nested braces that would confuse a delimiter
 *  search. Returns null if the marker is absent, malformed, or too short to be a real article. */
function extractFusionArticleText(html: string): string | null {
  const marker = 'Fusion.globalContent=';
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) return null;

  const braceStart = markerIdx + marker.length;
  if (html[braceStart] !== '{') return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let i = braceStart; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) return null;

  try {
    const data = JSON.parse(html.slice(braceStart, end));
    const elements = data?.content_elements;
    if (!Array.isArray(elements)) return null;

    const text = elements
      .filter((el: unknown): el is { type: string; content: string } => {
        const e = el as { type?: unknown; content?: unknown };
        return e?.type === 'text' && typeof e.content === 'string';
      })
      .map((el) => el.content.replace(/<[^>]+>/g, ''))
      .join('\n')
      .trim();
    return text.length > MIN_ARTICLE_LENGTH ? text : null;
  } catch {
    return null;
  }
}

/** fetches `url` and extracts its main article text with Readability (the same engine
 *  behind Firefox Reader Mode) -- far more robust across 24 different outlet HTML
 *  structures than hand-rolled tag stripping. Falls back to extractFusionArticleText for
 *  Arc/Fusion CMS pages (see its own doc comment) whose article body isn't in the static
 *  HTML at all. Never throws: any failure (network, no extractable content, malformed HTML)
 *  resolves to null so callers can fall back. */
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
    // html.length counts UTF-16 code units, not bytes -- for a Korean-heavy page (3 bytes/char
    // in UTF-8, 1 code unit in a JS string) that undercounts by up to 3x, so a page with no
    // Content-Length header (the only other guard, above) could pass this check while still
    // being several times MAX_RESPONSE_BYTES on the wire. Buffer.byteLength measures the real
    // UTF-8 size; truncating via Buffer (not the JS string directly) keeps the cut accurate.
    if (Buffer.byteLength(html, 'utf8') > MAX_RESPONSE_BYTES) {
      html = Buffer.from(html, 'utf8').subarray(0, MAX_RESPONSE_BYTES).toString('utf8');
    }

    // Some outlets' inline <style> blocks contain CSS jsdom's cssom parser can't handle (seen
    // live on kormedi.com -- it logs "Could not parse CSS stylesheet" via its virtualConsole).
    // Readability never needs CSS to find the article text, so stripping style blocks before
    // parsing is a free, safe simplification regardless of source.
    html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    const readabilityText = article?.textContent?.trim();
    if (readabilityText && readabilityText.length > MIN_ARTICLE_LENGTH) return readabilityText;

    return extractFusionArticleText(html);
  } catch {
    return null;
  }
}
