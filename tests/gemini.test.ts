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
        headline_note: '',
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
      headlineNote: null,
      bullets: [{ text: '9월 8일부터 전국 공급 개시', note: null, subBullets: ['표준용량 대비 항원 4배'] }],
      background: null,
      isReference: false,
      isRelevant: true,
    });
  });

  it('carries a headline-level note through when a term appears only in the headline', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockGeminiResponse(
      JSON.stringify({
        category: '국내 산업',
        headline: '카카오페이, 스테이블코인 기반 AI 에이전트 결제 PoC 완료',
        headline_note: 'PoC: 기술실증, 기술이나 아이디어의 구현 가능성을 확인',
        bullets: [{ text: '이용자가 정한 결제 한도 내에서 AI 에이전트가 결제 여부 판단', note: '', sub_bullets: [] }],
        background: '',
        is_reference: false,
        is_relevant: true,
      }),
    );

    const result = await analyzeDeep('카카오페이 PoC 완료', '본문');

    expect(result.headlineNote).toBe('PoC: 기술실증, 기술이나 아이디어의 구현 가능성을 확인');
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

  it('carries a bullet-level note through when its term appears in that bullet\'s own text', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockGeminiResponse(
      JSON.stringify({
        category: '국내 보험·제도',
        headline: 'h',
        bullets: [{ text: '건정심 심의 결과 발표', note: '건정심: 건강보험정책심의위원회', sub_bullets: [] }],
        background: '',
        is_reference: false,
        is_relevant: true,
      }),
    );

    const result = await analyzeDeep('제목', '본문');

    expect(result.bullets[0].note).toBe('건정심: 건강보험정책심의위원회');
  });

  it('drops a headline_note whose term never appears in the headline (orphaned note)', async () => {
    // seen live 2026-09-18: a "DMT: 질병의 진행 자체를 늦추는 질병조절치료제" note under a
    // headline that never used the word "DMT" anywhere in headline or bullets
    process.env.GEMINI_API_KEY = 'test-key';
    mockGeminiResponse(
      JSON.stringify({
        category: '국내 산업',
        headline: 'SK바이오팜, 퍼스트바이오 파킨슨병 후보물질 도입·오픈이노베이션 가동',
        headline_note: 'DMT: 질병의 진행 자체를 늦추는 질병조절치료제',
        bullets: [{ text: 'LRRK2 및 c-Abl 이중저해 저분자 경구용 화합물 도입', note: '', sub_bullets: [] }],
        background: '',
        is_reference: false,
        is_relevant: true,
      }),
    );

    const result = await analyzeDeep('제목', '본문');

    expect(result.headlineNote).toBeNull();
  });

  it('drops a bullet note whose term never appears in that bullet\'s own text', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockGeminiResponse(
      JSON.stringify({
        category: '국내 보험·제도',
        headline: 'h',
        bullets: [{ text: '급여기준 심의 결과 발표', note: '건정심: 건강보험정책심의위원회', sub_bullets: [] }],
        background: '',
        is_reference: false,
        is_relevant: true,
      }),
    );

    const result = await analyzeDeep('제목', '본문');

    expect(result.bullets[0].note).toBeNull();
  });

  it('throws when GEMINI_API_KEY is not set, same as analyzeArticles', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(analyzeDeep('제목', '본문')).rejects.toThrow('GEMINI_API_KEY');
  });
});
