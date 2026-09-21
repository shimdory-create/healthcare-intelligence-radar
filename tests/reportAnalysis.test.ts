import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReportCandidate } from '@/lib/reportCandidates';

const extractArticleText = vi.fn();
const analyzeDeep = vi.fn();
const consolidateSimilarStories = vi.fn();

vi.mock('@/lib/articleExtract', () => ({ extractArticleText }));
vi.mock('@/lib/gemini', () => ({ analyzeDeep, consolidateSimilarStories }));

function makeCandidate(overrides: Partial<ReportCandidate>): ReportCandidate {
  return {
    id: 1,
    title: '기본 제목',
    url: 'https://example.com/a',
    tags: [],
    priority: 'high',
    outletCount: 1,
    outletSourceIds: ['yna'],
    isMultiOutlet: false,
    ...overrides,
  };
}

beforeEach(() => {
  extractArticleText.mockReset();
  analyzeDeep.mockReset();
  consolidateSimilarStories.mockReset();
  consolidateSimilarStories.mockResolvedValue([]);
});

describe('analyzeCandidatesDeep', () => {
  it('returns a deep result for each candidate whose fetch and analysis both succeed', async () => {
    const { analyzeCandidatesDeep } = await import('@/lib/reportAnalysis');
    extractArticleText.mockResolvedValue('본문 전체');
    analyzeDeep.mockResolvedValue({
      category: '국내 산업',
      headline: '요약 헤드라인',
      headlineNote: null,
      bullets: [{ text: 't', note: null, subBullets: [] }],
      background: null,
      isReference: false,
      isRelevant: true,
    });

    const { results, skipped } = await analyzeCandidatesDeep([makeCandidate({ id: 5 })]);

    expect(results.get(5)).toEqual({
      articleId: 5,
      category: '국내 산업',
      headline: '요약 헤드라인',
      headlineNote: null,
      bullets: [{ text: 't', note: null, subBullets: [] }],
      background: null,
      isReference: false,
      isRelevant: true,
    });
    expect(skipped).toEqual([]);
  });

  it('omits a candidate whose article text could not be extracted, and records why', async () => {
    const { analyzeCandidatesDeep } = await import('@/lib/reportAnalysis');
    extractArticleText.mockResolvedValue(null);

    const { results, skipped } = await analyzeCandidatesDeep([makeCandidate({ id: 6 })]);

    expect(results.has(6)).toBe(false);
    expect(analyzeDeep).not.toHaveBeenCalled();
    expect(skipped).toEqual([{ articleId: 6, reason: 'extract-failed' }]);
  });

  it('omits a candidate whose Gemini call fails, records why, without affecting others', async () => {
    const { analyzeCandidatesDeep } = await import('@/lib/reportAnalysis');
    extractArticleText.mockResolvedValue('본문');
    analyzeDeep
      .mockRejectedValueOnce(new Error('quota exceeded'))
      .mockResolvedValueOnce({ category: 'Global', headline: 'h', bullets: [], background: null, isReference: false, isRelevant: true });

    const { results, skipped } = await analyzeCandidatesDeep([makeCandidate({ id: 7 }), makeCandidate({ id: 8 })]);

    expect(results.has(7)).toBe(false);
    expect(results.get(8)?.category).toBe('Global');
    expect(skipped).toEqual([{ articleId: 7, reason: 'gemini-failed' }]);
  });

  it('stops before the deadline and records every remaining candidate as skipped for that reason', async () => {
    const { analyzeCandidatesDeep } = await import('@/lib/reportAnalysis');
    extractArticleText.mockResolvedValue('본문');
    analyzeDeep.mockResolvedValue({ category: '국내 산업', headline: 'h', bullets: [], background: null, isReference: false, isRelevant: true });
    let call = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      call++;
      return call <= 1 ? 1_000 : 2_000;
    });

    const { results, skipped } = await analyzeCandidatesDeep(
      [makeCandidate({ id: 1 }), makeCandidate({ id: 2 })],
      1_500,
    );

    expect(analyzeDeep).toHaveBeenCalledTimes(1);
    expect(results.size).toBe(1);
    expect(skipped).toEqual([{ articleId: 2, reason: 'deadline' }]);
    vi.restoreAllMocks();
  });

  it('drops the less complete duplicate when consolidateSimilarStories groups two candidates, keeping the one with more bullets', async () => {
    const { analyzeCandidatesDeep } = await import('@/lib/reportAnalysis');
    extractArticleText.mockResolvedValue('본문');
    analyzeDeep
      .mockResolvedValueOnce({
        category: 'Global', headline: '위고비 시력상실 소송', bullets: [{ text: 'a', note: null, subBullets: [] }], background: null, isReference: false, isRelevant: true,
      })
      .mockResolvedValueOnce({
        category: 'Global', headline: '오젬픽·위고비 시력 잃은 환자들 소송', bullets: [{ text: 'a', note: null, subBullets: [] }, { text: 'b', note: null, subBullets: [] }], background: null, isReference: false, isRelevant: true,
      });
    consolidateSimilarStories.mockResolvedValue([[10, 11]]);

    const { results, skipped } = await analyzeCandidatesDeep([makeCandidate({ id: 10 }), makeCandidate({ id: 11 })]);

    expect(results.has(10)).toBe(false);
    expect(results.has(11)).toBe(true);
    expect(results.get(11)?.consolidatedCount).toBe(2);
    expect(skipped).toEqual([{ articleId: 10, reason: 'consolidated-duplicate' }]);
  });
});
