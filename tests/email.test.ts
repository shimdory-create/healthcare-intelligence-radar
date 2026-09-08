import { describe, it, expect } from 'vitest';
import { buildDigestHtml } from '@/lib/email';
import type { ArticleRow, PriorityCounts, AiAnalysis, DuplicateRef } from '@/lib/db';

const COUNTS: PriorityCounts = { total: 2, high: 1, medium: 1, low: 0 };

function makeArticle(overrides: Partial<ArticleRow>): ArticleRow {
  return {
    id: 1,
    sourceId: 'healthchosun',
    tier: 3,
    title: '기본 제목',
    url: 'https://example.com/a',
    publishedAt: new Date('2026-09-03T00:00:00Z'),
    collectedAt: new Date('2026-09-03T00:00:00Z'),
    snippet: null,
    tags: [],
    score: 3,
    priority: 'high',
    ...overrides,
  };
}

function makeAnalysis(overrides: Partial<AiAnalysis>): AiAnalysis {
  return {
    articleId: 1,
    contentHash: 'h',
    model: 'gemini-3.5-flash-lite',
    priority: 'high',
    summary: '카드별 요약 텍스트',
    implications: [],
    watchPoint: '',
    analyzedAt: new Date(),
    ...overrides,
  };
}

describe('buildDigestHtml', () => {
  it('includes the date label, counts, and each article title/url', () => {
    const articles = [
      makeArticle({ id: 1, title: '비만치료제 급여화 논의', url: 'https://example.com/1', score: 3 }),
      makeArticle({ id: 2, title: '심평원 협력 MOU', url: 'https://example.com/2', score: 1 }),
    ];

    const html = buildDigestHtml(articles, COUNTS, '9월 3일 (목)', 'https://healthcare-radar.vercel.app');

    expect(html).toContain('9월 3일 (목)');
    expect(html).toContain('총 2건');
    expect(html).toContain('비만치료제 급여화 논의');
    expect(html).toContain('https://example.com/1');
    expect(html).toContain('심평원 협력 MOU');
    expect(html).toContain('https://healthcare-radar.vercel.app');
  });

  it("shows each article's own AI summary in its card when analyzed, and nothing extra when not", () => {
    const analyzed = makeArticle({ id: 1, title: '분석된 기사' });
    const unanalyzed = makeArticle({ id: 2, title: '미분석 기사' });
    const analysesById = new Map<number, AiAnalysis>([[1, makeAnalysis({ articleId: 1 })]]);

    const html = buildDigestHtml([analyzed, unanalyzed], COUNTS, '9월 3일 (목)', 'https://healthcare-radar.vercel.app', analysesById);

    expect(html).toContain('카드별 요약 텍스트');
    // exactly one summary paragraph should appear for the one analyzed article
    expect(html.match(/카드별 요약 텍스트/g)).toHaveLength(1);
  });

  it('shows the watch point and implications inline, with no link to a separate detail page', () => {
    const article = makeArticle({ id: 1 });
    const analysesById = new Map<number, AiAnalysis>([
      [1, makeAnalysis({ articleId: 1, watchPoint: '하위규정 확정 여부', implications: ['시사점 A', '시사점 B'] })],
    ]);

    const html = buildDigestHtml([article], COUNTS, '9월 3일 (목)', 'https://healthcare-radar.vercel.app', analysesById);

    expect(html).toContain('하위규정 확정 여부');
    expect(html).toContain('시사점 A');
    expect(html).toContain('시사점 B');
    expect(html).not.toContain('/article/1');
    expect(html).not.toContain('AI 분석 →');
  });

  it('omits the watch point line when there is no watch point', () => {
    const article = makeArticle({ id: 1 });
    const analysesById = new Map<number, AiAnalysis>([[1, makeAnalysis({ articleId: 1, watchPoint: '' })]]);

    const html = buildDigestHtml([article], COUNTS, '9월 3일 (목)', 'https://healthcare-radar.vercel.app', analysesById);

    expect(html).not.toContain('Watch:');
  });

  it('shows a "같은 소식" line linking to each duplicate when the survivor has duplicates', () => {
    const article = makeArticle({ id: 1 });
    const duplicates: DuplicateRef[] = [
      { id: 2, title: '다른 매체 제목', url: 'https://other-outlet.example.com/2', sourceId: 'healthchosun' },
    ];
    const duplicatesById = new Map<number, DuplicateRef[]>([[1, duplicates]]);

    const html = buildDigestHtml([article], COUNTS, '9월 3일 (목)', 'https://healthcare-radar.vercel.app', new Map(), duplicatesById);

    expect(html).toContain('같은 소식');
    expect(html).toContain('https://other-outlet.example.com/2');
  });

  it('omits the "같은 소식" line when there are no duplicates', () => {
    const article = makeArticle({ id: 1 });
    const html = buildDigestHtml([article], COUNTS, '9월 3일 (목)', 'https://healthcare-radar.vercel.app');
    expect(html).not.toContain('같은 소식');
  });

  it('escapes HTML-sensitive characters in titles', () => {
    const articles = [makeArticle({ title: '<script>alert("x")</script> & "따옴표"' })];

    const html = buildDigestHtml(articles, COUNTS, '9월 3일 (목)', 'https://healthcare-radar.vercel.app');

    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;따옴표&quot;');
  });
});
