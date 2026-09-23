import postgres from 'postgres';
import type { PriorityBand } from './priority';

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
  priority: PriorityBand;
}

/** one round trip for a whole source's fetched batch instead of one per article. Found live
 *  2026-09-18: collectAll()'s 24 sources running one DB round trip per article (this plus
 *  getExistingTitleDayKeys, both formerly sequential per-article calls) queued up against
 *  each other enough to make a single collection pass take 100+ seconds, most of it spent
 *  re-confirming articles already known to be duplicates. */
export async function getExistingUrls(urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  const rows = await sql`select url from articles where url = any(${urls})`;
  return new Set((rows as unknown as { url: string }[]).map((r) => r.url));
}

/** one round trip for every distinct title_norm in a source's fetched batch, instead of one
 *  per article. Returns the set of "titleNorm::dayStartEpochMs" composite keys (UTC day
 *  bucket) that already exist in the DB -- callers build the same key for each candidate
 *  article to check membership, and should also track keys seen earlier in their own batch
 *  (this function only knows about rows already committed to the DB). */
export async function getExistingTitleDayKeys(titleNorms: string[]): Promise<Set<string>> {
  const distinct = [...new Set(titleNorms)];
  if (distinct.length === 0) return new Set();
  const rows = await sql`
    select title_norm, published_at from articles
    where title_norm = any(${distinct}) and published_at is not null
  `;
  const keys = new Set<string>();
  for (const r of rows as unknown as { title_norm: string; published_at: Date }[]) {
    const dayStart = Date.UTC(r.published_at.getUTCFullYear(), r.published_at.getUTCMonth(), r.published_at.getUTCDate());
    keys.add(`${r.title_norm}::${dayStart}`);
  }
  return keys;
}

export interface SourceSyncRow {
  id: string;
  name: string;
  tier: number;
  reliability: string;
  fetchMethod: string;
}

/** upserts every row of sources.config.ts's SOURCES into the `sources` table in one round
 *  trip -- articles.source_id has a foreign key against this table, so a source present in
 *  the config but missing here has every one of its articles silently fail to insert (caught
 *  per-source by collectSource's try/catch, easy to miss without the /sources monitoring
 *  page). Found live 2026-09-18: 15 sources added across several commits were never synced
 *  here manually, losing days of their articles before being caught -- called at the top of
 *  collectAll() now so this can't recur. */
export async function syncSources(sources: SourceSyncRow[]): Promise<void> {
  if (sources.length === 0) return;
  const rows = sources.map((s) => ({
    id: s.id,
    name: s.name,
    tier: s.tier,
    reliability: s.reliability,
    fetch_method: s.fetchMethod,
  }));
  await sql`
    insert into sources ${sql(rows, 'id', 'name', 'tier', 'reliability', 'fetch_method')}
    on conflict (id) do update set
      name = excluded.name,
      tier = excluded.tier,
      reliability = excluded.reliability,
      fetch_method = excluded.fetch_method
  `;
}

export interface SourceHealthUpdate {
  sourceId: string;
  fetched: number;
  inserted: number;
  skippedDuplicate: number;
  skippedNoTagMatch: number;
  skippedInvalidUrl: number;
  error: string | null;
}

/** overwrites each source's row in source_health with its latest collectAll() result, in one
 *  round trip -- consecutive_errors/consecutive_zero_fetch increment on the DB side (relative
 *  to the row's PRIOR value) so a transient one-off failure doesn't look the same as a
 *  multi-day streak on the /sources page. See source_health's schema.sql doc comment. */
