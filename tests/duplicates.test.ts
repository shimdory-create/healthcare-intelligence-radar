import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ArticleRow } from '@/lib/db';

const updateArticlePriority = vi.fn();
const setDuplicateOf = vi.fn();
vi.mock('@/lib/db', () => ({ updateArticlePriority, setDuplicateOf }));

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
  setDuplicateOf.mockReset();
});

describe('demoteDuplicatePriorities', () => {
  it('demotes every article but the strongest one in a group with a shared tag and similar titles', async () => {
    const { demoteDuplicatePriorities } = await import('@/lib/duplicates');
    const articles = [
      makeArticle({
        id: 1,
        tags: ['암'],
        title: "16개 전문 센터와 통합진료체계 갖춘 '한양대암병원' 개원",
        priority: 'high',
        publishedAt: new Date('2026-09-08T01:00:00Z'),
      }),
      makeArticle({
        id: 2,
        tags: ['암'],
        title: '한양대병원, 16개 전문센터 갖춘 한양대암병원 개원',
        priority: 'high',
        publishedAt: new Date('2026-09-08T02:00:00Z'),
      }),
    ];

    const result = await demoteDuplicatePriorities(articles);

    expect(result).toEqual({ demoted: 1, grouped: 1, groups: 1 });
    // article 1 published first -- kept as the survivor
    expect(updateArticlePriority).not.toHaveBeenCalledWith(1, expect.anything());
    expect(updateArticlePriority).toHaveBeenCalledWith(2, 'medium');
    expect(setDuplicateOf).toHaveBeenCalledWith(2, 1);
  });

  it('keeps the highest-priority member as the survivor even if published later', async () => {
    const { demoteDuplicatePriorities } = await import('@/lib/duplicates');
    const articles = [
      makeArticle({
        id: 1,
        tags: ['암'],
        title: '연세암병원 중입자치료, 4기 소수전이 폐암까지 확대',
        priority: 'medium',
        publishedAt: new Date('2026-09-08T01:00:00Z'),
      }),
      makeArticle({
        id: 2,
        tags: ['암'],
        title: '연세암병원 중입자치료, 초기 폐암 넘어 4기 소수전이 폐암까지 확대',
        priority: 'high',
        publishedAt: new Date('2026-09-08T02:00:00Z'),
      }),
    ];

    await demoteDuplicatePriorities(articles);

    expect(updateArticlePriority).toHaveBeenCalledTimes(1);
    expect(updateArticlePriority).toHaveBeenCalledWith(1, 'low');
    expect(setDuplicateOf).toHaveBeenCalledWith(1, 2);
  });

  it('does not group same-tag articles whose titles are actually different stories', async () => {
    const { demoteDuplicatePriorities } = await import('@/lib/duplicates');
    const articles = [
      makeArticle({ id: 1, tags: ['암'], title: '“건강검진서 못 잡아내 암 키웠다”… 유방암 진단까지 2개월', priority: 'high' }),
      makeArticle({ id: 2, tags: ['암'], title: '“젊어서 암 아니다” 의사가 치질이랬는데, 대장암', priority: 'high' }),
    ];

    const result = await demoteDuplicatePriorities(articles);

    expect(result).toEqual({ demoted: 0, grouped: 0, groups: 0 });
    expect(updateArticlePriority).not.toHaveBeenCalled();
    expect(setDuplicateOf).not.toHaveBeenCalled();
  });

  it('does not touch articles with no tags even if titles are similar', async () => {
    const { demoteDuplicatePriorities } = await import('@/lib/duplicates');
    const articles = [
      makeArticle({ id: 1, tags: [], title: '한양대암병원 개원 16개 전문센터', priority: 'high' }),
      makeArticle({ id: 2, tags: [], title: '한양대암병원 개원 16개 전문센터 확대', priority: 'high' }),
    ];

    const result = await demoteDuplicatePriorities(articles);

    expect(result).toEqual({ demoted: 0, grouped: 0, groups: 0 });
    expect(updateArticlePriority).not.toHaveBeenCalled();
    expect(setDuplicateOf).not.toHaveBeenCalled();
  });

  it('does not group articles that only share a tag with dissimilar titles', async () => {
    const { demoteDuplicatePriorities } = await import('@/lib/duplicates');
    const articles = [
      makeArticle({ id: 1, tags: ['보험'], title: '금융위원회 실손보험 개편 방안 발표', priority: 'high' }),
      makeArticle({ id: 2, tags: ['보험'], title: '생명보험협회 AI 도입 확대', priority: 'low' }),
    ];

    const result = await demoteDuplicatePriorities(articles);

    expect(result).toEqual({ demoted: 0, grouped: 0, groups: 0 });
    expect(updateArticlePriority).not.toHaveBeenCalled();
    expect(setDuplicateOf).not.toHaveBeenCalled();
  });

  it('groups a low-priority duplicate even though DEMOTE is a no-op for it', async () => {
    const { demoteDuplicatePriorities } = await import('@/lib/duplicates');
    const articles = [
      makeArticle({ id: 1, tags: ['디지털헬스'], title: '스카이랩스 24시간 혈압 측정 가능성 제시', priority: 'high' }),
      makeArticle({ id: 2, tags: ['디지털헬스'], title: '스카이랩스 24시간 혈압 측정 가능성 입증', priority: 'low' }),
    ];

    const result = await demoteDuplicatePriorities(articles);

    expect(result).toEqual({ demoted: 0, grouped: 1, groups: 1 });
    expect(updateArticlePriority).not.toHaveBeenCalled();
    expect(setDuplicateOf).toHaveBeenCalledWith(2, 1);
  });
});
