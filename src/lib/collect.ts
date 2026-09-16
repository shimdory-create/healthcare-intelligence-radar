import { SOURCES, type SourceConfig } from './sources.config';
import { fetchSourceArticles } from './rss';
import { normalizeTitle } from './normalize';
import { matchTags } from './tagging';
import { scoreToPriority } from './priority';
import { articleUrlExists, findSameDayTitleDuplicate, insertArticle } from './db';

export interface CollectionSummary {
  sourceId: string;
  fetched: number;
  inserted: number;
  skippedDuplicate: number;
  skippedNoTagMatch: number;
  /** fetchSourceArticles already resolves relative links and rejects unresolved Google News
   *  redirects, so this should normally stay 0 -- it's a last-resort net, not the primary
   *  guard. A nonzero count here for a source that used to read 0 is exactly the shape of bug
   *  this field exists to catch: khidi's relative-URL feed silently lost 100% of its articles
   *  to this same guard for two weeks (fixed 2026-09-16) with no counter distinguishing it
   *  from normal dedup/tag skips -- see [[project-article-extraction-reliability]]. */
  skippedInvalidUrl: number;
  error: string | null;
}

export async function collectSource(source: SourceConfig): Promise<CollectionSummary> {
  const summary: CollectionSummary = {
    sourceId: source.id,
    fetched: 0,
    inserted: 0,
    skippedDuplicate: 0,
    skippedNoTagMatch: 0,
    skippedInvalidUrl: 0,
    error: null,
  };

  try {
    const articles = await fetchSourceArticles(source);
    summary.fetched = articles.length;

    for (const a of articles) {
      if (!/^https?:\/\//i.test(a.url)) {
        summary.skippedInvalidUrl++;
        continue;
      }

      if (await articleUrlExists(a.url)) {
        summary.skippedDuplicate++;
        continue;
      }

      const titleNorm = normalizeTitle(a.title);
      const publishedAt = a.publishedAt ?? new Date();
      if (await findSameDayTitleDuplicate(titleNorm, publishedAt)) {
        summary.skippedDuplicate++;
        continue;
      }

      const { tags, score } = matchTags(`${a.title} ${a.snippet}`);
      // tier 1 (government) is always kept regardless of tag match. Tier 3 (healthcare
      // specialty press) is inherently on-topic, so any tag match -- weak included -- is
      // enough. Tier 2 (general economy press) covers everything, so a weak-only match
      // (e.g. "보험"/"플랫폼" mentioned in an unrelated finance/tech story) isn't a strong
      // enough signal -- it needs at least one specific/strong tag (score > 0).
      const noTagMatch = source.tier === 3 ? tags.length === 0 : source.tier === 2 ? score === 0 : false;
      if (noTagMatch) {
        summary.skippedNoTagMatch++;
        continue;
      }

      const inserted = await insertArticle({
        sourceId: source.id,
        title: a.title,
        url: a.url,
        titleNorm,
        publishedAt,
        snippet: a.snippet,
        tags,
        score,
        priority: scoreToPriority(score),
      });
      if (inserted) summary.inserted++;
    }
  } catch (err) {
    summary.error = err instanceof Error ? err.message : String(err);
  }

  return summary;
}

const SOURCE_BUDGET_MS = 120_000;

function collectSourceWithBudget(source: SourceConfig): Promise<CollectionSummary> {
  let timer: ReturnType<typeof setTimeout>;
  const budget = new Promise<CollectionSummary>((resolve) => {
    timer = setTimeout(
      () =>
        resolve({
          sourceId: source.id,
          fetched: 0,
          inserted: 0,
          skippedDuplicate: 0,
          skippedNoTagMatch: 0,
          skippedInvalidUrl: 0,
          error: 'source budget exceeded',
        }),
      SOURCE_BUDGET_MS,
    );
  });
  return Promise.race([collectSource(source), budget]).finally(() => clearTimeout(timer));
}

export async function collectAll(): Promise<CollectionSummary[]> {
  return Promise.all(SOURCES.map((source) => collectSourceWithBudget(source)));
}
