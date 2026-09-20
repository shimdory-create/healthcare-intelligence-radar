import { describe, it, expect } from 'vitest';
import { SOURCES } from '@/lib/sources.config';

describe('SOURCES', () => {
  it('has exactly 56 sources', () => {
    expect(SOURCES.length).toBe(56);
  });

  it('has unique ids', () => {
    const ids = SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has 13 tier-1, 22 tier-2, 21 tier-3 sources', () => {
    expect(SOURCES.filter((s) => s.tier === 1).length).toBe(13);
    expect(SOURCES.filter((s) => s.tier === 2).length).toBe(22);
    expect(SOURCES.filter((s) => s.tier === 3).length).toBe(21);
  });

  it('collects 중앙일보 via its Naver News channel (google_news_rss retired 2026-09-20)', () => {
    const joongang = SOURCES.find((s) => s.id === 'joongang');
    expect(joongang?.reliability).toBe('stable');
    expect(joongang?.fetchMethod).toBe('html_scrape');
  });

  it('marks 매일경제 as requiring a browser user-agent', () => {
    const mk = SOURCES.find((s) => s.id === 'mk');
    expect(mk?.requiresBrowserUA).toBe(true);
  });
});
