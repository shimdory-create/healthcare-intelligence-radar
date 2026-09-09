import type { ArticleRow } from './db';
import { getAiAnalysesForArticles, saveAiAnalysis, updateArticlePriority } from './db';
import { analyzeArticles, contentHash } from './gemini';

/** Gemini's free tier easily covers a full day's ~70-100 articles in ~8-10 batched calls
 *  (well under the 1,000+ requests/day free limit), so every collected article gets analyzed --
 *  not just a pre-filtered subset. */
const BATCH_SIZE = 10;

export interface EnrichmentResult {
  analyzed: number;
  cached: number;
  skipped: string | null;
  /** true when `deadlineMs` was reached before every article could be analyzed -- the
   *  remaining articles simply keep their rule-based priority, same as when AI is unconfigured. */
  stoppedEarly: boolean;
}

/** analyzes every article in `articles` with Gemini (in batches), reusing cached results for
 *  any article whose title/snippet hasn't changed since its last analysis. Each analyzed
 *  article's priority band is written back onto articles.priority, superseding the initial
 *  keyword-count-derived value. No-ops (does not throw) when AI is disabled or unconfigured --
 *  this must never block collection or delivery.
 *
 *  `deadlineMs` (epoch ms) caps how long this may run: the cron route's function has a hard
 *  wall-clock limit, and dedupe/email/kakao must always get their turn after this returns --
 *  a single slow-but-not-erroring Gemini batch must never eat the whole remaining budget. */
export async function enrichArticles(articles: ArticleRow[], deadlineMs?: number): Promise<EnrichmentResult> {
  if (process.env.FREE_ONLY !== 'true') {
    return { analyzed: 0, cached: 0, skipped: 'FREE_ONLY is not set to true', stoppedEarly: false };
  }
  if (!process.env.GEMINI_API_KEY) {
    return { analyzed: 0, cached: 0, skipped: 'GEMINI_API_KEY is not set', stoppedEarly: false };
  }

  const existingByArticleId = new Map(
    (await getAiAnalysesForArticles(articles.map((a) => a.id))).map((a) => [a.articleId, a]),
  );

  const toAnalyze: { id: number; title: string; snippet: string; hash: string }[] = [];
  let cached = 0;
  for (const a of articles) {
    const hash = contentHash(a.title, a.snippet ?? '');
    const existing = existingByArticleId.get(a.id);
    if (existing && existing.contentHash === hash) {
      cached++;
      continue;
    }
    toAnalyze.push({ id: a.id, title: a.title, snippet: a.snippet ?? '', hash });
  }

  if (toAnalyze.length === 0) return { analyzed: 0, cached, skipped: null, stoppedEarly: false };

  const model = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite';
  const hashById = new Map(toAnalyze.map((a) => [a.id, a.hash]));
  let analyzed = 0;
  let stoppedEarly = false;

  for (let i = 0; i < toAnalyze.length; i += BATCH_SIZE) {
    if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
      stoppedEarly = true;
      break;
    }

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

  return { analyzed, cached, skipped: null, stoppedEarly };
}
