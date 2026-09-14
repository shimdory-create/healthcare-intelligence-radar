import { describe, it, expect, vi, beforeEach } from 'vitest';

const getReportCandidates = vi.fn();
vi.mock('@/lib/db', () => ({ getReportCandidates }));

beforeEach(() => {
  getReportCandidates.mockReset();
});

describe('getCandidatesForReport', () => {
  it('marks a high-priority candidate as not multi-outlet even if it is also heavily duplicated', async () => {
    const { getCandidatesForReport } = await import('@/lib/reportCandidates');
    getReportCandidates.mockResolvedValue([
      { id: 1, title: 'T', url: 'https://e.com/1', tags: ['GLP-1'], priority: 'high', outletCount: 5 },
    ]);

    const result = await getCandidatesForReport(['2026-09-14']);

    expect(result).toEqual([
      { id: 1, title: 'T', url: 'https://e.com/1', tags: ['GLP-1'], priority: 'high', outletCount: 5, isMultiOutlet: false },
    ]);
  });

  it('marks a non-high candidate that only qualified via outlet count as multi-outlet', async () => {
    const { getCandidatesForReport } = await import('@/lib/reportCandidates');
    getReportCandidates.mockResolvedValue([
      { id: 2, title: 'U', url: 'https://e.com/2', tags: ['암'], priority: 'medium', outletCount: 3 },
    ]);

    const result = await getCandidatesForReport(['2026-09-14']);

    expect(result[0].isMultiOutlet).toBe(true);
  });

  it('passes the collected dates through to the DB query unchanged', async () => {
    const { getCandidatesForReport } = await import('@/lib/reportCandidates');
    getReportCandidates.mockResolvedValue([]);

    await getCandidatesForReport(['2026-09-12', '2026-09-13', '2026-09-14']);

    expect(getReportCandidates).toHaveBeenCalledWith(['2026-09-12', '2026-09-13', '2026-09-14']);
  });
});
