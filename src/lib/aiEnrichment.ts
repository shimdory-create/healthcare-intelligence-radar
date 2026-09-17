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
  /** number of batches whose Gemini call (or response parsing) threw. Found live 2026-09-17:
   *  a single bad batch used to reject the whole enrichArticles() call, discarding every
   *  batch after it for the day even though plenty of time budget remained -- one day's
   *  20-article run stopped cold right where a 3rd batch would have started, instead of the
   *  ~80-100 articles the remaining time budget could have covered. Each batch is now
   *  isolated so one failure only costs that batch's 10 articles (left on their rule-based
   *  priority), not the rest of the day. */
  failedBatches: number;
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
    return { analyzed: 0, cached: 0, skipped: 'FREE_ONLY is not set to true', stoppedEarly: false, failedBatches: 0 };
  }
  if (!process.env.GEMINI_API_KEY) {
    return { analyzed: 0, cached: 0, skipped: 'GEMINI_API_KEY is not set', stoppedEarly: false, failedBatches: 0 };
  }

  const existingByArticleId = new Map(
    (await getAiAnalysesForArticles(articles.map((a) => a.id))).map((a) => [a.articleId, a]),
  );

  const toAnalyze: { id: number; title: string; snippet: string; hash: string }[] = [];
  let cached = 0;
  for (const a of articles) {
    // articles already at rule-based 'low' (keyword score 0) are almost always genuinely
    // low-relevance or untagged notices -- skipping them here roughly halves the daily
    // Gemini workload, which is what makes the report's deep-analysis pass (a separate,
    // later phase) fit inside the same time budget.
    if (a.priority === 'low') continue;

    const hash = contentHash(a.title, a.snippet ?? '');
    const existing = existingByArticleId.get(a.id);
    if (existing && existing.contentHash === hash) {
      cached++;
      continue;
    }
    toAnalyze.push({ id: a.id, title: a.title, snippet: a.snippet ?? '', hash });
  }

  if (toAnalyze.length === 0) return { analyzed: 0, cached, skipped: null, stoppedEarly: false, failedBatches: 0 };

  const model = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite';
  const hashById = new Map(toAnalyze.map((a) => [a.id, a.hash]));
  let analyzed = 0;
  let stoppedEarly = false;
  let failedBatches = 0;

  for (let i = 0; i < toAnalyze.length; i += BATCH_SIZE) {
    if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
      stoppedEarly = true;
      break;
    }

    const chunk = toAnalyze.slice(i, i + BATCH_SIZE);
    // isolated per batch -- a transient Gemini failure (quota blip, malformed response) on
    // one batch must not cost every batch after it; skip just this batch's articles (they
    // keep their rule-based priority for today) and keep going.
    let results;
    try {
      results = await analyzeArticles(chunk.map((a) => ({ id: a.id, title: a.title, snippet: a.snippet })));
    } catch {
      failedBatches++;
      continue;
    }

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

  return { analyzed, cached, skipped: null, stoppedEarly, failedBatches };
}
