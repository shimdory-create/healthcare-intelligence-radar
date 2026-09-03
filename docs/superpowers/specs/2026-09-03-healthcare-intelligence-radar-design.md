# Healthcare Intelligence Radar — Design Spec

Status: Draft for review
Date: 2026-09-03

## 1. Purpose

Personal (single-user, not redistributed) intelligence tool that automatically
collects public press releases and news relevant to the insurance/healthcare
industry, tags them by topic, and surfaces the most relevant items in a
private web dashboard — without any ongoing cost and without calling paid AI
APIs in the initial version.

This is a personal reference tool. It is never distributed inside or outside
any organization; all content stays private to the operator's own account.

## 2. Non-goals (explicitly out of scope for v1)

- AI-generated summaries, implications, or action recommendations (original
  concept's FACT/IMPLICATION/ACTION output) — deferred to a future phase once
  a free/local AI option is wired in.
- Email or push notifications — dashboard-only for v1.
- Competitor-watch, weak-signal/trend detection, cross-article linking to past
  coverage, multi-axis AI scoring — all deferred.
- Multi-user access, sharing, or publishing of any kind.

## 3. Architecture

```
Vercel Cron (once daily)
   → API Route (/api/cron/collect)
       → fetch RSS from all sources (per-source try/catch — one
         failing source never blocks the rest)
       → parse + normalize items
       → dedup (see §6)
       → keyword-tag + score (see §7)
       → apply storage policy (see §7)
       → upsert into Supabase (Postgres)

Next.js dashboard (same Vercel deployment)
   → reads from Supabase via server components
   → Today / by-tag filter / by-source filter / search
```

Single Next.js app handles both the daily collection job (via a Vercel Cron
job hitting an internal API route) and the read-only dashboard. No separate
backend service.

## 4. Data model

```sql
sources (
  id            text primary key,   -- natural-key slug, e.g. 'fsc', 'mohw' (shared with sources.config.ts)
  name          text not null,
  rss_url       text not null,
  tier          smallint not null,   -- 1 = gov, 2 = general/economic press, 3 = healthcare trade press
  reliability   text not null default 'stable',  -- 'stable' | 'experimental'
  fetch_method  text not null default 'rss'       -- 'rss' | 'google_news_rss'
)

articles (
  id              serial primary key,
  source_id       text not null references sources(id),
  title           text not null,
  url             text not null unique,
  title_norm      text not null,                    -- normalized title, used for dedup (see §6)
  published_at    timestamptz,
  collected_at    timestamptz not null default now(),
  content_snippet text,
  tags            text[] not null default '{}',
  score           int not null default 0            -- count of matched tags
)

-- indexes
create index idx_articles_title_norm_published on articles (title_norm, published_at);
create index idx_articles_published_at on articles (published_at desc);
```

Two tables only. No separate `analyses`, `tags`, `article_tags`, or
`internal_topics` tables — those existed in the original enterprise concept
to support AI-driven analysis and cross-referencing, which are out of scope
for v1. `tags` is stored as a plain Postgres array column; this is simple
enough at this scale (YAGNI — normalize into join tables later only if
actually needed).

## 5. Sources (23 total)

### Tier 1 — 공공기관 (5, unconditional storage, `reliability: stable`)

| Name | RSS URL |
|---|---|
| 금융위원회 | `http://www.fsc.go.kr/about/fsc_bbs_rss/?fid=0111` |
| 보건복지부 | `https://www.mohw.go.kr/rss/board.es?mid=a10503000000&bid=0027` |
| 식품의약품안전처 | `http://www.mfds.go.kr/www/rss/brd.do?brdId=ntc0021` |
| 건강보험심사평가원 | `https://www.hira.or.kr/cms/inform/02/news.xml` |
| 한국보건산업진흥원 | `https://www.khidi.or.kr/rss?menuId=MENU00100` |

Note (보건복지부): robots.txt disallows generic HTML scraping of
`/board.es` paths — collection MUST go through the RSS URL only, never
fall back to scraping the HTML list page.

### Tier 2 — 종합/경제지 (10, storage requires ≥1 tag match, `reliability: stable` unless noted)

| Name | RSS URL | Note |
|---|---|---|
| 연합뉴스 | `https://www.yna.co.kr/rss/economy.xml` | |
| 조선일보 | `https://www.chosun.com/arc/outboundfeeds/rss/category/economy/?outputType=xml` | |
| 동아일보 | `http://rss.donga.com/economy.xml` | |
| 한겨레 | `https://www.hani.co.kr/rss/economy` | no trailing slash |
| 한국경제 | `https://www.hankyung.com/feed/economy` | |
| 매일경제 | `https://www.mk.co.kr/rss/30100041/` | Cloudflare-protected: fetch requires a normal browser `User-Agent` header |
| 헤럴드경제 | `https://biz.heraldcorp.com/rss/google/economy` | |
| 이데일리 | `https://rss.edaily.co.kr/economy_news.xml` | |
| 서울경제 | `https://www.sedaily.com/rss/economy` | site terms restrict RSS to personal/non-commercial use — matches this project's usage |
| 중앙일보 | `https://news.google.com/rss/search?q=site:joongang.co.kr+when:1d&hl=ko&gl=KR&ceid=KR:ko` | **`reliability: experimental`**, `fetch_method: google_news_rss` — no native RSS exists; see §8 for handling |

### Tier 3 — 헬스케어 전문지 (8, storage requires ≥1 tag match, `reliability: stable`)

| Name | RSS URL |
|---|---|
| 청년의사 | `https://www.docdocdoc.co.kr/rss/allArticle.xml` |
| 히트뉴스 | `https://www.hitnews.co.kr/rss/allArticle.xml` |
| 라포르시안 | `http://www.rapportian.com/rss/allArticle.xml` |
| 코메디닷컴 | `https://kormedi.com/feed` |
| 의학신문 | `http://www.bosa.co.kr/rss/allArticle.xml` |
| 메디칼업저버 | `http://www.monews.co.kr/rss/allArticle.xml` |
| 팜뉴스 | `https://www.pharmnews.com/rss/allArticle.xml` |
| 헬스조선 | `https://health.chosun.com/site/data/rss/rss.xml` |

Excluded: 메디게이트뉴스, 데일리팜 (no discoverable RSS as of this
research); adding them later would require HTML scraping, which is a
separate, higher-effort track not included in v1.

## 6. Deduplication

- **Primary**: `url` has a DB unique constraint — an exact re-fetch of the
  same article never creates a duplicate row.
- **Cross-outlet duplicates**: multiple Tier 2/3 outlets often republish the
  same wire story under different URLs (confirmed during research — the same
  기사 appeared verbatim on 헬스조선 and 코메디닷컴 on the same day). Before
  inserting a new article, normalize its title (strip whitespace/punctuation,
  lowercase) into `title_norm`, and check for an existing article with the
  same `title_norm` published within the same calendar day. If found, skip
  inserting the new one — the earliest-collected copy is kept.
- This is plain string comparison, no AI/embeddings involved, consistent with
  the zero-AI-cost constraint.

## 7. Tagging, scoring, and storage policy

- A fixed keyword dictionary (defined in code, e.g. `tags.config.ts`) maps
  each tag to a list of keyword variants, drawn from the original concept's
  tag list (GLP-1, 비만, 시니어, 요양, 언더라이팅, 재가케어, 디지털헬스, etc.)
  and category context (중증질환/만성질환/예방/시니어/데이터/협업).
- On collection, each article's title + snippet is scanned via plain
  substring matching against the dictionary; every matched tag is recorded
  in `tags`, and `score` = number of matched tags.
- **Storage policy** (this is the noise-control mechanism, validated as
  necessary after seeing 헬스조선's live feed — mostly lifestyle content
  unrelated to industry/policy):
  - Tier 1 (공공기관): always stored, regardless of tag matches — these
    sources are already curated/official.
  - Tier 2 and Tier 3: stored **only if at least one tag matched**.
    Zero-match articles from media sources are discarded at collection time,
    never written to the DB.
- If keyword matching later proves too imprecise (false positives from
  substrings inside unrelated compound words), add the `kiwipiepy` Korean
  tokenizer as a refinement — not needed for v1.

## 8. 중앙일보 via Google News RSS — stabilization

Because 중앙일보 has no native RSS, it is collected via a Google News RSS
search scoped to its domain (`site:joongang.co.kr`). This is an unofficial,
less predictable mechanism, so it gets extra isolation:

1. **Per-source error isolation**: every source's fetch runs in its own
   try/catch inside the collection job; a failure here never blocks or
   fails collection for the other 21 sources. (This principle applies to
   all sources, but matters most here.)
2. **Low request volume**: one request per day for one query — far below
   the volume that typically triggers anti-bot responses.
3. **Per-article redirect resolution**: Google News RSS item links are
   redirect/encoded URLs, not the real article URL. Resolve each by
   following the HTTP redirect; if resolution fails for a given item, skip
   that one item and continue — never abort the whole source.
4. **Reliability flag surfaced in the dashboard**: `sources.reliability =
   'experimental'` for this row. If this source produces zero new articles
   for 3+ consecutive collection runs, the dashboard shows a small warning
   next to it, so a silent breakage is visible instead of just looking like
   "no news happened."

## 9. Dashboard

- **Home**: recent articles, newest first, each with a priority badge based
  on `score` (🔴 3+ tags / 🟡 1–2 / ⚪ 0 — only possible for Tier 1 items,
  since Tier 2/3 always have ≥1 by storage policy), source name, tier.
- **Filters**: by source, by tier, by tag.
- **Search**: substring search across `title` and `content_snippet`
  (Postgres `ILIKE`), no full-text search engine needed at this scale.
- **Article detail**: title, source, published date, matched tags, snippet,
  link to original article (opens the real source site, not a mirrored copy).

## 10. Testing approach

- Unit tests for: title normalization, dedup matching logic, keyword-tagging
  function (given fixed input strings, given a known tag dictionary).
- Manual verification against live RSS feeds for all 23 sources before
  first scheduled run (confirm each parses without error and produces
  sane items).
- No automated test needed for the Google News RSS redirect-resolution path
  beyond a manual check — its whole design goal is "fail without breaking
  anything else," so the test that matters is confirming isolation, not
  100% reliability of that one source.

## 11. Deferred (Phase 2+, not part of this spec's implementation)

- AI summarization / FACT-IMPLICATION-ACTION generation, via a free/local
  option (Ollama local LLM, or a free-tier hosted API) once keyword-only
  filtering has been used in practice and its limits are understood.
- Email digest (Resend or similar), described as optional in the original
  concept and intentionally dropped for v1 in favor of dashboard-only.
- 언론사 확장 candidates already investigated but excluded from v1:
  메디게이트뉴스, 데일리팜 (no RSS — would need HTML scraping).
- Competitor watch, weak-signal/trend detection, cross-referencing to past
  articles, multi-axis AI scoring — all from the original concept, all
  require either AI or much more accumulated data than v1 will have.
