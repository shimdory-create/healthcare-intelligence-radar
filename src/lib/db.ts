import postgres from 'postgres';

export const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require', prepare: false });

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

export async function insertArticle(a: ArticleInsert): Promise<void> {
  await sql`
    insert into articles (source_id, title, url, title_norm, published_at, content_snippet, tags, score)
    values (${a.sourceId}, ${a.title}, ${a.url}, ${a.titleNorm}, ${a.publishedAt}, ${a.snippet}, ${a.tags}, ${a.score})
    on conflict (url) do nothing
  `;
}

export interface ArticleRow {
  id: number;
  sourceId: string;
  title: string;
  url: string;
  publishedAt: Date | null;
  collectedAt: Date;
  snippet: string | null;
  tags: string[];
  score: number;
}

export interface ArticleFilters {
  tier?: 1 | 2 | 3;
  tag?: string;
  sourceId?: string;
  search?: string;
  limit?: number;
}

function rowToArticle(r: any): ArticleRow {
  return {
    id: r.id,
    sourceId: r.source_id,
    title: r.title,
    url: r.url,
    publishedAt: r.published_at,
    collectedAt: r.collected_at,
    snippet: r.content_snippet,
    tags: r.tags,
    score: r.score,
  };
}

export async function getRecentArticles(filters: ArticleFilters = {}): Promise<ArticleRow[]> {
  const limit = filters.limit ?? 50;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- postgres.js fragment types don't compose cleanly through an array
  const conditions: any[] = [];
  if (filters.tier) conditions.push(sql`s.tier = ${filters.tier}`);
  if (filters.tag) conditions.push(sql`${filters.tag} = any(a.tags)`);
  if (filters.sourceId) conditions.push(sql`a.source_id = ${filters.sourceId}`);
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(sql`(a.title ilike ${pattern} or a.content_snippet ilike ${pattern})`);
  }

  let where: any = sql``;
  if (conditions.length > 0) {
    where = sql`where ${conditions[0]}`;
    for (let i = 1; i < conditions.length; i++) {
      where = sql`${where} and ${conditions[i]}`;
    }
  }

  const rows = await sql`
    select a.id, a.source_id, a.title, a.url, a.published_at, a.collected_at, a.content_snippet, a.tags, a.score
    from articles a
    join sources s on s.id = a.source_id
    ${where}
    order by a.published_at desc nulls last
    limit ${limit}
  `;
  return rows.map(rowToArticle);
}

export async function getArticleById(id: number): Promise<ArticleRow | null> {
  const rows = await sql`
    select id, source_id, title, url, published_at, collected_at, content_snippet, tags, score
    from articles where id = ${id}
  `;
  return rows.length > 0 ? rowToArticle(rows[0]) : null;
}
