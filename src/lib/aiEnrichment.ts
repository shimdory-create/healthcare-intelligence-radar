import type { ArticleRow } from './db';
import { getAiAnalysis, saveAiAnalysis } from './db';
import { analyzeArticles, contentHash } from './gemini';

/** only the day's top-scored articles are ever sent to the AI -- never the full batch */
const TOP_N = 8;

export interface EnrichmentResult {
  analyzed: number;
  cached: number;
  skipped: string | null;
}

/** analyzes the top-scored articles in `articles` with Gemini, reusing cached results for any
 *  article whose title/snippet hasn't changed since its last analysis. No-ops (does not throw)
 *  when AI is disabled or unconfigured -- this must never block collection or delivery. */
export async function enrichTopArticles(articles: ArticleRow[]): Promise<EnrichmentResult> {
  if (process.env.FREE_ONLY !== 'true') {
    return { analyzed: 0, cached: 0, skipped: 'FREE_ONLY is not set to true' };
  }
  if (!process.env.GEMINI_API_KEY) {
    return { analyzed: 0, cached: 0, skipped: 'GEMINI_API_KEY is not set' };
  }

  const top = [...articles]
    .sort((a, b) => b.score - a.score || (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .slice(0, TOP_N);

  const toAnalyze: { id: number; title: string; snippet: string; hash: string }[] = [];
  let cached = 0;
  for (const a of top) {
    const hash = contentHash(a.title, a.snippet ?? '');
    const existing = await getAiAnalysis(a.id);
    if (existing && existing.contentHash === hash) {
      cached++;
      continue;
    }
    toAnalyze.push({ id: a.id, title: a.title, snippet: a.snippet ?? '', hash });
  }

  if (toAnalyze.length === 0) return { analyzed: 0, cached, skipped: null };

  const results = await analyzeArticles(toAnalyze.map((a) => ({ id: a.id, title: a.title, snippet: a.snippet })));

  const hashById = new Map(toAnalyze.map((a) => [a.id, a.hash]));
  const model = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite';
  for (const r of results) {
    const hash = hashById.get(r.articleId);
    if (!hash) continue; // ignore any id the model hallucinated outside the input set
    await saveAiAnalysis({
      articleId: r.articleId,
      contentHash: hash,
      model,
      relevant: r.relevant,
      summary: r.summary,
      implications: r.implications,
      watchPoint: r.watchPoint,
    });
  }

  return { analyzed: results.length, cached, skipped: null };
}
