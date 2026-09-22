import { getReportCandidates, type CandidateRow } from './db';
import type { PriorityBand } from './priority';

export interface ReportCandidate {
  id: number;
  title: string;
  url: string;
  tags: string[];
  priority: PriorityBand;
  outletCount: number;
  outletSourceIds: string[];
  isMultiOutlet: boolean;
}

function toReportCandidate(row: CandidateRow): ReportCandidate {
  // priority !== 'high' alone used to stand in for "promoted via outlet count," but
  // getReportCandidates also promotes non-high candidates via ALWAYS_INCLUDE_TAGS (a single-
  // outlet hospital-tagged article) -- those were mislabeled "다수매체 보도" with a "1개 매체
  // 보도" note despite genuinely covering only one outlet (found live 2026-09-22). Requiring
  // the real outlet-count threshold here keeps this in sync with getReportCandidates' own
  // "3+ outlets" promotion rule.
  return { ...row, isMultiOutlet: row.priority !== 'high' && row.outletCount >= 3 };
}

export async function getCandidatesForReport(collectedDates: string[]): Promise<ReportCandidate[]> {
  const rows = await getReportCandidates(collectedDates);
  return rows.map(toReportCandidate);
}
