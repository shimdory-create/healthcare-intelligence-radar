import { describe, it, expect, vi, afterEach } from 'vitest';
import { analyzeArticles, contentHash } from '@/lib/gemini';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

function mockGeminiResponse(text: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
    }),
  );
}

describe('contentHash', () => {
  it('is stable for the same title/snippet and differs when either changes', () => {
    const a = contentHash('제목', '본문');
    const b = contentHash('제목', '본문');
    const c = contentHash('제목', '다른 본문');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('analyzeArticles', () => {
  it('throws when GEMINI_API_KEY is not set', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(analyzeArticles([{ id: 1, title: 't', snippet: 's' }])).rejects.toThrow('GEMINI_API_KEY');
  });

  it('parses a valid structured JSON response into analysis items', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockGeminiResponse(
      JSON.stringify([
        {
          article_id: 1,
          relevant: true,
          summary: '요약',
          implications: ['시사점1', '시사점2'],
          watch_point: '확인사항',
        },
      ]),
    );

    const result = await analyzeArticles([{ id: 1, title: '제목', snippet: '본문' }]);
    expect(result).toEqual([
      { articleId: 1, relevant: true, summary: '요약', implications: ['시사점1', '시사점2'], watchPoint: '확인사항' },
    ]);
  });

  it('throws when the API responds with a non-ok status', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'quota exceeded' }),
    );
    await expect(analyzeArticles([{ id: 1, title: 't', snippet: 's' }])).rejects.toThrow('Gemini API error 429');
  });

  it('throws when the response has no text content', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ candidates: [] }) }),
    );
    await expect(analyzeArticles([{ id: 1, title: 't', snippet: 's' }])).rejects.toThrow('missing content');
  });
});
