import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchScrapedArticles } from '@/lib/scrape';
import type { SourceConfig } from '@/lib/sources.config';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetchHtml(html: string, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      text: async () => html,
    }),
  );
}

function makeSource(overrides: Partial<SourceConfig>): SourceConfig {
  return {
    id: 'test-scrape',
    name: 'Test Scrape Source',
    tier: 1,
    reliability: 'stable',
    fetchMethod: 'html_scrape',
    ...overrides,
  };
}

const SAMPLE_BOARD_HTML = `
  <html><body>
    <ul class="board-list">
      <li class="row">
        <a href="/board/view?id=101" class="tit">첫 번째 보도자료</a>
        <span class="date">2026-09-16</span>
      </li>
      <li class="row">
        <a href="/board/view?id=102" class="tit">두 번째 보도자료</a>
        <span class="date">2026-09-15</span>
      </li>
    </ul>
  </body></html>
`;

describe('fetchScrapedArticles', () => {
  it('parses each list item into a RawArticle using the configured selectors', async () => {
    mockFetchHtml(SAMPLE_BOARD_HTML);
    const source = makeSource({
      scrape: {
        url: 'https://example.gov/board',
        selectors: { item: 'li.row', title: 'a.tit', date: 'span.date' },
      },
    });

    const articles = await fetchScrapedArticles(source);

    expect(articles).toHaveLength(2);
    expect(articles[0].title).toBe('첫 번째 보도자료');
    expect(articles[0].url).toBe('https://example.gov/board/view?id=101');
  });

  it('resolves a relative href against the board page URL', async () => {
    mockFetchHtml(SAMPLE_BOARD_HTML);
    const source = makeSource({
      scrape: {
        url: 'https://example.gov/sub/board.do',
        selectors: { item: 'li.row', title: 'a.tit' },
      },
    });

    const articles = await fetchScrapedArticles(source);

    expect(articles[0].url).toBe('https://example.gov/board/view?id=101');
  });

  it('uses the title selector\'s own element as the link when no separate link selector is given', async () => {
    mockFetchHtml(SAMPLE_BOARD_HTML);
    const source = makeSource({
      scrape: {
        url: 'https://example.gov/board',
        selectors: { item: 'li.row', title: 'a.tit' },
      },
    });

    const articles = await fetchScrapedArticles(source);

    expect(articles[0].url).toContain('id=101');
  });

  it('applies the configured parseDate function to each item\'s date text', async () => {
    mockFetchHtml(SAMPLE_BOARD_HTML);
    const source = makeSource({
      scrape: {
        url: 'https://example.gov/board',
        selectors: { item: 'li.row', title: 'a.tit', date: 'span.date' },
        parseDate: (raw) => new Date(`${raw}T00:00:00+09:00`),
      },
    });

    const articles = await fetchScrapedArticles(source);

    expect(articles[0].publishedAt?.toISOString()).toBe('2026-09-15T15:00:00.000Z');
  });

  it('leaves publishedAt null when no date selector or parseDate is configured', async () => {
    mockFetchHtml(SAMPLE_BOARD_HTML);
    const source = makeSource({
      scrape: {
        url: 'https://example.gov/board',
        selectors: { item: 'li.row', title: 'a.tit' },
      },
    });

    const articles = await fetchScrapedArticles(source);

    expect(articles[0].publishedAt).toBeNull();
  });

  it('skips an item with no title text instead of throwing', async () => {
    mockFetchHtml(`
      <html><body>
        <ul class="board-list">
          <li class="row"><a href="/1" class="tit"></a></li>
          <li class="row"><a href="/2" class="tit">유효한 제목</a></li>
        </ul>
      </body></html>
    `);
    const source = makeSource({
      scrape: { url: 'https://example.gov/board', selectors: { item: 'li.row', title: 'a.tit' } },
    });

    const articles = await fetchScrapedArticles(source);

    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe('유효한 제목');
  });

  it('skips an item with no href instead of throwing', async () => {
    mockFetchHtml(`
      <html><body>
        <ul class="board-list">
          <li class="row"><span class="tit">링크 없는 항목</span></li>
          <li class="row"><a href="/2" class="tit">유효한 제목</a></li>
        </ul>
      </body></html>
    `);
    const source = makeSource({
      scrape: { url: 'https://example.gov/board', selectors: { item: 'li.row', title: 'a.tit' } },
    });

    const articles = await fetchScrapedArticles(source);

    expect(articles).toHaveLength(1);
  });

  it('throws when the board page fetch itself fails', async () => {
    mockFetchHtml('', false);
    const source = makeSource({
      scrape: { url: 'https://example.gov/board', selectors: { item: 'li.row', title: 'a.tit' } },
    });

    await expect(fetchScrapedArticles(source)).rejects.toThrow('HTTP 500');
  });

  it('throws when fetchMethod is html_scrape but no scrape config is set', async () => {
    const source = makeSource({ scrape: undefined });

    await expect(fetchScrapedArticles(source)).rejects.toThrow('no scrape config');
  });

  it('sends a browser-like User-Agent header', async () => {
    mockFetchHtml(SAMPLE_BOARD_HTML);
    const source = makeSource({
      scrape: { url: 'https://example.gov/board', selectors: { item: 'li.row', title: 'a.tit' } },
    });

    await fetchScrapedArticles(source);

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers['User-Agent']).toMatch(/Mozilla/);
  });
});
