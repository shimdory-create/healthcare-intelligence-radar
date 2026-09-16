import { extractArticleText } from './articleExtract';
import { analyzeDeep, type DeepAnalysisResult } from './gemini';
import type { ReportCandidate } from './reportCandidates';

export interface CandidateDeepResult {
  articleId: number;
  category: DeepAnalysisResult['category'];
  headline: string;
  bullets: DeepAnalysisResult['bullets'];
  background: string | null;
  isReference: boolean;
  isRelevant: boolean;
}

/** why a candidate has no entry in analyzeCandidatesDeep's results map -- surfaced in the
 *  cron route's JSON response so "a high item vanished from the report" is diagnosable from
 *  that response alone, instead of needing a fresh temporary diagnostic route every time. */
export type DeepAnalysisSkipReason = 'extract-failed' | 'gemini-failed' | 'deadline';

export interface DeepAnalysisSkip {
  articleId: number;
  reason: DeepAnalysisSkipReason;
}

export interface DeepAnalysisOutcome {
  results: Map<number, CandidateDeepResult>;
  skipped: DeepAnalysisSkip[];
}

/** runs the fetch+extract+Gemini deep-analysis pipeline for each candidate, stopping
 *  before `deadlineMs` (same pattern as enrichArticles' time-budget guard) rather than
 *  risking the platform's wall-clock kill. A candidate that fails at any step (fetch,
 *  extraction, or Gemini) is left out of `results` and recorded in `skipped` with why --
 *  report.ts still omits it from the report entirely rather than failing the whole run, but
 *  the reason is no longer silently lost. */
export async function analyzeCandidatesDeep(
  candidates: ReportCandidate[],
  deadlineMs?: number,
): Promise<DeepAnalysisOutcome> {
  const results = new Map<number, CandidateDeepResult>();
  const skipped: DeepAnalysisSkip[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];

    if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
      for (let j = i; j < candidates.length; j++) {
        skipped.push({ articleId: candidates[j].id, reason: 'deadline' });
      }
      break;
    }

    const fullText = await extractArticleText(candidate.url);
    if (!fullText) {
      skipped.push({ articleId: candidate.id, reason: 'extract-failed' });
      continue;
    }

    try {
      const deep = await analyzeDeep(candidate.title, fullText);
      results.set(candidate.id, { articleId: candidate.id, ...deep });
    } catch {
      skipped.push({ articleId: candidate.id, reason: 'gemini-failed' });
      continue;
    }
  }

  return { results, skipped };
}
