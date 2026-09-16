import { describe, it, expect, vi, afterEach } from 'vitest';
import { analyzeArticles, analyzeDeep, contentHash } from '@/lib/gemini';

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
          priority: 'high',
          summary: '요약',
          implications: ['시사점1', '시사점2'],
          watch_point: '확인사항',
        },
      ]),
    );

    const result = await analyzeArticles([{ id: 1, title: '제목', snippet: '본문' }]);
    expect(result).toEqual([
      { articleId: 1, priority: 'high', summary: '요약', implications: ['시사점1', '시사점2'], watchPoint: '확인사항' },
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

describe('analyzeDeep', () => {
  it('parses a valid deep-analysis response', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockGeminiResponse(
      JSON.stringify({
        category: '국내 산업',
        headline: '사노피, 독감백신 전국 공급 개시',
        bullets: [
          { text: '9월 8일부터 전국 공급 개시', note: '', sub_bullets: ['표준용량 대비 항원 4배'] },
        ],
        background: '',
        is_reference: false,
        is_relevant: true,
      }),
    );

    const result = await analyzeDeep('사노피 독감백신 공급', '본문 전체 텍스트...');

    expect(result).toEqual({
      category: '국내 산업',
      headline: '사노피, 독감백신 전국 공급 개시',
      bullets: [{ text: '9월 8일부터 전국 공급 개시', note: null, subBullets: ['표준용량 대비 항원 4배'] }],
      background: null,
      isReference: false,
      isRelevant: true,
    });
  });

  it('carries isRelevant=false through when Gemini judges the article has no business relevance', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockGeminiResponse(
      JSON.stringify({
        category: '국내 산업',
        headline: '건보공단, 신규직원 채용',
        bullets: [{ text: '채용 인원 374명', note: '', sub_bullets: [] }],
        background: '',
        is_reference: false,
        is_relevant: false,
      }),
    );

    const result = await analyzeDeep('건보공단 채용공고', '본문');

    expect(result.isRelevant).toBe(false);
  });

  it('carries a bullet-level note through when Gemini provides one', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockGeminiResponse(
      JSON.stringify({
        category: '국내 보험·제도',
        headline: 'h',
        bullets: [{ text: 't', note: '건정심: 건강보험정책심의위원회', sub_bullets: [] }],
        background: '',
        is_reference: false,
        is_relevant: true,
      }),
    );

    const result = await analyzeDeep('제목', '본문');

    expect(result.bullets[0].note).toBe('건정심: 건강보험정책심의위원회');
  });

  it('throws when GEMINI_API_KEY is not set, same as analyzeArticles', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(analyzeDeep('제목', '본문')).rejects.toThrow('GEMINI_API_KEY');
  });
});
