import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchSourceArticles, resolveGoogleNewsUrl } from '@/lib/rss';
import type { SourceConfig } from '@/lib/sources.config';

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Sample Feed</title>
  <item>
    <title>GLP-1 비만치료제 급여화 논의</title>
    <link>https://example.com/articles/1</link>
    <pubDate>Thu, 3 Sep 2026 09:00:00 +0900</pubDate>
    <description>보건복지부가 GLP-1 계열 비만치료제 급여 적용을 검토 중이다.</description>
  </item>
</channel></rss>`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchSourceArticles', () => {
  it('parses a plain RSS feed into RawArticle objects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => SAMPLE_RSS,
      }),
    );

    const source: SourceConfig = {
      id: 'test-source',
      name: 'Test Source',
      rssUrl: 'https://example.com/rss.xml',
      tier: 1,
      reliability: 'stable',
      fetchMethod: 'rss',
    };

    const articles = await fetchSourceArticles(source);
    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe('GLP-1 비만치료제 급여화 논의');
    expect(articles[0].url).toBe('https://example.com/articles/1');
    expect(articles[0].publishedAt).toBeInstanceOf(Date);
    expect(articles[0].snippet).toContain('비만치료제');
  });

  it('sends a browser User-Agent header when requiresBrowserUA is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => SAMPLE_RSS,
    });
    vi.stubGlobal('fetch', fetchMock);

    const source: SourceConfig = {
      id: 'mk',
      name: '매일경제',
      rssUrl: 'https://www.mk.co.kr/rss/30100041/',
      tier: 2,
      reliability: 'stable',
      fetchMethod: 'rss',
      requiresBrowserUA: true,
    };

    await fetchSourceArticles(source);
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers['User-Agent']).toMatch(/Mozilla/);
  });

  it('throws when the HTTP response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => '' }),
    );

    const source: SourceConfig = {
      id: 'broken',
      name: 'Broken',
      rssUrl: 'https://example.com/broken.xml',
      tier: 1,
      reliability: 'stable',
      fetchMethod: 'rss',
    };

    await expect(fetchSourceArticles(source)).rejects.toThrow();
  });
});

describe('resolveGoogleNewsUrl', () => {
  it('returns the resolved URL when the fetch redirects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, url: 'https://joongang.co.kr/real-article-123' }),
    );
    const resolved = await resolveGoogleNewsUrl('https://news.google.com/rss/articles/abc');
    expect(resolved).toBe('https://joongang.co.kr/real-article-123');
  });

  it('returns null when resolution fails instead of throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network error')),
    );
    const resolved = await resolveGoogleNewsUrl('https://news.google.com/rss/articles/abc');
    expect(resolved).toBeNull();
  });
});
