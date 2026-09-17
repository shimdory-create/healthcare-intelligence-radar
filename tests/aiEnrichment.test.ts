import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { ArticleRow, AiAnalysis } from '@/lib/db';

const ORIGINAL_ENV = { ...process.env };

const getAiAnalysesForArticles = vi.fn();
const saveAiAnalysis = vi.fn();
const updateArticlePriority = vi.fn();
const analyzeArticles = vi.fn();
const contentHash = vi.fn((title: string, snippet: string) => `hash:${title}:${snippet}`);

vi.mock('@/lib/db', () => ({ getAiAnalysesForArticles, saveAiAnalysis, updateArticlePriority }));
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
    priority: 'medium',
    ...overrides,
  };
}

beforeEach(() => {
  getAiAnalysesForArticles.mockReset();
  getAiAnalysesForArticles.mockResolvedValue([]);
  saveAiAnalysis.mockReset();
  updateArticlePriority.mockReset();
  analyzeArticles.mockReset();
  contentHash.mockClear();
  process.env = { ...ORIGINAL_ENV, FREE_ONLY: 'true', GEMINI_API_KEY: 'test-key' };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('enrichArticles', () => {
  it('skips without calling Gemini when FREE_ONLY is not "true"', async () => {
    process.env.FREE_ONLY = 'false';
    const { enrichArticles } = await import('@/lib/aiEnrichment');
    const result = await enrichArticles([makeArticle({ id: 1 })]);
    expect(result.skipped).toMatch(/FREE_ONLY/);
    expect(analyzeArticles).not.toHaveBeenCalled();
  });

  it('skips without calling Gemini when GEMINI_API_KEY is missing', async () => {
    delete process.env.GEMINI_API_KEY;
    const { enrichArticles } = await import('@/lib/aiEnrichment');
    const result = await enrichArticles([makeArticle({ id: 1 })]);
    expect(result.skipped).toMatch(/GEMINI_API_KEY/);
    expect(analyzeArticles).not.toHaveBeenCalled();
  });

  it('reuses cached analysis when the content hash is unchanged, and only calls Gemini for the rest', async () => {
    const { enrichArticles } = await import('@/lib/aiEnrichment');
    const articles = [
      makeArticle({ id: 1, title: 'A', snippet: 'a' }),
      makeArticle({ id: 2, title: 'B', snippet: 'b' }),
    ];
    getAiAnalysesForArticles.mockResolvedValue([{ articleId: 1, contentHash: 'hash:A:a' } as AiAnalysis]);
    analyzeArticles.mockResolvedValue([
      { articleId: 2, priority: 'high', summary: 's', implications: ['i'], watchPoint: 'w' },
    ]);

    const result = await enrichArticles(articles);

    expect(getAiAnalysesForArticles).toHaveBeenCalledWith([1, 2]);
    expect(analyzeArticles).toHaveBeenCalledTimes(1);
    expect(analyzeArticles).toHaveBeenCalledWith([{ id: 2, title: 'B', snippet: 'b' }]);
    expect(saveAiAnalysis).toHaveBeenCalledTimes(1);
    expect(saveAiAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ articleId: 2, contentHash: 'hash:B:b', priority: 'high' }),
    );
    expect(updateArticlePriority).toHaveBeenCalledWith(2, 'high');
    expect(result).toEqual({ analyzed: 1, cached: 1, skipped: null, stoppedEarly: false, failedBatches: 0 });
  });

  it('analyzes every article, batching into chunks of 10 across multiple Gemini calls', async () => {
    const { enrichArticles } = await import('@/lib/aiEnrichment');
    const articles = Array.from({ length: 12 }, (_, i) =>
      makeArticle({ id: i + 1, title: `T${i}`, snippet: `s${i}` }),
    );
    analyzeArticles.mockResolvedValue([]);

    await enrichArticles(articles);

    expect(analyzeArticles).toHaveBeenCalledTimes(2);
    const [firstChunk] = analyzeArticles.mock.calls[0];
    const [secondChunk] = analyzeArticles.mock.calls[1];
    expect(firstChunk).toHaveLength(10);
    expect(secondChunk).toHaveLength(2);
  });

  it('isolates a failed batch instead of aborting every batch after it', async () => {
    // found live 2026-09-17: one bad batch used to reject the whole enrichArticles() call,
    // discarding every later batch for the day even with plenty of time budget left (a
    // 20-article run stopped cold right where a 3rd batch would have started). Each batch
    // must now be independent -- a failure costs only that batch's articles.
    const { enrichArticles } = await import('@/lib/aiEnrichment');
    const articles = Array.from({ length: 20 }, (_, i) => makeArticle({ id: i + 1, title: `T${i}`, snippet: `s${i}` }));
    analyzeArticles
      .mockResolvedValueOnce(
        Array.from({ length: 10 }, (_, i) => ({
          articleId: i + 1,
          priority: 'medium' as const,
          summary: 's',
          implications: [],
          watchPoint: '',
        })),
      )
      .mockRejectedValueOnce(new Error('quota exceeded'));

    const result = await enrichArticles(articles);

    expect(analyzeArticles).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ analyzed: 10, cached: 0, skipped: null, stoppedEarly: false, failedBatches: 1 });
  });

  it('keeps processing later batches after a failed one', async () => {
    const { enrichArticles } = await import('@/lib/aiEnrichment');
    const articles = Array.from({ length: 20 }, (_, i) => makeArticle({ id: i + 1, title: `T${i}`, snippet: `s${i}` }));
    analyzeArticles
      .mockRejectedValueOnce(new Error('quota exceeded'))
      .mockResolvedValueOnce(
        Array.from({ length: 10 }, (_, i) => ({
          articleId: i + 11,
          priority: 'medium' as const,
          summary: 's',
          implications: [],
          watchPoint: '',
        })),
      );

    const result = await enrichArticles(articles);

    expect(analyzeArticles).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ analyzed: 10, cached: 0, skipped: null, stoppedEarly: false, failedBatches: 1 });
  });

  it('stops before the deadline and leaves the rest for the rule-based fallback, without erroring', async () => {
    const { enrichArticles } = await import('@/lib/aiEnrichment');
    const articles = Array.from({ length: 12 }, (_, i) =>
      makeArticle({ id: i + 1, title: `T${i}`, snippet: `s${i}` }),
    );
    // first batch resolves fine; the deadline is set so the loop should stop before the second
    analyzeArticles.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        articleId: i + 1,
        priority: 'medium' as const,
        summary: 's',
        implications: [],
        watchPoint: '',
      })),
    );
    const realDateNow = Date.now;
    let call = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      call++;
      // first check (before batch 1) passes; second check (before batch 2) is past deadline
      return call <= 1 ? 1_000 : 2_000;
    });

    const result = await enrichArticles(articles, 1_500);

    expect(analyzeArticles).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ analyzed: 10, cached: 0, skipped: null, stoppedEarly: true, failedBatches: 0 });

    Date.now = realDateNow;
  });

  it('does not stop early when no deadline is given', async () => {
    const { enrichArticles } = await import('@/lib/aiEnrichment');
    analyzeArticles.mockResolvedValue([]);

    const result = await enrichArticles([makeArticle({ id: 1 })]);

    expect(result.stoppedEarly).toBe(false);
  });

  it('never sends an article whose rule-based priority is already low', async () => {
    const { enrichArticles } = await import('@/lib/aiEnrichment');
    const articles = [
      makeArticle({ id: 1, title: 'A', snippet: 'a', priority: 'low' }),
      makeArticle({ id: 2, title: 'B', snippet: 'b', priority: 'medium' }),
    ];
    getAiAnalysesForArticles.mockResolvedValue([]);
    analyzeArticles.mockResolvedValue([
      { articleId: 2, priority: 'high', summary: 's', implications: ['i'], watchPoint: 'w' },
    ]);

    const result = await enrichArticles(articles);

    expect(analyzeArticles).toHaveBeenCalledTimes(1);
    expect(analyzeArticles).toHaveBeenCalledWith([{ id: 2, title: 'B', snippet: 'b' }]);
    expect(result).toEqual({ analyzed: 1, cached: 0, skipped: null, stoppedEarly: false, failedBatches: 0 });
  });

  it('skips Gemini entirely and reports skipped when every article is already low', async () => {
    const { enrichArticles } = await import('@/lib/aiEnrichment');
    const articles = [makeArticle({ id: 1, priority: 'low' })];
    getAiAnalysesForArticles.mockResolvedValue([]);

    const result = await enrichArticles(articles);

    expect(analyzeArticles).not.toHaveBeenCalled();
    expect(result).toEqual({ analyzed: 0, cached: 0, skipped: null, stoppedEarly: false, failedBatches: 0 });
  });
});
