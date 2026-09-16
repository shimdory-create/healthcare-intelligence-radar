import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReportCandidate } from '@/lib/reportCandidates';

const extractArticleText = vi.fn();
const analyzeDeep = vi.fn();

vi.mock('@/lib/articleExtract', () => ({ extractArticleText }));
vi.mock('@/lib/gemini', () => ({ analyzeDeep }));

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
});

describe('analyzeCandidatesDeep', () => {
  it('returns a deep result for each candidate whose fetch and analysis both succeed', async () => {
    const { analyzeCandidatesDeep } = await import('@/lib/reportAnalysis');
    extractArticleText.mockResolvedValue('본문 전체');
    analyzeDeep.mockResolvedValue({
      category: '국내 산업',
      headline: '요약 헤드라인',
      bullets: [{ text: 't', note: null, subBullets: [] }],
      background: null,
      isReference: false,
      isRelevant: true,
    });

    const result = await analyzeCandidatesDeep([makeCandidate({ id: 5 })]);

    expect(result.get(5)).toEqual({
      articleId: 5,
      category: '국내 산업',
      headline: '요약 헤드라인',
      bullets: [{ text: 't', note: null, subBullets: [] }],
      background: null,
      isReference: false,
      isRelevant: true,
    });
  });

  it('omits a candidate whose article text could not be extracted, without throwing', async () => {
    const { analyzeCandidatesDeep } = await import('@/lib/reportAnalysis');
    extractArticleText.mockResolvedValue(null);

    const result = await analyzeCandidatesDeep([makeCandidate({ id: 6 })]);

    expect(result.has(6)).toBe(false);
    expect(analyzeDeep).not.toHaveBeenCalled();
  });

  it('omits a candidate whose Gemini call fails, without throwing or affecting others', async () => {
    const { analyzeCandidatesDeep } = await import('@/lib/reportAnalysis');
    extractArticleText.mockResolvedValue('본문');
    analyzeDeep
      .mockRejectedValueOnce(new Error('quota exceeded'))
      .mockResolvedValueOnce({ category: 'Global', headline: 'h', bullets: [], background: null, isReference: false, isRelevant: true });

    const result = await analyzeCandidatesDeep([makeCandidate({ id: 7 }), makeCandidate({ id: 8 })]);

    expect(result.has(7)).toBe(false);
    expect(result.get(8)?.category).toBe('Global');
  });

  it('stops before the deadline and leaves the rest for the fallback path', async () => {
    const { analyzeCandidatesDeep } = await import('@/lib/reportAnalysis');
    extractArticleText.mockResolvedValue('본문');
    analyzeDeep.mockResolvedValue({ category: '국내 산업', headline: 'h', bullets: [], background: null, isReference: false, isRelevant: true });
    let call = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      call++;
      return call <= 1 ? 1_000 : 2_000;
    });

    const result = await analyzeCandidatesDeep(
      [makeCandidate({ id: 1 }), makeCandidate({ id: 2 })],
      1_500,
    );

    expect(analyzeDeep).toHaveBeenCalledTimes(1);
    expect(result.size).toBe(1);
    vi.restoreAllMocks();
  });
});
