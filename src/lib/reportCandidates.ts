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
  return { ...row, isMultiOutlet: row.priority !== 'high' };
}

export async function getCandidatesForReport(collectedDates: string[]): Promise<ReportCandidate[]> {
  const rows = await getReportCandidates(collectedDates);
  return rows.map(toReportCandidate);
}
