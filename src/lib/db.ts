import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

export const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false });

export interface ArticleInsert {
  sourceId: string;
  title: string;
  url: string;
  titleNorm: string;
  publishedAt: Date | null;
  snippet: string;
  tags: string[];
  score: number;
}

export async function articleUrlExists(url: string): Promise<boolean> {
  const rows = await sql`select 1 from articles where url = ${url} limit 1`;
  return rows.length > 0;
}

export async function findSameDayTitleDuplicate(titleNorm: string, publishedAt: Date): Promise<boolean> {
  if (Number.isNaN(publishedAt.getTime())) return false;
  const dayStart = new Date(Date.UTC(publishedAt.getUTCFullYear(), publishedAt.getUTCMonth(), publishedAt.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const rows = await sql`
    select 1 from articles
    where title_norm = ${titleNorm}
      and published_at >= ${dayStart}
      and published_at < ${dayEnd}
    limit 1
  `;
  return rows.length > 0;
}

export async function insertArticle(a: ArticleInsert): Promise<boolean> {
  const rows = await sql`
    insert into articles (source_id, title, url, title_norm, published_at, content_snippet, tags, score)
    values (${a.sourceId}, ${a.title}, ${a.url}, ${a.titleNorm}, ${a.publishedAt}, ${a.snippet}, ${a.tags}, ${a.score})
    on conflict (url) do nothing
    returning id
  `;
  return rows.length > 0;
}

export interface ArticleRow {
  id: number;
  sourceId: string;
  tier: 1 | 2 | 3;
  title: string;
  url: string;
  publishedAt: Date | null;
  collectedAt: Date;
  snippet: string | null;
  tags: string[];
  score: number;
}

export type PriorityFilter = 'high' | 'medium' | 'low' | 'all';

export interface ArticleFilters {
  tier?: 1 | 2 | 3;
  priority?: PriorityFilter;
  tag?: string;
  sourceId?: string;
  search?: string;
  /** a KST calendar date as 'YYYY-MM-DD', restricting to that day's collection batch (collected_at) */
  collectedDate?: string;
  limit?: number;
  offset?: number;
}

/** [start, end) UTC instants bracketing the given KST calendar date */
function kstDayRange(dateStr: string): [Date, Date] {
  const start = new Date(`${dateStr}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return [start, end];
}

function rowToArticle(r: any): ArticleRow {
  return {
    id: r.id,
    sourceId: r.source_id,
    tier: r.tier,
    title: r.title,
    url: r.url,
    publishedAt: r.published_at,
    collectedAt: r.collected_at,
    snippet: r.content_snippet,
    tags: r.tags,
    score: r.score,
  };
}

export interface ArticlePage {
  articles: ArticleRow[];
  hasNextPage: boolean;
}

export async function getRecentArticles(filters: ArticleFilters = {}): Promise<ArticlePage> {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  // postgres.js fragment types don't compose cleanly through an array, so `any` is used here deliberately
  const conditions: any[] = [];
  if (filters.tier) conditions.push(sql`s.tier = ${filters.tier}`);
  // no priority filter -> show every score band; sorting already puts higher-priority rows first
  if (filters.priority === 'high') conditions.push(sql`a.score >= 3`);
  else if (filters.priority === 'medium') conditions.push(sql`a.score between 1 and 2`);
  else if (filters.priority === 'low') conditions.push(sql`a.score = 0`);
  if (filters.tag) conditions.push(sql`${filters.tag} = any(a.tags)`);
  if (filters.sourceId) conditions.push(sql`a.source_id = ${filters.sourceId}`);
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(sql`(a.title ilike ${pattern} or a.content_snippet ilike ${pattern})`);
  }
  if (filters.collectedDate) {
    const [dayStart, dayEnd] = kstDayRange(filters.collectedDate);
    conditions.push(sql`a.collected_at >= ${dayStart} and a.collected_at < ${dayEnd}`);
  }

  let where: any = sql``;
  if (conditions.length > 0) {
    where = sql`where ${conditions[0]}`;
    for (let i = 1; i < conditions.length; i++) {
      where = sql`${where} and ${conditions[i]}`;
    }
  }

  // fetch one extra row to detect whether a next page exists, without a separate count query
  const rows = await sql`
    select a.id, a.source_id, s.tier, a.title, a.url, a.published_at, a.collected_at, a.content_snippet, a.tags, a.score
    from articles a
    join sources s on s.id = a.source_id
    ${where}
    order by a.score desc, a.published_at desc nulls last
    limit ${limit + 1}
    offset ${offset}
  `;
  const hasNextPage = rows.length > limit;
  return { articles: rows.slice(0, limit).map(rowToArticle), hasNextPage };
}

/** the most recent KST calendar date ('YYYY-MM-DD') that has at least one collected article, or null if empty */
export async function getLatestCollectionDate(): Promise<string | null> {
  const rows = await sql`select max((collected_at at time zone 'Asia/Seoul')::date) as d from articles`;
  const d: Date | null = rows[0]?.d ?? null;
  return d ? d.toISOString().slice(0, 10) : null;
}

/** the exact timestamp of the most recent collection run, or null if nothing has been collected yet */
export async function getLastCollectedAt(): Promise<Date | null> {
  const rows = await sql`select max(collected_at) as latest from articles`;
  return rows[0]?.latest ?? null;
}

export interface PriorityCounts {
  total: number;
  high: number;
  medium: number;
  low: number;
}

/** counts by priority band for a given collected date (KST), or across all time if omitted --
 *  intentionally ignores tier/source/tag/search so it reads as "today's collection batch", not a filtered subset */
export async function getPriorityCounts(collectedDate?: string): Promise<PriorityCounts> {
  let where: any = sql``;
  if (collectedDate) {
    const [dayStart, dayEnd] = kstDayRange(collectedDate);
    where = sql`where a.collected_at >= ${dayStart} and a.collected_at < ${dayEnd}`;
  }
  const rows = await sql`
    select
      count(*)::int as total,
      count(*) filter (where a.score >= 3)::int as high,
      count(*) filter (where a.score between 1 and 2)::int as medium,
      count(*) filter (where a.score = 0)::int as low
    from articles a
    ${where}
  `;
  return rows[0] as PriorityCounts;
}

export async function getAppSetting(key: string): Promise<string | null> {
  const rows = await sql`select value from app_settings where key = ${key}`;
  return rows[0]?.value ?? null;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  await sql`
    insert into app_settings (key, value, updated_at)
    values (${key}, ${value}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
}

export async function getArticleById(id: number): Promise<ArticleRow | null> {
  const rows = await sql`
    select a.id, a.source_id, s.tier, a.title, a.url, a.published_at, a.collected_at, a.content_snippet, a.tags, a.score
    from articles a
    join sources s on s.id = a.source_id
    where a.id = ${id}
  `;
  return rows.length > 0 ? rowToArticle(rows[0]) : null;
}
