import { SOURCES, type SourceConfig } from './sources.config';
import { fetchSourceArticles } from './rss';
import { normalizeTitle } from './normalize';
import { matchTags } from './tagging';
import { articleUrlExists, findSameDayTitleDuplicate, insertArticle } from './db';

export interface CollectionSummary {
  sourceId: string;
  fetched: number;
  inserted: number;
  skippedDuplicate: number;
  skippedNoTagMatch: number;
  error: string | null;
}

export async function collectSource(source: SourceConfig): Promise<CollectionSummary> {
  const summary: CollectionSummary = {
    sourceId: source.id,
    fetched: 0,
    inserted: 0,
    skippedDuplicate: 0,
    skippedNoTagMatch: 0,
    error: null,
  };

  try {
    const articles = await fetchSourceArticles(source);
    summary.fetched = articles.length;

    for (const a of articles) {
      if (!/^https?:\/\//i.test(a.url)) {
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
      if (source.tier !== 1 && tags.length === 0) {
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
