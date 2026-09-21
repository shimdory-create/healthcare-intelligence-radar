import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchJsonScrapedArticles } from '@/lib/jsonScrape';
import type { SourceConfig } from '@/lib/sources.config';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetchJson(body: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      json: async () => body,
    }),
  );
}

function makeSource(overrides: Partial<SourceConfig>): SourceConfig {
  return {
    id: 'test-json-scrape',
    name: 'Test JSON Scrape Source',
    tier: 3,
    reliability: 'stable',
    fetchMethod: 'json_scrape',
    ...overrides,
  };
}

const SAMPLE_API_RESPONSE = {
  recordsTotal: '2',
  data: [
    { b_idx: '240513', b_subject: '첫 번째 보도자료', b_regdate: '2026/09/16' },
    { b_idx: '240512', b_subject: '두 번째 보도자료', b_regdate: '2026/09/14' },
  ],
};

describe('fetchJsonScrapedArticles', () => {
  it('parses each item into a RawArticle using the configured field names', async () => {
    mockFetchJson(SAMPLE_API_RESPONSE);
    const source = makeSource({
      jsonScrape: {
        url: 'https://example.org/api/list',
        itemsPath: 'data',
        titleField: 'b_subject',
        idField: 'b_idx',
        urlTemplate: (id) => `/press/select/${id}`,
      },
    });

    const articles = await fetchJsonScrapedArticles(source);

    expect(articles).toHaveLength(2);
    expect(articles[0].title).toBe('첫 번째 보도자료');
    expect(articles[0].url).toBe('https://example.org/press/select/240513');
  });

  it('resolves the built URL against the API endpoint', async () => {
    mockFetchJson(SAMPLE_API_RESPONSE);
    const source = makeSource({
      jsonScrape: {
        url: 'https://example.org/api/sub/list',
        itemsPath: 'data',
        titleField: 'b_subject',
        idField: 'b_idx',
        urlTemplate: (id) => `/press/select/${id}`,
      },
    });

    const articles = await fetchJsonScrapedArticles(source);

    expect(articles[0].url).toBe('https://example.org/press/select/240513');
  });

  it('applies the configured parseDate function to the date field', async () => {
    mockFetchJson(SAMPLE_API_RESPONSE);
    const source = makeSource({
      jsonScrape: {
        url: 'https://example.org/api/list',
        itemsPath: 'data',
        titleField: 'b_subject',
        idField: 'b_idx',
        dateField: 'b_regdate',
        urlTemplate: (id) => `/press/select/${id}`,
        parseDate: (raw) => {
          const m = raw.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
          if (!m) return null;
          return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+09:00`);
        },
      },
    });

    const articles = await fetchJsonScrapedArticles(source);

    expect(articles[0].publishedAt?.toISOString()).toBe('2026-09-15T15:00:00.000Z');
  });

  it('stringifies a numeric (epoch-millis) date field before handing it to parseDate', async () => {
    // seen live on 쿠키뉴스's Daum-channel JSON API, 2026-09-21: createDt is a number, not a
    // date string
    mockFetchJson({
      data: [{ b_idx: '1', b_subject: '제목', b_regdate: 1789963552098 }],
    });
    const source = makeSource({
      jsonScrape: {
        url: 'https://example.org/api/list',
        itemsPath: 'data',
        titleField: 'b_subject',
        idField: 'b_idx',
        dateField: 'b_regdate',
        urlTemplate: (id) => `/press/select/${id}`,
        parseDate: (raw) => new Date(Number(raw)),
      },
    });

    const articles = await fetchJsonScrapedArticles(source);

    expect(articles[0].publishedAt?.toISOString()).toBe('2026-09-21T04:05:52.098Z');
  });

  it('leaves publishedAt null when no dateField or parseDate is configured', async () => {
    mockFetchJson(SAMPLE_API_RESPONSE);
    const source = makeSource({
      jsonScrape: {
        url: 'https://example.org/api/list',
        itemsPath: 'data',
        titleField: 'b_subject',
        idField: 'b_idx',
        urlTemplate: (id) => `/press/select/${id}`,
      },
    });

    const articles = await fetchJsonScrapedArticles(source);

    expect(articles[0].publishedAt).toBeNull();
  });

  it('reads the items array from a nested path', async () => {
    mockFetchJson({ result: { list: SAMPLE_API_RESPONSE.data } });
    const source = makeSource({
      jsonScrape: {
        url: 'https://example.org/api/list',
        itemsPath: 'result.list',
        titleField: 'b_subject',
        idField: 'b_idx',
        urlTemplate: (id) => `/press/select/${id}`,
      },
    });

    const articles = await fetchJsonScrapedArticles(source);

    expect(articles).toHaveLength(2);
  });

  it('skips an item with no title', async () => {
    mockFetchJson({ data: [{ b_idx: '1', b_subject: '' }, { b_idx: '2', b_subject: '유효한 제목' }] });
    const source = makeSource({
      jsonScrape: { url: 'https://example.org/api/list', itemsPath: 'data', titleField: 'b_subject', idField: 'b_idx', urlTemplate: (id) => `/p/${id}` },
    });

    const articles = await fetchJsonScrapedArticles(source);

    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe('유효한 제목');
  });

  it('skips an item with no id', async () => {
    mockFetchJson({ data: [{ b_subject: '아이디 없음' }, { b_idx: '2', b_subject: '유효한 항목' }] });
    const source = makeSource({
      jsonScrape: { url: 'https://example.org/api/list', itemsPath: 'data', titleField: 'b_subject', idField: 'b_idx', urlTemplate: (id) => `/p/${id}` },
    });

    const articles = await fetchJsonScrapedArticles(source);

    expect(articles).toHaveLength(1);
  });

  it('throws when itemsPath does not resolve to an array', async () => {
    mockFetchJson({ data: 'not-an-array' });
    const source = makeSource({
      jsonScrape: { url: 'https://example.org/api/list', itemsPath: 'data', titleField: 'b_subject', idField: 'b_idx', urlTemplate: (id) => `/p/${id}` },
    });

    await expect(fetchJsonScrapedArticles(source)).rejects.toThrow("itemsPath 'data' did not resolve to an array");
  });

  it('throws when the API fetch itself fails', async () => {
    mockFetchJson(null, false);
    const source = makeSource({
      jsonScrape: { url: 'https://example.org/api/list', itemsPath: 'data', titleField: 'b_subject', idField: 'b_idx', urlTemplate: (id) => `/p/${id}` },
    });

    await expect(fetchJsonScrapedArticles(source)).rejects.toThrow('HTTP 500');
  });

  it('throws when fetchMethod is json_scrape but no jsonScrape config is set', async () => {
    const source = makeSource({ jsonScrape: undefined });

    await expect(fetchJsonScrapedArticles(source)).rejects.toThrow('no jsonScrape config');
  });
});
