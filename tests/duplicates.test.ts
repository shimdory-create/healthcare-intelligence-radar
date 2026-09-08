import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ArticleRow } from '@/lib/db';

const updateArticlePriority = vi.fn();
vi.mock('@/lib/db', () => ({ updateArticlePriority }));

function makeArticle(overrides: Partial<ArticleRow>): ArticleRow {
  return {
    id: 1,
    sourceId: 'healthchosun',
    tier: 3,
    title: '기본 제목',
    url: 'https://example.com/a',
    publishedAt: new Date('2026-09-08T00:00:00Z'),
    collectedAt: new Date('2026-09-08T00:00:00Z'),
    snippet: null,
    tags: [],
    score: 2,
    priority: 'medium',
    ...overrides,
  };
}

beforeEach(() => {
  updateArticlePriority.mockReset();
});

describe('demoteDuplicatePriorities', () => {
  it('demotes every article but the strongest one in a group sharing 2+ tags', async () => {
    const { demoteDuplicatePriorities } = await import('@/lib/duplicates');
    const articles = [
      makeArticle({ id: 1, tags: ['디지털헬스', '심뇌혈관'], priority: 'high', publishedAt: new Date('2026-09-08T01:00:00Z') }),
      makeArticle({ id: 2, tags: ['디지털헬스', '심뇌혈관'], priority: 'high', publishedAt: new Date('2026-09-08T02:00:00Z') }),
      makeArticle({ id: 3, tags: ['디지털헬스', '심뇌혈관'], priority: 'high', publishedAt: new Date('2026-09-08T03:00:00Z') }),
    ];

    const result = await demoteDuplicatePriorities(articles);

    expect(result).toEqual({ demoted: 2, groups: 1 });
    // article 1 published first -- kept as-is
    expect(updateArticlePriority).not.toHaveBeenCalledWith(1, expect.anything());
    expect(updateArticlePriority).toHaveBeenCalledWith(2, 'medium');
    expect(updateArticlePriority).toHaveBeenCalledWith(3, 'medium');
  });

  it('keeps the highest-priority member as the survivor even if published later', async () => {
    const { demoteDuplicatePriorities } = await import('@/lib/duplicates');
    const articles = [
      makeArticle({ id: 1, tags: ['치매', '시니어'], priority: 'medium', publishedAt: new Date('2026-09-08T01:00:00Z') }),
      makeArticle({ id: 2, tags: ['치매', '시니어'], priority: 'high', publishedAt: new Date('2026-09-08T02:00:00Z') }),
    ];

    await demoteDuplicatePriorities(articles);

    expect(updateArticlePriority).toHaveBeenCalledTimes(1);
    expect(updateArticlePriority).toHaveBeenCalledWith(1, 'low');
  });

  it('does not touch articles sharing only one tag', async () => {
    const { demoteDuplicatePriorities } = await import('@/lib/duplicates');
    const articles = [
      makeArticle({ id: 1, tags: ['치매'], priority: 'high' }),
      makeArticle({ id: 2, tags: ['치매', '시니어'], priority: 'high' }),
    ];

    const result = await demoteDuplicatePriorities(articles);

    expect(result).toEqual({ demoted: 0, groups: 0 });
    expect(updateArticlePriority).not.toHaveBeenCalled();
  });

  it('does not touch articles with no tags', async () => {
    const { demoteDuplicatePriorities } = await import('@/lib/duplicates');
    const articles = [
      makeArticle({ id: 1, tags: [], priority: 'high' }),
      makeArticle({ id: 2, tags: [], priority: 'high' }),
    ];

    const result = await demoteDuplicatePriorities(articles);

    expect(result).toEqual({ demoted: 0, groups: 0 });
    expect(updateArticlePriority).not.toHaveBeenCalled();
  });

  it('low stays low (no-op) so it is not counted as demoted', async () => {
    const { demoteDuplicatePriorities } = await import('@/lib/duplicates');
    const articles = [
      makeArticle({ id: 1, tags: ['보험', 'GLP-1'], priority: 'high' }),
      makeArticle({ id: 2, tags: ['보험', 'GLP-1'], priority: 'low' }),
    ];

    const result = await demoteDuplicatePriorities(articles);

    expect(result).toEqual({ demoted: 0, groups: 1 });
    expect(updateArticlePriority).not.toHaveBeenCalled();
  });
});
