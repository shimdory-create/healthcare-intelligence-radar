import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractArticleText } from '@/lib/articleExtract';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetchHtml(html: string, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, text: async () => html }));
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
});