export async function recordSourceHealth(summaries: SourceHealthUpdate[]): Promise<void> {
  if (summaries.length === 0) return;
  const now = new Date();
  const rows = summaries.map((s) => ({
    source_id: s.sourceId,
    last_run_at: now,
    fetched: s.fetched,
    inserted: s.inserted,
    skipped_duplicate: s.skippedDuplicate,
    skipped_no_tag_match: s.skippedNoTagMatch,
    skipped_invalid_url: s.skippedInvalidUrl,
    error: s.error,
    consecutive_errors: s.error ? 1 : 0,
    consecutive_zero_fetch: s.fetched === 0 ? 1 : 0,
  }));
  await sql`
    insert into source_health ${sql(
      rows,
      'source_id',
      'last_run_at',
      'fetched',
      'inserted',
      'skipped_duplicate',
      'skipped_no_tag_match',
      'skipped_invalid_url',
      'error',
      'consecutive_errors',
      'consecutive_zero_fetch',
    )}
    on conflict (source_id) do update set
      last_run_at = excluded.last_run_at,
      fetched = excluded.fetched,
      inserted = excluded.inserted,
      skipped_duplicate = excluded.skipped_duplicate,
      skipped_no_tag_match = excluded.skipped_no_tag_match,
      skipped_invalid_url = excluded.skipped_invalid_url,
      error = excluded.error,
      consecutive_errors = case when excluded.error is not null then source_health.consecutive_errors + 1 else 0 end,
      consecutive_zero_fetch = case when excluded.fetched = 0 then source_health.consecutive_zero_fetch + 1 else 0 end
  `;
}

export interface SourceHealthRow {
  sourceId: string;
  lastRunAt: Date;
  fetched: number;
  inserted: number;
  skippedDuplicate: number;
  skippedNoTagMatch: number;
  skippedInvalidUrl: number;
  error: string | null;
  consecutiveErrors: number;
  consecutiveZeroFetch: number;
}

/** every source's latest health row, most-recently-run first -- a source that has never
 *  completed a collectAll() run (e.g. added to sources.config.ts but not yet deployed) simply
 *  has no row here, which the /sources page renders as its own "no data yet" state. */
export async function getSourceHealth(): Promise<SourceHealthRow[]> {
  const rows = await sql`
    select source_id, last_run_at, fetched, inserted, skipped_duplicate, skipped_no_tag_match,
           skipped_invalid_url, error, consecutive_errors, consecutive_zero_fetch
    from source_health
    order by last_run_at desc
  `;
  return (
    rows as unknown as {
      source_id: string;
      last_run_at: Date;
      fetched: number;
      inserted: number;
      skipped_duplicate: number;
      skipped_no_tag_match: number;
      skipped_invalid_url: number;
      error: string | null;
      consecutive_errors: number;
      consecutive_zero_fetch: number;
    }[]
  ).map((r) => ({
    sourceId: r.source_id,
    lastRunAt: r.last_run_at,
    fetched: r.fetched,
    inserted: r.inserted,
    skippedDuplicate: r.skipped_duplicate,
    skippedNoTagMatch: r.skipped_no_tag_match,
    skippedInvalidUrl: r.skipped_invalid_url,
    error: r.error,
    consecutiveErrors: r.consecutive_errors,
    consecutiveZeroFetch: r.consecutive_zero_fetch,
  }));
}

export async function insertArticle(a: ArticleInsert): Promise<boolean> {
  const rows = await sql`
    insert into articles (source_id, title, url, title_norm, published_at, content_snippet, tags, score, priority)
    values (${a.sourceId}, ${a.title}, ${a.url}, ${a.titleNorm}, ${a.publishedAt}, ${a.snippet}, ${a.tags}, ${a.score}, ${a.priority})
    on conflict (url) do nothing
    returning id
  `;
  return rows.length > 0;
}

/** overwrites an article's priority band -- used by AI enrichment once that article has been
 *  analyzed, superseding the keyword-count-derived value it was inserted with */
export async function updateArticlePriority(articleId: number, priority: PriorityBand): Promise<void> {
  await sql`update articles set priority = ${priority} where id = ${articleId}`;
}

/** marks `articleId` as covering the same story as `survivorId` -- excludes it from every
 *  user-facing listing/count query (see buildConditions) in favor of showing it as a "같은
 *  소식" line under the survivor. Used by demoteDuplicatePriorities. */
export async function setDuplicateOf(articleId: number, survivorId: number): Promise<void> {
  await sql`update articles set duplicate_of_id = ${survivorId} where id = ${articleId}`;
}

export interface DuplicateRef {
  id: number;
  title: string;
  url: string;
  sourceId: string;
}

/** for each of `survivorIds`, the other same-story articles grouped under it (see
 *  setDuplicateOf) -- empty for a survivor with no duplicates. */
