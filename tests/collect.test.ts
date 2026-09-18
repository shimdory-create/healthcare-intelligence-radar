import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SourceConfig } from '@/lib/sources.config';

const fetchSourceArticles = vi.fn();
const fetchScrapedArticles = vi.fn();
const getExistingUrls = vi.fn();
const getExistingTitleDayKeys = vi.fn();
const insertArticle = vi.fn();
const syncSources = vi.fn();
const recordSourceHealth = vi.fn();

vi.mock('@/lib/rss', () => ({ fetchSourceArticles }));
vi.mock('@/lib/scrape', () => ({ fetchScrapedArticles }));
vi.mock('@/lib/db', () => ({ getExistingUrls, getExistingTitleDayKeys, insertArticle, syncSources, recordSourceHealth }));

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
  fetchSourceArticles.mockReset().mockResolvedValue([]);
  fetchScrapedArticles.mockReset().mockResolvedValue([]);
  getExistingUrls.mockReset().mockResolvedValue(new Set());
  getExistingTitleDayKeys.mockReset().mockResolvedValue(new Set());
  insertArticle.mockReset().mockResolvedValue(true);
  syncSources.mockReset().mockResolvedValue(undefined);
  recordSourceHealth.mockReset().mockResolvedValue(undefined);
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

describe('collectSource batched dedup', () => {
  it('fetches existing-URL/title-day state in one call each, not per article', async () => {
    const { collectSource } = await import('@/lib/collect');
    fetchSourceArticles.mockResolvedValue([
      { title: 'A', url: 'https://example.com/a', snippet: 'GLP-1', publishedAt: new Date('2026-09-18T01:00:00Z') },
      { title: 'B', url: 'https://example.com/b', snippet: 'GLP-1', publishedAt: new Date('2026-09-18T02:00:00Z') },
      { title: 'C', url: 'https://example.com/c', snippet: 'GLP-1', publishedAt: new Date('2026-09-18T03:00:00Z') },
    ]);

    await collectSource(makeSource({ tier: 1 }));

    expect(getExistingUrls).toHaveBeenCalledTimes(1);
    expect(getExistingTitleDayKeys).toHaveBeenCalledTimes(1);
    expect(getExistingUrls).toHaveBeenCalledWith(['https://example.com/a', 'https://example.com/b', 'https://example.com/c']);
  });

  it('skips an article whose URL already exists in the DB', async () => {
    const { collectSource } = await import('@/lib/collect');
    getExistingUrls.mockResolvedValue(new Set(['https://example.com/dup']));
    fetchSourceArticles.mockResolvedValue([{ title: '기사', url: 'https://example.com/dup', snippet: 'GLP-1' }]);

    const summary = await collectSource(makeSource({ tier: 1 }));

    expect(summary.inserted).toBe(0);
    expect(summary.skippedDuplicate).toBe(1);
    expect(insertArticle).not.toHaveBeenCalled();
  });

  it('skips an article that is a same-day title duplicate of a row already in the DB', async () => {
    const { collectSource } = await import('@/lib/collect');
    const publishedAt = new Date('2026-09-18T01:00:00Z');
    const dayStart = Date.UTC(2026, 8, 18);
    // normalizeTitle output is what the composite key is built from -- use the same title
    // for both the mocked existing key and the fetched article so they match after normalization
    const { normalizeTitle } = await import('@/lib/normalize');
    const titleNorm = normalizeTitle('중복 제목 기사');
    getExistingTitleDayKeys.mockResolvedValue(new Set([`${titleNorm}::${dayStart}`]));
    fetchSourceArticles.mockResolvedValue([{ title: '중복 제목 기사', url: 'https://example.com/new', snippet: 'GLP-1', publishedAt }]);

    const summary = await collectSource(makeSource({ tier: 1 }));

    expect(summary.inserted).toBe(0);
    expect(summary.skippedDuplicate).toBe(1);
  });

  it('skips the second of two same-day same-title articles within one source\'s own fetch, even though neither is in the DB yet', async () => {
    const { collectSource } = await import('@/lib/collect');
    const publishedAt = new Date('2026-09-18T01:00:00Z');
    fetchSourceArticles.mockResolvedValue([
      { title: '속보 중복', url: 'https://example.com/first', snippet: 'GLP-1', publishedAt },
      { title: '속보 중복', url: 'https://example.com/second', snippet: 'GLP-1', publishedAt },
    ]);

    const summary = await collectSource(makeSource({ tier: 1 }));

    expect(summary.inserted).toBe(1);
    expect(summary.skippedDuplicate).toBe(1);
  });

  it('does not flag two articles with the same title on different days as duplicates', async () => {
    const { collectSource } = await import('@/lib/collect');
    fetchSourceArticles.mockResolvedValue([
      { title: '제목', url: 'https://example.com/day1', snippet: 'GLP-1', publishedAt: new Date('2026-09-17T01:00:00Z') },
      { title: '제목', url: 'https://example.com/day2', snippet: 'GLP-1', publishedAt: new Date('2026-09-18T01:00:00Z') },
    ]);

    const summary = await collectSource(makeSource({ tier: 1 }));

    expect(summary.inserted).toBe(2);
    expect(summary.skippedDuplicate).toBe(0);
  });
});

describe('collectAll source sync', () => {
  it('syncs every configured source to the DB before collecting, so a newly added source is never left out of the FK-anchor table', async () => {
    const { collectAll } = await import('@/lib/collect');
    const { SOURCES } = await import('@/lib/sources.config');

    const summaries = await collectAll();

    expect(syncSources).toHaveBeenCalledTimes(1);
    const synced = syncSources.mock.calls[0][0];
    expect(synced.map((s: { id: string }) => s.id).sort()).toEqual(SOURCES.map((s) => s.id).sort());
    expect(summaries).toHaveLength(SOURCES.length);
  });

  it('persists every source\'s result to source_health after collecting', async () => {
    const { collectAll } = await import('@/lib/collect');
    const { SOURCES } = await import('@/lib/sources.config');

    const summaries = await collectAll();

    expect(recordSourceHealth).toHaveBeenCalledTimes(1);
    const recorded = recordSourceHealth.mock.calls[0][0];
    expect(recorded).toEqual(summaries);
    expect(recorded.map((s: { sourceId: string }) => s.sourceId).sort()).toEqual(SOURCES.map((s) => s.id).sort());
  });
});
