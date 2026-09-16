import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SourceConfig } from '@/lib/sources.config';

const fetchSourceArticles = vi.fn();
const articleUrlExists = vi.fn();
const findSameDayTitleDuplicate = vi.fn();
const insertArticle = vi.fn();

vi.mock('@/lib/rss', () => ({ fetchSourceArticles }));
vi.mock('@/lib/db', () => ({ articleUrlExists, findSameDayTitleDuplicate, insertArticle }));

function makeSource(overrides: Partial<SourceConfig>): SourceConfig {
  return {
    id: 'test-source',
    name: 'Test Source',
    rssUrl: 'https://example.com/rss',
    tier: 2,
    reliability: 'stable',
    fetchMethod: 'rss',
    ...overrides,
  };
}

beforeEach(() => {
  fetchSourceArticles.mockReset();
  articleUrlExists.mockReset().mockResolvedValue(false);
  findSameDayTitleDuplicate.mockReset().mockResolvedValue(false);
  insertArticle.mockReset().mockResolvedValue(true);
});

describe('collectSource tier-aware tag filtering', () => {
  it('tier 1 (government) keeps an article with no tag match at all', async () => {
    const { collectSource } = await import('@/lib/collect');
    fetchSourceArticles.mockResolvedValue([{ title: '오늘의 날씨 예보', url: 'https://example.com/1', snippet: '' }]);

    const summary = await collectSource(makeSource({ tier: 1 }));

    expect(summary.inserted).toBe(1);
    expect(summary.skippedNoTagMatch).toBe(0);
  });

  it('tier 2 (general economy press) skips a weak-only match (no strong tag)', async () => {
    const { collectSource } = await import('@/lib/collect');
    fetchSourceArticles.mockResolvedValue([
      { title: 'KB금융 회장 후보에 이재근 부문장', url: 'https://example.com/2', snippet: '보험 계열사도 포함' },
    ]);

    const summary = await collectSource(makeSource({ tier: 2 }));

    expect(summary.inserted).toBe(0);
    expect(summary.skippedNoTagMatch).toBe(1);
    expect(insertArticle).not.toHaveBeenCalled();
  });

  it('tier 2 keeps an article with at least one strong tag match', async () => {
    const { collectSource } = await import('@/lib/collect');
    fetchSourceArticles.mockResolvedValue([
      { title: 'GLP-1 비만치료제 급여화 논의', url: 'https://example.com/3', snippet: '' },
    ]);

    const summary = await collectSource(makeSource({ tier: 2 }));

    expect(summary.inserted).toBe(1);
    expect(summary.skippedNoTagMatch).toBe(0);
  });

  it('tier 3 (healthcare specialty press) keeps a weak-only match, unlike tier 2', async () => {
    const { collectSource } = await import('@/lib/collect');
    fetchSourceArticles.mockResolvedValue([
      { title: '일산병원 무지외반증 교정 수술 기준 제시', url: 'https://example.com/4', snippet: '보험 청구 관련 안내도 포함' },
    ]);

    const summary = await collectSource(makeSource({ tier: 3 }));

    expect(summary.inserted).toBe(1);
    expect(summary.skippedNoTagMatch).toBe(0);
  });

  it('tier 3 still skips an article with no tag match at all', async () => {
    const { collectSource } = await import('@/lib/collect');
    fetchSourceArticles.mockResolvedValue([{ title: '오늘의 날씨 예보', url: 'https://example.com/5', snippet: '' }]);

    const summary = await collectSource(makeSource({ tier: 3 }));

    expect(summary.inserted).toBe(0);
    expect(summary.skippedNoTagMatch).toBe(1);
  });
});

describe('collectSource invalid-URL visibility', () => {
  it('counts a non-absolute URL as skippedInvalidUrl instead of silently disappearing', async () => {
    // fetchSourceArticles (rss.ts) already resolves relative links and rejects unresolved
    // Google News redirects, so this guard should rarely fire in practice -- but when it
    // does (a malformed feed, a future source with the same shape of bug khidi had), it must
    // show up as its own counted bucket, not vanish with no trace the way khidi's did for
    // two weeks before this counter existed.
    const { collectSource } = await import('@/lib/collect');
    fetchSourceArticles.mockResolvedValue([
      { title: '정상 기사', url: 'https://example.com/ok', snippet: 'GLP-1 비만치료제' },
      { title: '깨진 링크 기사', url: '/board/view?id=1', snippet: 'GLP-1 비만치료제' },
    ]);

    const summary = await collectSource(makeSource({ tier: 1 }));

    expect(summary.fetched).toBe(2);
    expect(summary.inserted).toBe(1);
    expect(summary.skippedInvalidUrl).toBe(1);
  });
});
