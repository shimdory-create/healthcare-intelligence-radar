import type { ArticleRow } from './db';
import { updateArticlePriority, setDuplicateOf } from './db';
import type { PriorityBand } from './priority';

const PRIORITY_RANK: Record<PriorityBand, number> = { high: 3, medium: 2, low: 1 };
const DEMOTE: Record<PriorityBand, PriorityBand> = { high: 'medium', medium: 'low', low: 'low' };

/** most articles only carry a single matched tag, so requiring 2+ shared tags never fires in
 *  practice -- tag overlap alone is too coarse. Title-word Jaccard similarity is combined with
 *  it instead: calibrated against a real day's data, genuine cross-outlet duplicates ("한양대병원,
 *  16개 전문센터 갖춘 '한양대암병원' 개원" vs "16개 전문 센터와 통합진료체계 갖춘 '한양대암병원' 개원")
 *  scored 0.20-0.67, while distinct same-tag articles scored 0.00-0.07 -- a clear gap. */
const TITLE_SIMILARITY_THRESHOLD = 0.15;

function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1),
  );
}

function titleJaccard(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter((t) => b.has(t)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

/** two same-day articles are treated as covering the same underlying story if they share at
 *  least one matched tag AND their titles are similar enough -- a cheap proxy for cross-outlet
 *  duplicate coverage that avoids the false-merge risk of real clustering. This only ever
 *  adjusts priority; it never hides, merges, or removes an article. */
function shareStory(a: ArticleRow & { tokens: Set<string> }, b: ArticleRow & { tokens: Set<string> }): boolean {
  if (a.tags.length === 0 || b.tags.length === 0) return false;
  const sharesTag = a.tags.some((t) => b.tags.includes(t));
  if (!sharesTag) return false;
  return titleJaccard(a.tokens, b.tokens) >= TITLE_SIMILARITY_THRESHOLD;
}

function findGroups(articles: ArticleRow[]): ArticleRow[][] {
  const withTokens = articles.map((a) => ({ ...a, tokens: titleTokens(a.title) }));

  const parent = new Map<number, number>();
  withTokens.forEach((a) => parent.set(a.id, a.id));
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
  for (let i = 0; i < withTokens.length; i++) {
    for (let j = i + 1; j < withTokens.length; j++) {
      if (shareStory(withTokens[i], withTokens[j])) union(withTokens[i].id, withTokens[j].id);
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
  grouped: number;
  groups: number;
}

/** for each cluster of same-day articles covering the same story (2+ shared tags), keeps the
 *  single strongest member's priority as-is and demotes every other member one tier
 *  (high->medium, medium->low) so cross-outlet duplicate coverage of one event doesn't
 *  inflate how many "high" items a user sees. Runs after AI enrichment (or the rule-based
 *  fallback) has already set each article's priority -- this is a pass over the result, not
 *  a replacement for it.
 *
 *  Every non-survivor member is also marked via setDuplicateOf, regardless of whether its
 *  priority actually changed -- grouping (excluding it from listings, showing it as a "같은
 *  소식" reference under the survivor) is independent of the demotion, e.g. a duplicate that
 *  was already 'low' still needs to be grouped even though DEMOTE['low'] is a no-op. */
export async function demoteDuplicatePriorities(articles: ArticleRow[]): Promise<DemotionResult> {
  const groups = findGroups(articles);
  let demoted = 0;
  let grouped = 0;
  for (const group of groups) {
    const [survivor, ...rest] = [...group].sort((a, b) => {
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
      await setDuplicateOf(article.id, survivor.id);
      grouped++;
    }
  }
  return { demoted, grouped, groups: groups.length };
}
