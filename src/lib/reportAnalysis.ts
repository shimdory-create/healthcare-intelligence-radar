import { extractArticleText } from './articleExtract';
import { analyzeDeep, type DeepAnalysisResult } from './gemini';
import type { ReportCandidate } from './reportCandidates';

export interface CandidateDeepResult {
  articleId: number;
  category: DeepAnalysisResult['category'];
  note: string | null;
  bullets: DeepAnalysisResult['bullets'];
}

/** runs the fetch+extract+Gemini deep-analysis pipeline for each candidate, stopping
 *  before `deadlineMs` (same pattern as enrichArticles' time-budget guard) rather than
 *  risking the platform's wall-clock kill. A candidate that fails at any step (fetch,
 *  extraction, or Gemini) is simply left out of the returned map -- report.ts falls back
 *  to that article's existing short summary rather than dropping it or failing the run. */
export async function analyzeCandidatesDeep(
  candidates: ReportCandidate[],
  deadlineMs?: number,
): Promise<Map<number, CandidateDeepResult>> {
  const results = new Map<number, CandidateDeepResult>();

  for (const candidate of candidates) {
    if (deadlineMs !== undefined && Date.now() >= deadlineMs) break;

    const fullText = await extractArticleText(candidate.url);
    if (!fullText) continue;

    try {
      const deep = await analyzeDeep(candidate.title, fullText);
      results.set(candidate.id, { articleId: candidate.id, ...deep });
    } catch {
      continue;
    }
  }

  return results;
}