export async function getDuplicatesOf(survivorIds: number[]): Promise<Map<number, DuplicateRef[]>> {
  const result = new Map<number, DuplicateRef[]>();
  if (survivorIds.length === 0) return result;
  const rows = await sql`
    select id, title, url, source_id, duplicate_of_id
    from articles
    where duplicate_of_id = any(${survivorIds})
    order by published_at asc nulls last
  `;
  for (const r of rows as any[]) {
    const list = result.get(r.duplicate_of_id) ?? [];
    list.push({ id: r.id, title: r.title, url: r.url, sourceId: r.source_id });
    result.set(r.duplicate_of_id, list);
  }
  return result;
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
  priority: PriorityBand;
}

export type PriorityFilter = 'high' | 'medium' | 'low' | 'all';

export interface ArticleFilters {
  tier?: 1 | 2 | 3;
  priority?: PriorityFilter;
  tag?: string;
  sourceId?: string;
  search?: string;
  /** a KST calendar date ('YYYY-MM-DD') restricting to that day's collection batch
   *  (collected_at), or an array of dates to match any of them -- the daily digest can now
   *  span several collected dates in one send (see reportSchedule.ts's datesSince), since
   *  collection moved from once daily to several times during business hours. */
  collectedDate?: string | string[];
  limit?: number;
  offset?: number;
}

