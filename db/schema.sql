create table if not exists sources (
  id text primary key,
  name text not null,
  -- nullable: an html_scrape source (see fetch_method) has no rss feed, only a scrape.url
  -- defined in src/lib/sources.config.ts (not persisted here)
  rss_url text,
  tier smallint not null,
  reliability text not null default 'stable',
  fetch_method text not null default 'rss'
);

-- idempotent for the already-deployed table (create table above is skipped once it exists) --
-- was `not null` until the first html_scrape source was added 2026-09-18
alter table sources alter column rss_url drop not null;

create table if not exists articles (
  id serial primary key,
  source_id text not null references sources(id),
  title text not null,
  url text not null unique,
  title_norm text not null,
  published_at timestamptz,
  collected_at timestamptz not null default now(),
  content_snippet text,
  tags text[] not null default '{}',
  score int not null default 0,
  -- initially derived from score at collection time, then overwritten by AI enrichment once
  -- that article is analyzed -- see src/lib/priority.ts and src/lib/aiEnrichment.ts
  priority text not null default 'low',
  -- set by demoteDuplicatePriorities (src/lib/duplicates.ts) when this article is judged to
  -- cover the same story as another, stronger article collected the same day. Non-null rows
  -- are excluded from every user-facing listing/count query; the survivor (this column stays
  -- null on it) shows the others as a "같은 소식" line instead of listing them separately.
  duplicate_of_id int references articles(id)
);

-- idempotent for the already-deployed table (create table above is skipped once it exists)
alter table articles add column if not exists priority text not null default 'low';
alter table articles add column if not exists duplicate_of_id int references articles(id);

create index if not exists idx_articles_title_norm_published on articles (title_norm, published_at);
create index if not exists idx_articles_published_at on articles (published_at desc);
create index if not exists idx_articles_priority on articles (priority);
create index if not exists idx_articles_duplicate_of on articles (duplicate_of_id);
-- supports pruneOldData's daily `delete from articles where collected_at < ...` (db.ts) --
-- without this, that delete is a full-table seq scan every day, getting slower as the table
-- grows toward its ~365-day steady state (found in the 2026-09-24 follow-up audit; confirmed
-- via EXPLAIN ANALYZE on the live table)
create index if not exists idx_articles_collected_at on articles (collected_at);

-- generic key-value store for small pieces of app state (e.g. the Kakao OAuth refresh token)
-- that need to persist across serverless invocations, unlike a static env var
create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- latest collectAll() result per source, overwritten every collection run (see
-- syncSources/recordSourceHealth in src/lib/db.ts) -- surfaces silent per-source breakage
-- (e.g. the FK-anchor gap found live 2026-09-18, or a scraper whose selectors stop matching
-- after a site redesign) on the /sources page instead of only in a cron route's JSON response
-- that nobody is looking at day to day.
create table if not exists source_health (
  source_id text primary key references sources(id),
  last_run_at timestamptz not null,
  fetched int not null,
  inserted int not null,
  skipped_duplicate int not null,
  skipped_no_tag_match int not null,
  skipped_invalid_url int not null,
  error text,
  -- consecutive collectAll() runs ending in an error / a zero-fetch result, reset to 0 the
  -- moment a run succeeds / fetches something again -- a single bad run is normal (a
  -- transient timeout), but a streak means something is actually broken
  consecutive_errors int not null default 0,
  consecutive_zero_fetch int not null default 0
);

-- one row per cron route invocation (both /api/cron/collect and /api/cron/enrich) -- unlike
-- source_health (per source, latest run only), this is an append-only log so /monitoring can
-- show whether AI analysis and the once-daily report/send step are actually succeeding over
-- time, not just collection. See recordPipelineRun in src/lib/db.ts.
create table if not exists pipeline_runs (
  id serial primary key,
  route text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  ai_result text,
  dedupe_result text,
  -- null for an 'enrich' run -- only the once-daily 'collect' route reaches report/send
  report_result text,
  email_result text,
  kakao_result text,
  has_error boolean not null default false
);

create index if not exists idx_pipeline_runs_started_at on pipeline_runs (started_at desc);

-- optional AI enrichment (Gemini free tier). Every collected article is analyzed (or
-- re-analyzed only if its content_hash changed since last time, so an unchanged article
-- never re-spends quota); its priority band here is copied onto articles.priority,
-- superseding the initial keyword-count-derived value.
create table if not exists ai_analysis (
  article_id int primary key references articles(id) on delete cascade,
  content_hash text not null,
  model text not null,
  priority text not null,
  summary text not null,
  implications text[] not null default '{}',
  watch_point text not null default '',
  analyzed_at timestamptz not null default now()
);

