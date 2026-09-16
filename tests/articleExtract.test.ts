import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractArticleText } from '@/lib/articleExtract';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetchHtml(html: string, ok = true, contentLength?: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      text: async () => html,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-length' ? (contentLength ?? null) : null) },
    }),
  );
}

describe('extractArticleText', () => {
  it('extracts the main article text from a real-shaped article page', async () => {
    mockFetchHtml(`
      <html><head><title>기사 제목</title></head>
      <body>
        <nav>메뉴 메뉴 메뉴</nav>
        <article>
          <h1>기사 제목입니다</h1>
          <p>이것은 본문 첫 문단입니다. 충분히 길게 작성해서 Readability가 본문으로 인식하도록 합니다.</p>
          <p>이것은 본문 두 번째 문단입니다. 마찬가지로 내용을 채워 넣어서 기사 판별에 필요한 최소 길이를 넘깁니다.</p>
        </article>
        <footer>저작권 안내 문구</footer>
      </body></html>
    `);

    const text = await extractArticleText('https://example.com/article');

    expect(text).toContain('본문 첫 문단');
    expect(text).toContain('본문 두 번째 문단');
  });

  it('returns null when the fetch fails', async () => {
    mockFetchHtml('', false);
    const text = await extractArticleText('https://example.com/broken');
    expect(text).toBeNull();
  });

  it('returns null when the page has no extractable article content', async () => {
    mockFetchHtml('<html><body><div>짧음</div></body></html>');
    const text = await extractArticleText('https://example.com/empty');
    expect(text).toBeNull();
  });

  it('returns null instead of throwing when fetch itself rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const text = await extractArticleText('https://example.com/timeout');
    expect(text).toBeNull();
  });

  it('sends a browser-like User-Agent header so outlets do not 403 a bare Node fetch', async () => {
    mockFetchHtml('<html><body><article><p>본문</p></article></body></html>');
    await extractArticleText('https://example.com/article');

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers['User-Agent']).toMatch(/Mozilla/);
  });

  it('returns null without fetching the body when Content-Length exceeds the size guard', async () => {
    mockFetchHtml('<html><body><article><p>본문</p></article></body></html>', true, String(10 * 1024 * 1024));
    const text = await extractArticleText('https://example.com/huge');
    expect(text).toBeNull();
  });

  it('falls back to the embedded Fusion.globalContent blob when the static HTML has no article body', async () => {
    // Arc Publishing/Fusion CMS sites (e.g. chosun.com) render the article entirely
    // client-side -- the server HTML has no <p> tags at all, just this one JSON blob.
    const longParagraph = '이것은 위고비 임상 결과에 대한 긴 문단입니다. '.repeat(4);
    const globalContent = {
      content_elements: [
        { type: 'image', content: undefined },
        { type: 'text', content: `<p>${longParagraph}</p>` },
        { type: 'text', content: '두 번째 문단도 충분히 길게 작성해서 최소 길이 기준을 넘기도록 합니다.' },
      ],
    };
    const html = `<html><body><div id="fusion-app"></div><script id="fusion-metadata">window.Fusion={};Fusion.globalContent=${JSON.stringify(globalContent)};Fusion.contextPath="/pf";</script></body></html>`;
    mockFetchHtml(html);

    const text = await extractArticleText('https://www.chosun.com/economy/science/1/');

    expect(text).toContain('위고비 임상 결과');
    expect(text).toContain('두 번째 문단');
    expect(text).not.toContain('<p>');
  });

  it('strips <style> blocks before parsing, without affecting the extracted text', async () => {
    // jsdom's cssom parser logs ("Could not parse CSS stylesheet") on some real-world <style>
    // content it can't handle (seen live on kormedi.com) -- stripping style blocks first is a
    // free simplification since Readability never needs CSS to find the article text.
    const html = `
      <html><head><style>:root { --weird: attr(data-x); } .a::before { content: "•"; }</style></head>
      <body>
        <article>
          <p>이것은 본문 첫 문단입니다. 충분히 길게 작성해서 Readability가 본문으로 인식하도록 합니다.</p>
          <p>이것은 본문 두 번째 문단입니다. 마찬가지로 내용을 채워 넣어서 기사 판별에 필요한 최소 길이를 넘깁니다.</p>
        </article>
      </body></html>
    `;
    mockFetchHtml(html);

    const text = await extractArticleText('https://kormedi.com/article/1');

    expect(text).toContain('본문 첫 문단');
  });
});
