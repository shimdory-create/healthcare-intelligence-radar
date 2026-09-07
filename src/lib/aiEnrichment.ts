import type { ArticleRow } from './db';
import { getAiAnalysis, saveAiAnalysis, updateArticlePriority } from './db';
import { analyzeArticles, contentHash } from './gemini';

/** Gemini's free tier easily covers a full day's ~70-100 articles in ~8-10 batched calls
 *  (well under the 1,000+ requests/day free limit), so every collected article gets analyzed --
 *  not just a pre-filtered subset. */
const BATCH_SIZE = 10;

export interface EnrichmentResult {
  analyzed: number;
  cached: number;
  skipped: string | null;
}

/** analyzes every article in `articles` with Gemini (in batches), reusing cached results for
 *  any article whose title/snippet hasn't changed since its last analysis. Each analyzed
 *  article's priority band is written back onto articles.priority, superseding the initial
 *  keyword-count-derived value. No-ops (does not throw) when AI is disabled or unconfigured --
 *  this must never block collection or delivery. */
export async function enrichArticles(articles: ArticleRow[]): Promise<EnrichmentResult> {
  if (process.env.FREE_ONLY !== 'true') {
    return { analyzed: 0, cached: 0, skipped: 'FREE_ONLY is not set to true' };
  }
  if (!process.env.GEMINI_API_KEY) {
    return { analyzed: 0, cached: 0, skipped: 'GEMINI_API_KEY is not set' };
  }

  const toAnalyze: { id: number; title: string; snippet: string; hash: string }[] = [];
  let cached = 0;
  for (const a of articles) {
    const hash = contentHash(a.title, a.snippet ?? '');
    const existing = await getAiAnalysis(a.id);
    if (existing && existing.contentHash === hash) {
      cached++;
      continue;
    }
    toAnalyze.push({ id: a.id, title: a.title, snippet: a.snippet ?? '', hash });
  }

  if (toAnalyze.length === 0) return { analyzed: 0, cached, skipped: null };

  const model = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite';
  const hashById = new Map(toAnalyze.map((a) => [a.id, a.hash]));
  let analyzed = 0;

  for (let i = 0; i < toAnalyze.length; i += BATCH_SIZE) {
    const chunk = toAnalyze.slice(i, i + BATCH_SIZE);
    const results = await analyzeArticles(chunk.map((a) => ({ id: a.id, title: a.title, snippet: a.snippet })));

    for (const r of results) {
      const hash = hashById.get(r.articleId);
      if (!hash) continue; // ignore any id the model hallucinated outside the input set
      await saveAiAnalysis({
        articleId: r.articleId,
        contentHash: hash,
        model,
        priority: r.priority,
        summary: r.summary,
        implications: r.implications,
        watchPoint: r.watchPoint,
      });
      await updateArticlePriority(r.articleId, r.priority);
      analyzed++;
    }
  }

  return { analyzed, cached, skipped: null };
}
