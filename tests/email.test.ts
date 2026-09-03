import { describe, it, expect } from 'vitest';
import { buildDigestHtml } from '@/lib/email';
import type { ArticleRow, PriorityCounts } from '@/lib/db';

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

  it('escapes HTML-sensitive characters in titles', () => {
    const articles = [makeArticle({ title: '<script>alert("x")</script> & "따옴표"' })];

    const html = buildDigestHtml(articles, COUNTS, '9월 3일 (목)', 'https://healthcare-radar.vercel.app');

    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;따옴표&quot;');
  });
});
