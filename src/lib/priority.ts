export type PriorityBand = 'high' | 'medium' | 'low';

export const PRIORITY_LABELS: Record<PriorityBand, string> = {
  high: '🔴 높음',
  medium: '🟡 보통',
  low: '⚪ 참고',
};

/** initial/fallback priority derived from the keyword-match score at collection time.
 *  Overwritten by AI enrichment once that article has been analyzed -- see aiEnrichment.ts.
 *  Kept as the automatic fallback for whatever AI hasn't (yet) analyzed, or for any day AI
 *  enrichment fails outright (quota, outage, a retired model id) -- zero-cost insurance. */
export function scoreToPriority(score: number): PriorityBand {
  if (score >= 3) return 'high';
  if (score >= 1) return 'medium';
  return 'low';
}
