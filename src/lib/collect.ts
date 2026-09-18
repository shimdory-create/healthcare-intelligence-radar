import { SOURCES, type SourceConfig } from './sources.config';
import { fetchSourceArticles, type RawArticle } from './rss';
import { fetchScrapedArticles } from './scrape';
import { normalizeTitle } from './normalize';
import { matchTags } from './tagging';
import { scoreToPriority } from './priority';
import { getExistingUrls, getExistingTitleDayKeys, insertArticle } from './db';

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

/** same UTC-day bucketing as db.ts's getExistingTitleDayKeys/old findSameDayTitleDuplicate --
 *  kept in one place so a candidate's key always matches how the DB rows were bucketed. */
function titleDayKey(titleNorm: string, publishedAt: Date): string | null {
  if (Number.isNaN(publishedAt.getTime())) return null;
  const dayStart = Date.UTC(publishedAt.getUTCFullYear(), publishedAt.getUTCMonth(), publishedAt.getUTCDate());
  return `${titleNorm}::${dayStart}`;
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
    const fetched =
      source.fetchMethod === 'html_scrape' ? await fetchScrapedArticles(source) : await fetchSourceArticles(source);
    summary.fetched = fetched.length;

    const candidates: { a: RawArticle; titleNorm: string; publishedAt: Date }[] = [];
    for (const a of fetched) {
      if (!/^https?:\/\//i.test(a.url)) {
        summary.skippedInvalidUrl++;
        continue;
      }
      candidates.push({ a, titleNorm: normalizeTitle(a.title), publishedAt: a.publishedAt ?? new Date() });
    }

    // two round trips total for this whole source's batch, instead of up to two per article --
    // see getExistingUrls/getExistingTitleDayKeys' doc comments for why this matters
    const [existingUrls, existingTitleDayKeys] = await Promise.all([
      getExistingUrls(candidates.map((c) => c.a.url)),
      getExistingTitleDayKeys(candidates.map((c) => c.titleNorm)),
    ]);
    // title+day keys seen earlier in THIS batch -- getExistingTitleDayKeys only knows about
    // rows already committed to the DB, so two same-day same-title items within one source's
    // own fetch (a rare but real correction/republish case) still need catching here
    const seenTitleDayKeys = new Set<string>();

    for (const { a, titleNorm, publishedAt } of candidates) {
      if (existingUrls.has(a.url)) {
        summary.skippedDuplicate++;
        continue;
      }

      const dayKey = titleDayKey(titleNorm, publishedAt);
      if (dayKey && (existingTitleDayKeys.has(dayKey) || seenTitleDayKeys.has(dayKey))) {
        summary.skippedDuplicate++;
        continue;
      }
      if (dayKey) seenTitleDayKeys.add(dayKey);

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
