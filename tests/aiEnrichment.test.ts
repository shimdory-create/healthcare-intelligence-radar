import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { ArticleRow, AiAnalysis } from '@/lib/db';

const ORIGINAL_ENV = { ...process.env };

const getAiAnalysis = vi.fn();
const saveAiAnalysis = vi.fn();
const analyzeArticles = vi.fn();
const contentHash = vi.fn((title: string, snippet: string) => `hash:${title}:${snippet}`);

vi.mock('@/lib/db', () => ({ getAiAnalysis, saveAiAnalysis }));
vi.mock('@/lib/gemini', () => ({ analyzeArticles, contentHash }));

function makeArticle(overrides: Partial<ArticleRow>): ArticleRow {
  return {
    id: 1,
    sourceId: 'healthchosun',
    tier: 3,
    title: '기본 제목',
    url: 'https://example.com/a',
    publishedAt: new Date('2026-09-04T00:00:00Z'),
    collectedAt: new Date('2026-09-04T00:00:00Z'),
    snippet: '본문',
    tags: [],
    score: 2,
    ...overrides,
  };
}

beforeEach(() => {
  getAiAnalysis.mockReset();
  saveAiAnalysis.mockReset();
  analyzeArticles.mockReset();
  contentHash.mockClear();
  process.env = { ...ORIGINAL_ENV, FREE_ONLY: 'true', GEMINI_API_KEY: 'test-key' };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('enrichTopArticles', () => {
  it('skips without calling Gemini when FREE_ONLY is not "true"', async () => {
    process.env.FREE_ONLY = 'false';
    const { enrichTopArticles } = await import('@/lib/aiEnrichment');
    const result = await enrichTopArticles([makeArticle({ id: 1 })]);
    expect(result.skipped).toMatch(/FREE_ONLY/);
    expect(analyzeArticles).not.toHaveBeenCalled();
  });

  it('skips without calling Gemini when GEMINI_API_KEY is missing', async () => {
    delete process.env.GEMINI_API_KEY;
    const { enrichTopArticles } = await import('@/lib/aiEnrichment');
    const result = await enrichTopArticles([makeArticle({ id: 1 })]);
    expect(result.skipped).toMatch(/GEMINI_API_KEY/);
    expect(analyzeArticles).not.toHaveBeenCalled();
  });

  it('reuses cached analysis when the content hash is unchanged, and only calls Gemini for the rest', async () => {
    const { enrichTopArticles } = await import('@/lib/aiEnrichment');
    const articles = [
      makeArticle({ id: 1, title: 'A', snippet: 'a', score: 5 }),
      makeArticle({ id: 2, title: 'B', snippet: 'b', score: 4 }),
    ];
    getAiAnalysis.mockImplementation(async (articleId: number) => {
      if (articleId === 1) return { contentHash: 'hash:A:a' } as AiAnalysis;
      return null;
    });
    analyzeArticles.mockResolvedValue([
      { articleId: 2, relevant: true, summary: 's', implications: ['i'], watchPoint: 'w' },
    ]);

    const result = await enrichTopArticles(articles);

    expect(analyzeArticles).toHaveBeenCalledTimes(1);
    expect(analyzeArticles).toHaveBeenCalledWith([{ id: 2, title: 'B', snippet: 'b' }]);
    expect(saveAiAnalysis).toHaveBeenCalledTimes(1);
    expect(saveAiAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ articleId: 2, contentHash: 'hash:B:b', relevant: true }),
    );
    expect(result).toEqual({ analyzed: 1, cached: 1, skipped: null });
  });

  it('only analyzes the top-scored articles, capped at 8', async () => {
    const { enrichTopArticles } = await import('@/lib/aiEnrichment');
    const articles = Array.from({ length: 12 }, (_, i) =>
      makeArticle({ id: i + 1, title: `T${i}`, snippet: `s${i}`, score: 12 - i }),
    );
    getAiAnalysis.mockResolvedValue(null);
    analyzeArticles.mockResolvedValue([]);

    await enrichTopArticles(articles);

    const [sentArticles] = analyzeArticles.mock.calls[0];
    expect(sentArticles).toHaveLength(8);
    expect(sentArticles.map((a: { id: number }) => a.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('propagates a Gemini failure -- the cron route catches it, not this function', async () => {
    const { enrichTopArticles } = await import('@/lib/aiEnrichment');
    getAiAnalysis.mockResolvedValue(null);
    analyzeArticles.mockRejectedValue(new Error('quota exceeded'));

    await expect(enrichTopArticles([makeArticle({ id: 1 })])).rejects.toThrow('quota exceeded');
  });
});
