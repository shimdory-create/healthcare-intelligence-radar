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

      await insertArticle({
        sourceId: source.id,
        title: a.title,
        url: a.url,
        titleNorm,
        publishedAt: a.publishedAt,
        snippet: a.snippet,
        tags,
        score,
      });
      summary.inserted++;
    }
  } catch (err) {
    summary.error = err instanceof Error ? err.message : String(err);
  }

  return summary;
}

export async function collectAll(): Promise<CollectionSummary[]> {
  const summaries: CollectionSummary[] = [];
  for (const source of SOURCES) {
    summaries.push(await collectSource(source));
  }
  return summaries;
}
