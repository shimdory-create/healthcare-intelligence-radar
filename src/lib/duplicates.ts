import type { ArticleRow } from './db';
import { updateArticlePriority } from './db';
import type { PriorityBand } from './priority';

const PRIORITY_RANK: Record<PriorityBand, number> = { high: 3, medium: 2, low: 1 };
const DEMOTE: Record<PriorityBand, PriorityBand> = { high: 'medium', medium: 'low', low: 'low' };

/** two same-day articles sharing 2+ matched tags are treated as covering the same underlying
 *  story -- a cheap proxy for cross-outlet duplicate coverage that avoids the false-merge risk
 *  of real title-similarity clustering. This only ever adjusts priority; it never hides,
 *  merges, or removes an article. */
function shareStory(a: ArticleRow, b: ArticleRow): boolean {
  if (a.tags.length === 0 || b.tags.length === 0) return false;
  const setA = new Set(a.tags);
  let overlap = 0;
  for (const t of b.tags) {
    if (setA.has(t)) overlap++;
    if (overlap >= 2) return true;
  }
  return false;
}

function findGroups(articles: ArticleRow[]): ArticleRow[][] {
  const parent = new Map<number, number>();
  articles.forEach((a) => parent.set(a.id, a.id));
  function find(id: number): number {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    return root;
  }
  function union(a: number, b: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      if (shareStory(articles[i], articles[j])) union(articles[i].id, articles[j].id);
    }
  }
  const groups = new Map<number, ArticleRow[]>();
  for (const a of articles) {
    const root = find(a.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(a);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

export interface DemotionResult {
  demoted: number;
  groups: number;
}

/** for each cluster of same-day articles covering the same story (2+ shared tags), keeps the
 *  single strongest member's priority as-is and demotes every other member one tier
 *  (high->medium, medium->low) so cross-outlet duplicate coverage of one event doesn't
 *  inflate how many "high" items a user sees. Runs after AI enrichment (or the rule-based
 *  fallback) has already set each article's priority -- this is a pass over the result, not
 *  a replacement for it. */
export async function demoteDuplicatePriorities(articles: ArticleRow[]): Promise<DemotionResult> {
  const groups = findGroups(articles);
  let demoted = 0;
  for (const group of groups) {
    const [, ...rest] = [...group].sort((a, b) => {
      const rankDiff = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
      if (rankDiff !== 0) return rankDiff;
      return (a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0);
    });
    for (const article of rest) {
      const newPriority = DEMOTE[article.priority];
      if (newPriority !== article.priority) {
        await updateArticlePriority(article.id, newPriority);
        demoted++;
      }
    }
  }
  return { demoted, groups: groups.length };
}