/** [start, end) UTC instants bracketing the given KST calendar date */
function kstDayRange(dateStr: string): [Date, Date] {
  const start = new Date(`${dateStr}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return [start, end];
}

/** the collected_at condition for either a single KST date (a plain range check) or an array
 *  of dates (an ANY match against the KST calendar date) -- shared by buildConditions and
 *  getPriorityCounts so both filter identically regardless of which shape is passed. */
function collectedDateCondition(collectedDate: string | string[]): any {
  if (Array.isArray(collectedDate)) {
    return sql`(a.collected_at at time zone 'Asia/Seoul')::date = any(${collectedDate}::date[])`;
  }
  const [dayStart, dayEnd] = kstDayRange(collectedDate);
  return sql`a.collected_at >= ${dayStart} and a.collected_at < ${dayEnd}`;
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
    priority: r.priority,
  };
}

export interface ArticlePage {
  articles: ArticleRow[];
  hasNextPage: boolean;
}

type FacetField = 'tier' | 'priority' | 'tag' | 'sourceId' | 'search' | 'collectedDate';

// postgres.js fragment types don't compose cleanly through an array, so `any` is used here deliberately.
// `exclude` omits one facet's own condition -- used to compute "what values remain available"
// for that facet's dropdown given every OTHER active filter (standard faceted-search semantics).
function buildConditions(filters: ArticleFilters, exclude?: FacetField): any[] {
  // a duplicate-demoted article (see demoteDuplicatePriorities) is never listed on its own --
  // it only shows up as a "같은 소식" reference under its survivor
  const conditions: any[] = [sql`a.duplicate_of_id is null`];
  if (exclude !== 'tier' && filters.tier) conditions.push(sql`s.tier = ${filters.tier}`);
  if (exclude !== 'priority' && filters.priority && filters.priority !== 'all') {
    conditions.push(sql`a.priority = ${filters.priority}`);
  }
  if (exclude !== 'tag' && filters.tag) conditions.push(sql`${filters.tag} = any(a.tags)`);
  if (exclude !== 'sourceId' && filters.sourceId) conditions.push(sql`a.source_id = ${filters.sourceId}`);
  if (exclude !== 'search' && filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(sql`(a.title ilike ${pattern} or a.content_snippet ilike ${pattern})`);
  }
  if (exclude !== 'collectedDate' && filters.collectedDate && filters.collectedDate.length > 0) {
    conditions.push(collectedDateCondition(filters.collectedDate));
  }
  return conditions;
}

function buildWhere(conditions: any[]): any {
  if (conditions.length === 0) return sql``;
  let where = sql`where ${conditions[0]}`;
  for (let i = 1; i < conditions.length; i++) {
    where = sql`${where} and ${conditions[i]}`;
  }
  return where;
}

export async function getRecentArticles(filters: ArticleFilters = {}): Promise<ArticlePage> {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const where = buildWhere(buildConditions(filters));

  // fetch one extra row to detect whether a next page exists, without a separate count query
  const rows = await sql`
    select a.id, a.source_id, s.tier, a.title, a.url, a.published_at, a.collected_at, a.content_snippet, a.tags, a.score, a.priority
    from articles a
    join sources s on s.id = a.source_id
    ${where}
    order by (case a.priority when 'high' then 3 when 'medium' then 2 else 1 end) desc, a.published_at desc nulls last
    limit ${limit + 1}
    offset ${offset}
  `;
  const hasNextPage = rows.length > limit;
  return { articles: rows.slice(0, limit).map(rowToArticle), hasNextPage };
}

export interface CandidateRow {
  id: number;
  title: string;
  url: string;
  tags: string[];
  priority: PriorityBand;
  /** count of DISTINCT outlets covering the story (the survivor's own source plus every
   *  distinct source among articles grouped as its duplicate) -- an outlet posting the same
   *  story more than once (a follow-up, an update) only counts once. Matches
   *  outletSourceIds.length. */
  outletCount: number;
  /** distinct source ids of every outlet covering the story. */
  outletSourceIds: string[];
}

// articles tagged with either of these always become report candidates regardless of
// priority/outlet count (see getReportCandidates) -- user request 2026-09-18, so coverage of
// these two hospitals is never silently dropped by the normal high/multi-outlet gate. When
// neither is otherwise high-priority nor multi-outlet, Gemini's own is_reference judgment
// (buildDeepPrompt) typically renders it with a "(참고)" prefix, matching the "참고 수준으로
// 꼭 담을 것" ask.
const ALWAYS_INCLUDE_TAGS = ['삼성서울병원', '강북삼성병원'];

// one item renders to roughly half a page in the docx (user-observed calibration 2026-09-23:
// "스퀘어 하나가 반페이지... 스퀘어가 8개면 4장"), so 8 is the item count that targets a
// 4-page minimum. Below this, a sparse-high day's report reads as noticeably thin.
const MIN_REPORT_ITEMS = 8;

function mapCandidateRow(r: any): CandidateRow {
  return {
    id: r.id,
    title: r.title,
    url: r.url,
    tags: r.tags,
    priority: r.priority,
    outletCount: r.outlet_count,
    outletSourceIds: r.outlet_source_ids,
  };
}

/** candidates for the deep-analysis report pass: every 'high' survivor, plus every
 *  survivor (regardless of its own priority) whose duplicate group spans 3+ distinct outlets
 *  (its own source plus 2 or more other distinct sources among its grouped duplicates -- the
 *  same outlet posting a follow-up to its own story doesn't count as a second outlet), plus
 *  every survivor tagged with one of ALWAYS_INCLUDE_TAGS regardless of priority/outlet count.
 *  `collectedDates` lets a rollup day's report cover more than one calendar date in one call
 *  (see reportSchedule.ts).
 *
 *  If that primary set has fewer than MIN_REPORT_ITEMS candidates (a sparse-high day), backfills
 *  with additional 'medium'-priority survivors -- ranked by outlet count then by the rule-based
 *  tag-match score (`articles.score`, set at collection time and never overwritten by AI
 *  enrichment, see updateArticlePriority's doc comment) -- up to the target count. No new AI
 *  call: user explicitly chose this zero-cost ranking over an extra Gemini pass (2026-09-23) --
 *  the backfilled candidates still go through the same is_relevant/is_reference deep-analysis
 *  gates as everything else, so this only widens the candidate pool, not the quality bar. */
export async function getReportCandidates(collectedDates: string[]): Promise<CandidateRow[]> {
  const primaryRows = await sql`
    select a.id, a.title, a.url, a.tags, a.priority,
      coalesce(array_length(o.outlet_source_ids, 1), 1) as outlet_count,
      coalesce(o.outlet_source_ids, array[a.source_id]) as outlet_source_ids
    from articles a
    left join lateral (
      select array_agg(distinct x.source_id) as outlet_source_ids
      from (
        select a.source_id
        union all
        select b.source_id from articles b where b.duplicate_of_id = a.id
      ) x
    ) o on true
    where (a.collected_at at time zone 'Asia/Seoul')::date = any(${collectedDates}::date[])
      and a.duplicate_of_id is null
      and (
        a.priority = 'high'
        or coalesce(array_length(o.outlet_source_ids, 1), 1) >= 3
        or a.tags && ${ALWAYS_INCLUDE_TAGS}
      )
    order by a.id
  `;

  if (primaryRows.length >= MIN_REPORT_ITEMS) {
    return primaryRows.map(mapCandidateRow);
  }

  const excludeIds = primaryRows.map((r) => r.id);
  const backfillRows = await sql`
    select a.id, a.title, a.url, a.tags, a.priority,
      coalesce(array_length(o.outlet_source_ids, 1), 1) as outlet_count,
      coalesce(o.outlet_source_ids, array[a.source_id]) as outlet_source_ids
    from articles a
    left join lateral (
      select array_agg(distinct x.source_id) as outlet_source_ids
      from (
        select a.source_id
        union all
        select b.source_id from articles b where b.duplicate_of_id = a.id
      ) x
    ) o on true
    where (a.collected_at at time zone 'Asia/Seoul')::date = any(${collectedDates}::date[])
      and a.duplicate_of_id is null
      and a.priority = 'medium'
      and not (a.id = any(${excludeIds}::int[]))
    order by coalesce(array_length(o.outlet_source_ids, 1), 1) desc, a.score desc, a.id
    limit ${MIN_REPORT_ITEMS - primaryRows.length}
  `;

  return [...primaryRows, ...backfillRows].map(mapCandidateRow);
}

/** total matching rows for the given filters -- used only to size numbered pagination */
export async function getArticlesTotalCount(filters: ArticleFilters = {}): Promise<number> {
  const where = buildWhere(buildConditions(filters));
  const rows = await sql`
    select count(*)::int as n
    from articles a
    join sources s on s.id = a.source_id
    ${where}
  `;
  return rows[0]?.n ?? 0;
}

export interface AvailableFacets {
  priorities: ('high' | 'medium' | 'low')[];
  tiers: number[];
  sourceIds: string[];
  tags: string[];
}

/** for each facet, which values still have at least one matching row once every OTHER active
 *  filter is applied -- lets the UI hide dropdown options that would return zero results.
 *  Issued as a single UNION ALL query (rather than 4 parallel ones) to keep this cheap on the
 *  connection pool -- a page render already opens several other connections alongside it. */
export async function getAvailableFacets(filters: ArticleFilters): Promise<AvailableFacets> {
  const priorityWhere = buildWhere(buildConditions(filters, 'priority'));
  const tierWhere = buildWhere(buildConditions(filters, 'tier'));
  const sourceWhere = buildWhere(buildConditions(filters, 'sourceId'));
  const tagWhere = buildWhere(buildConditions(filters, 'tag'));

  const rows = await sql`
    select 'priority' as kind, a.priority as value
    from articles a
    join sources s on s.id = a.source_id
    ${priorityWhere}
    union all
    select 'tier', s.tier::text
    from articles a
    join sources s on s.id = a.source_id
    ${tierWhere}
    union all
    select 'source', a.source_id
    from articles a
    join sources s on s.id = a.source_id
    ${sourceWhere}
    union all
    select 'tag', t
    from articles a
    join sources s on s.id = a.source_id
    cross join lateral unnest(a.tags) as t
    ${tagWhere}
  `;

  const facets: AvailableFacets = { priorities: [], tiers: [], sourceIds: [], tags: [] };
  for (const r of rows as any[]) {
    if (r.kind === 'priority' && !facets.priorities.includes(r.value)) facets.priorities.push(r.value);
    else if (r.kind === 'tier' && !facets.tiers.includes(Number(r.value))) facets.tiers.push(Number(r.value));
    else if (r.kind === 'source' && !facets.sourceIds.includes(r.value)) facets.sourceIds.push(r.value);
    else if (r.kind === 'tag' && !facets.tags.includes(r.value)) facets.tags.push(r.value);
  }
  return facets;
}

/** the most recent KST calendar date ('YYYY-MM-DD') that has at least one collected article, or null if empty */
export async function getLatestCollectionDate(): Promise<string | null> {
  const rows = await sql`select max((collected_at at time zone 'Asia/Seoul')::date) as d from articles`;
  const d: Date | null = rows[0]?.d ?? null;
  return d ? d.toISOString().slice(0, 10) : null;
}

/** KST calendar dates ('YYYY-MM-DD') within the given month that have at least one collected article.
 *  Scoped to a single month (not the whole table) so the query stays cheap and bounded no matter
 *  how much history accumulates -- callers fetch one month at a time as the calendar navigates. */
export async function getCollectionDatesInMonth(monthStr: string): Promise<string[]> {
  const [year, month] = monthStr.split('-').map(Number);
  const start = new Date(`${monthStr}-01T00:00:00+09:00`);
  const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  const end = new Date(`${nextMonth}-01T00:00:00+09:00`);
  const rows = await sql`
    select distinct (collected_at at time zone 'Asia/Seoul')::date as d
    from articles
    where collected_at >= ${start} and collected_at < ${end}
  `;
  return rows.map((r: any) => (r.d as Date).toISOString().slice(0, 10));
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
  /** count of articles with an ai_analysis row -- i.e. actually judged by Gemini, not just
   *  carrying the rule-based keyword-score priority. Low most days by design (enrichArticles
   *  skips already-rule-based-'low' articles entirely, see aiEnrichment.ts), but a low count
   *  among medium/high articles usually means the AI enrichment phase hit its time budget or
   *  a batch failure -- check the cron route's `ai` response field for which. */
  aiAnalyzed: number;
}

/** counts by priority band for a given collected date (KST) or set of dates, or across all
 *  time if omitted -- intentionally ignores tier/source/tag/search so it reads as "this
 *  collection batch", not a filtered subset */
export async function getPriorityCounts(collectedDate?: string | string[]): Promise<PriorityCounts> {
  let where: any = sql`where a.duplicate_of_id is null`;
  if (collectedDate && collectedDate.length > 0) {
    where = sql`${where} and ${collectedDateCondition(collectedDate)}`;
  }
  const rows = await sql`
    select
      count(*)::int as total,
      count(*) filter (where a.priority = 'high')::int as high,
      count(*) filter (where a.priority = 'medium')::int as medium,
      count(*) filter (where a.priority = 'low')::int as low,
      count(*) filter (where aa.article_id is not null)::int as ai_analyzed
    from articles a
    left join ai_analysis aa on aa.article_id = a.id
    ${where}
  `;
  const r = rows[0] as { total: number; high: number; medium: number; low: number; ai_analyzed: number };
  return { total: r.total, high: r.high, medium: r.medium, low: r.low, aiAnalyzed: r.ai_analyzed };
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
    select a.id, a.source_id, s.tier, a.title, a.url, a.published_at, a.collected_at, a.content_snippet, a.tags, a.score, a.priority
    from articles a
    join sources s on s.id = a.source_id
    where a.id = ${id}
  `;
  return rows.length > 0 ? rowToArticle(rows[0]) : null;
}

export interface AiAnalysis {
  articleId: number;
  contentHash: string;
  model: string;
  priority: PriorityBand;
  summary: string;
  implications: string[];
  watchPoint: string;
  analyzedAt: Date;
}

function rowToAiAnalysis(r: any): AiAnalysis {
  return {
    articleId: r.article_id,
    contentHash: r.content_hash,
    model: r.model,
    priority: r.priority,
    summary: r.summary,
    implications: r.implications,
    watchPoint: r.watch_point,
    analyzedAt: r.analyzed_at,
  };
}

export async function getAiAnalysis(articleId: number): Promise<AiAnalysis | null> {
  const rows = await sql`select * from ai_analysis where article_id = ${articleId}`;
  return rows.length > 0 ? rowToAiAnalysis(rows[0]) : null;
}

export async function getAiAnalysesForArticles(articleIds: number[]): Promise<AiAnalysis[]> {
  if (articleIds.length === 0) return [];
  const rows = await sql`select * from ai_analysis where article_id = any(${articleIds})`;
  return rows.map(rowToAiAnalysis);
}

export async function saveAiAnalysis(a: Omit<AiAnalysis, 'analyzedAt'>): Promise<void> {
  await sql`
    insert into ai_analysis (article_id, content_hash, model, priority, summary, implications, watch_point, analyzed_at)
    values (${a.articleId}, ${a.contentHash}, ${a.model}, ${a.priority}, ${a.summary}, ${a.implications}, ${a.watchPoint}, now())
    on conflict (article_id) do update set
      content_hash = excluded.content_hash,
      model = excluded.model,
      priority = excluded.priority,
      summary = excluded.summary,
      implications = excluded.implications,
      watch_point = excluded.watch_point,
      analyzed_at = excluded.analyzed_at
  `;
}

export interface PipelineRunRecord {
  /** 'collect' = the once-daily 08:00 KST route (collect + AI + dedupe + report + send).
   *  'enrich' = the several-times-a-day intraday route (collect + AI + dedupe only). */
  route: 'collect' | 'enrich';
  startedAt: Date;
  finishedAt: Date;
  aiResult?: string | null;
  dedupeResult?: string | null;
  /** null for an 'enrich' run -- only 'collect' reaches the report/send phase */
  reportResult?: string | null;
  emailResult?: string | null;
  kakaoResult?: string | null;
}

function looksLikeError(s: string | null | undefined): boolean {
  return typeof s === 'string' && s.startsWith('error');
}

/** appends one row per cron route invocation (not per source -- see source_health for that) so
 *  the /monitoring page can show whether AI analysis and the report/send step are actually
 *  succeeding, not just collection. Failing to record a run must never break the route's real
 *  response, so callers wrap this in .catch(() => {}). */
export async function recordPipelineRun(r: PipelineRunRecord): Promise<void> {
  const hasError = [r.aiResult, r.dedupeResult, r.reportResult, r.emailResult, r.kakaoResult].some(looksLikeError);
  await sql`
    insert into pipeline_runs
      (route, started_at, finished_at, ai_result, dedupe_result, report_result, email_result, kakao_result, has_error)
    values
      (${r.route}, ${r.startedAt}, ${r.finishedAt}, ${r.aiResult ?? null}, ${r.dedupeResult ?? null},
       ${r.reportResult ?? null}, ${r.emailResult ?? null}, ${r.kakaoResult ?? null}, ${hasError})
  `;
}

export interface PipelineRunRow {
  id: number;
  route: string;
  startedAt: Date;
  finishedAt: Date;
  aiResult: string | null;
  dedupeResult: string | null;
  reportResult: string | null;
  emailResult: string | null;
  kakaoResult: string | null;
  hasError: boolean;
}

export async function getRecentPipelineRuns(limit = 20): Promise<PipelineRunRow[]> {
  const rows = await sql`
    select id, route, started_at, finished_at, ai_result, dedupe_result, report_result, email_result, kakao_result, has_error
    from pipeline_runs
    order by started_at desc
    limit ${limit}
  `;
  return (
    rows as unknown as {
      id: number;
      route: string;
      started_at: Date;
      finished_at: Date;
      ai_result: string | null;
      dedupe_result: string | null;
      report_result: string | null;
      email_result: string | null;
      kakao_result: string | null;
      has_error: boolean;
    }[]
  ).map((r) => ({
    id: r.id,
    route: r.route,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    aiResult: r.ai_result,
    dedupeResult: r.dedupe_result,
    reportResult: r.report_result,
    emailResult: r.email_result,
    kakaoResult: r.kakao_result,
    hasError: r.has_error,
  }));
}

/** how long collected data is kept before automatic deletion -- chosen 2026-09-23 so this
 *  Supabase free-tier project (500MB storage cap) never needs manual intervention: growth was
 *  measured at ~0.9MB/day, so a rolling 1-year window stabilizes around ~330MB indefinitely
 *  instead of growing unbounded. Nothing in the app reads articles this old (report candidates
 *  only look back a few days via getReportCandidates' collectedDates, and duplicate-of
 *  clustering is same-day only), so pruning them is safe. */
export const DATA_RETENTION_DAYS = 365;

export interface PruneResult {
  articlesDeleted: number;
  pipelineRunsDeleted: number;
}

/** deletes articles (and their ai_analysis rows, via the FK's `on delete cascade`) and
 *  pipeline_runs older than DATA_RETENTION_DAYS. A survivor and its same-day duplicates always
 *  share the same collected_at day (see duplicates.ts's same-day clustering), so a single
 *  age-based DELETE never orphans a `duplicate_of_id` reference -- both sides of the reference
 *  age out together. Safe to call every day; a no-op once nothing has aged past the window. */
export async function pruneOldData(): Promise<PruneResult> {
  const articlesResult = await sql`
    delete from articles where collected_at < now() - (${DATA_RETENTION_DAYS} || ' days')::interval
  `;
  const pipelineRunsResult = await sql`
    delete from pipeline_runs where started_at < now() - (${DATA_RETENTION_DAYS} || ' days')::interval
  `;
  return { articlesDeleted: articlesResult.count, pipelineRunsDeleted: pipelineRunsResult.count };
}