-- MUST stay in sync with src/lib/sources.config.ts's SOURCES array (id/tier at minimum) --
-- articles.source_id has a foreign key against this table's id column, so a source added to
-- sources.config.ts but not synced here has every one of its articles silently fail to insert
-- (caught by collectSource's try/catch as a per-source summary.error, easy to miss without the
-- source-health monitoring page -- see /sources). Found live 2026-09-18: 15 sources added
-- across several commits were never synced here, losing every article they would have
-- contributed for days before being caught. This file is a reference/reseed script, not an
-- auto-applied migration -- when adding a source, also run its `insert ... on conflict`
-- against the live DB directly (see project memory's rollback/verification workflow).
insert into sources (id, name, rss_url, tier, reliability, fetch_method) values
  ('fsc', '금융위원회', 'http://www.fsc.go.kr/about/fsc_bbs_rss/?fid=0111', 1, 'stable', 'rss'),
  ('mohw', '보건복지부', 'https://www.mohw.go.kr/rss/board.es?mid=a10503000000&bid=0027', 1, 'stable', 'rss'),
  ('mfds', '식품의약품안전처', 'http://www.mfds.go.kr/www/rss/brd.do?brdId=ntc0021', 1, 'stable', 'rss'),
  ('hira', '건강보험심사평가원', 'https://www.hira.or.kr/cms/inform/02/news.xml', 1, 'stable', 'rss'),
  ('khidi', '한국보건산업진흥원', 'https://www.khidi.or.kr/rss?menuId=MENU00100', 1, 'stable', 'rss'),
  ('nhis', '국민건강보험공단', null, 1, 'stable', 'html_scrape'),
  ('yna', '연합뉴스', 'https://www.yna.co.kr/rss/economy.xml', 2, 'stable', 'rss'),
  ('chosun', '조선일보', 'https://www.chosun.com/arc/outboundfeeds/rss/category/economy/?outputType=xml', 2, 'stable', 'rss'),
  ('donga', '동아일보', 'http://rss.donga.com/economy.xml', 2, 'stable', 'rss'),
  ('hani', '한겨레', 'https://www.hani.co.kr/rss/economy', 2, 'stable', 'rss'),
  ('hankyung', '한국경제', 'https://www.hankyung.com/feed/economy', 2, 'stable', 'rss'),
  ('mk', '매일경제', 'https://www.mk.co.kr/rss/30100041/', 2, 'stable', 'rss'),
  ('herald', '헤럴드경제', 'https://biz.heraldcorp.com/rss/google/economy', 2, 'stable', 'rss'),
  ('edaily', '이데일리', 'https://rss.edaily.co.kr/economy_news.xml', 2, 'stable', 'rss'),
  ('sedaily', '서울경제', 'https://www.sedaily.com/rss/economy', 2, 'stable', 'rss'),
  ('joongang', '중앙일보', 'https://news.google.com/rss/search?q=site:joongang.co.kr+when:1d&hl=ko&gl=KR&ceid=KR:ko', 2, 'experimental', 'google_news_rss'),
  ('ajunews', '아주경제', 'https://www.ajunews.com/rss/economy.xml', 2, 'stable', 'rss'),
  ('kmib', '국민일보', 'https://www.kmib.co.kr/rss/data/kmibRssAll.xml', 2, 'stable', 'rss'),
  ('mt', '머니투데이', 'https://rss.mt.co.kr/mt_news.xml', 2, 'stable', 'rss'),
  ('newsis', '뉴시스', 'https://www.newsis.com/RSS/economy.xml', 2, 'stable', 'rss'),
  ('einfomax', '연합인포맥스', 'https://news.einfomax.co.kr/rss/allArticle.xml', 2, 'stable', 'rss'),
  ('sisajournale', '시사저널e', 'https://www.sisajournal-e.com/rss/allArticle.xml', 2, 'stable', 'rss'),
  ('docdocdoc', '청년의사', 'https://www.docdocdoc.co.kr/rss/allArticle.xml', 3, 'stable', 'rss'),
  ('hitnews', '히트뉴스', 'https://www.hitnews.co.kr/rss/allArticle.xml', 3, 'stable', 'rss'),
  ('rapportian', '라포르시안', 'http://www.rapportian.com/rss/allArticle.xml', 3, 'stable', 'rss'),
  ('kormedi', '코메디닷컴', 'https://kormedi.com/feed', 3, 'stable', 'rss'),
  ('bosa', '의학신문', 'http://www.bosa.co.kr/rss/allArticle.xml', 3, 'stable', 'rss'),
  ('monews', '메디칼업저버', 'http://www.monews.co.kr/rss/allArticle.xml', 3, 'stable', 'rss'),
  ('pharmnews', '팜뉴스', 'https://www.pharmnews.com/rss/allArticle.xml', 3, 'stable', 'rss'),
  ('healthchosun', '헬스조선', 'https://health.chosun.com/site/data/rss/rss.xml', 3, 'stable', 'rss'),
  ('medipana', '메디파나뉴스', 'https://www.medipana.com/rss/allArticle.xml', 3, 'stable', 'rss'),
  ('doctorsnews', '의협신문', 'https://www.doctorsnews.co.kr/rss/allArticle.xml', 3, 'stable', 'rss'),
  ('kpanews', '약사공론', 'https://www.kpanews.co.kr/rss/allArticle.xml', 3, 'stable', 'rss'),
  ('insweek', '보험신보', 'https://www.insweek.co.kr/rss/allArticle.xml', 3, 'stable', 'rss'),
  ('kiri', '보험연구원', null, 3, 'stable', 'html_scrape'),
  ('klia', '생명보험협회', null, 3, 'stable', 'html_scrape'),
  ('knia', '손해보험협회', null, 3, 'stable', 'html_scrape'),
  ('dailypharm', '데일리팜', null, 3, 'stable', 'html_scrape')
on conflict (id) do update set
  name = excluded.name,
  rss_url = excluded.rss_url,
  tier = excluded.tier,
  reliability = excluded.reliability,
  fetch_method = excluded.fetch_method;
