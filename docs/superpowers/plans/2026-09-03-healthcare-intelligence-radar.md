# Healthcare Intelligence Radar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal, single-user web app that daily collects RSS from 23 Korean healthcare/insurance-relevant sources, tags and dedupes them with zero AI cost, and shows them in a private dashboard.

**Architecture:** One Next.js (App Router, TypeScript) app on Vercel. A Vercel Cron job hits an internal API route once a day, which fetches all 23 RSS sources, tags/dedupes/filters them in plain TypeScript, and writes to a Supabase Postgres database. The same app's pages read from that database to render the dashboard. No separate backend service, no AI API calls.

**Tech Stack:** Next.js 15 (App Router) + TypeScript, `postgres` (postgres.js) as the DB driver against Supabase, `rss-parser` for feed parsing, Vitest for tests, Vercel for hosting + Cron.

**Spec:** [docs/superpowers/specs/2026-09-03-healthcare-intelligence-radar-design.md](../specs/2026-09-03-healthcare-intelligence-radar-design.md)

## Global Constraints

- No AI/LLM API calls anywhere in this version — tagging is plain keyword substring matching (spec §7, §11).
- Personal single-user tool: dashboard-only, no email/notifications, no sharing (spec §2).
- Tier 1 sources (공공기관) are stored unconditionally; Tier 2/3 sources are stored **only if at least one tag matched** (spec §7).
- Dedup: `articles.url` has a DB unique constraint, plus a same-calendar-day normalized-title match check before insert (spec §6).
- Every source's fetch runs in its own try/catch — one failing source must never block or fail collection for the other 22 (spec §3, §8).
- 보건복지부 must be fetched via its RSS URL only — its robots.txt disallows scraping the HTML board pages directly (spec §5).
- 매일경제's feed is behind Cloudflare and requires a normal browser `User-Agent` header on the fetch (spec §5).
- 중앙일보 has no native RSS; it is fetched via a Google News RSS search scoped to its domain, flagged `reliability: experimental`, with per-article redirect resolution that skips (not fails) on error (spec §8).

---

## File Structure

```
notice/
  package.json, tsconfig.json, next.config.js, vitest.config.ts
  vercel.json                          # cron schedule
  .env.local.example
  db/
    schema.sql                         # tables + seed data for 23 sources
  src/
    lib/
      sources.config.ts                # static list of 23 sources
      tags.config.ts                   # keyword dictionary
      normalize.ts                     # title normalization + same-day dedup check (pure)
      tagging.ts                       # keyword matching + scoring (pure)
      rss.ts                           # fetch + parse one source's feed
      db.ts                            # postgres client + all queries
      collect.ts                       # orchestrates fetch -> dedup -> tag -> store
    app/
      layout.tsx
      page.tsx                         # dashboard home (list + filters + search)
      article/[id]/page.tsx            # article detail
      api/cron/collect/route.ts        # Vercel Cron target
    components/
      PriorityBadge.tsx
      ArticleCard.tsx
      ArticleList.tsx
      FilterBar.tsx
  tests/
    normalize.test.ts
    tagging.test.ts
    rss.test.ts
    sources.test.ts
```

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.js`
- Create: `vitest.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `tests/smoke.test.ts`
- Create: `.gitignore`

**Interfaces:**
- Produces: a working Next.js + TypeScript + Vitest toolchain that every later task builds on.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "healthcare-intelligence-radar",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "rss-parser": "^3.13.0",
    "postgres": "^3.4.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "vitest": "^2.0.0",
    "vite-tsconfig-paths": "^5.0.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write `next.config.js`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
module.exports = nextConfig;
```

- [ ] **Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 5: Write `.gitignore`**

```
node_modules
.next
.env.local
```

- [ ] **Step 6: Write minimal app shell**

`src/app/layout.tsx`:

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
```

`src/app/page.tsx`:

```tsx
export default function HomePage() {
  return <main>Healthcare Intelligence Radar — 준비 중</main>;
}
```

- [ ] **Step 7: Write a smoke test**

`tests/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 8: Install dependencies**

Run: `npm install`
Expected: completes with no errors, creates `node_modules` and `package-lock.json`.

- [ ] **Step 9: Verify build and tests**

Run: `npm run build`
Expected: `Compiled successfully`.

Run: `npm test`
Expected: `1 passed` (the smoke test).

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.js vitest.config.ts .gitignore src tests
git commit -m "chore: scaffold Next.js + TypeScript + Vitest project"
```

---

## Task 2: Source registry

**Files:**
- Create: `src/lib/sources.config.ts`
- Test: `tests/sources.test.ts`

**Interfaces:**
- Produces: `SourceConfig` type, `SOURCES: SourceConfig[]` (23 entries) — every later task that touches collection or the DB imports this.

- [ ] **Step 1: Write the failing test**

`tests/sources.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SOURCES } from '@/lib/sources.config';

describe('SOURCES', () => {
  it('has exactly 23 sources', () => {
    expect(SOURCES.length).toBe(23);
  });

  it('has unique ids', () => {
    const ids = SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has 5 tier-1, 10 tier-2, 8 tier-3 sources', () => {
    expect(SOURCES.filter((s) => s.tier === 1).length).toBe(5);
    expect(SOURCES.filter((s) => s.tier === 2).length).toBe(10);
    expect(SOURCES.filter((s) => s.tier === 3).length).toBe(8);
  });

  it('marks 중앙일보 as experimental with google_news_rss fetch method', () => {
    const joongang = SOURCES.find((s) => s.id === 'joongang');
    expect(joongang?.reliability).toBe('experimental');
    expect(joongang?.fetchMethod).toBe('google_news_rss');
  });

  it('marks 매일경제 as requiring a browser user-agent', () => {
    const mk = SOURCES.find((s) => s.id === 'mk');
    expect(mk?.requiresBrowserUA).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/sources.test.ts`
Expected: FAIL — `Cannot find module '@/lib/sources.config'`.

- [ ] **Step 3: Write the implementation**

`src/lib/sources.config.ts`:

```ts
export type SourceTier = 1 | 2 | 3;
export type FetchMethod = 'rss' | 'google_news_rss';
export type Reliability = 'stable' | 'experimental';

export interface SourceConfig {
  id: string;
  name: string;
  rssUrl: string;
  tier: SourceTier;
  reliability: Reliability;
  fetchMethod: FetchMethod;
  requiresBrowserUA?: boolean;
}

export const SOURCES: SourceConfig[] = [
  // Tier 1 — 공공기관
  { id: 'fsc', name: '금융위원회', rssUrl: 'http://www.fsc.go.kr/about/fsc_bbs_rss/?fid=0111', tier: 1, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'mohw', name: '보건복지부', rssUrl: 'https://www.mohw.go.kr/rss/board.es?mid=a10503000000&bid=0027', tier: 1, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'mfds', name: '식품의약품안전처', rssUrl: 'http://www.mfds.go.kr/www/rss/brd.do?brdId=ntc0021', tier: 1, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'hira', name: '건강보험심사평가원', rssUrl: 'https://www.hira.or.kr/cms/inform/02/news.xml', tier: 1, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'khidi', name: '한국보건산업진흥원', rssUrl: 'https://www.khidi.or.kr/rss?menuId=MENU00100', tier: 1, reliability: 'stable', fetchMethod: 'rss' },

  // Tier 2 — 종합/경제지
  { id: 'yna', name: '연합뉴스', rssUrl: 'https://www.yna.co.kr/rss/economy.xml', tier: 2, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'chosun', name: '조선일보', rssUrl: 'https://www.chosun.com/arc/outboundfeeds/rss/category/economy/?outputType=xml', tier: 2, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'donga', name: '동아일보', rssUrl: 'http://rss.donga.com/economy.xml', tier: 2, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'hani', name: '한겨레', rssUrl: 'https://www.hani.co.kr/rss/economy', tier: 2, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'hankyung', name: '한국경제', rssUrl: 'https://www.hankyung.com/feed/economy', tier: 2, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'mk', name: '매일경제', rssUrl: 'https://www.mk.co.kr/rss/30100041/', tier: 2, reliability: 'stable', fetchMethod: 'rss', requiresBrowserUA: true },
  { id: 'herald', name: '헤럴드경제', rssUrl: 'https://biz.heraldcorp.com/rss/google/economy', tier: 2, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'edaily', name: '이데일리', rssUrl: 'https://rss.edaily.co.kr/economy_news.xml', tier: 2, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'sedaily', name: '서울경제', rssUrl: 'https://www.sedaily.com/rss/economy', tier: 2, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'joongang', name: '중앙일보', rssUrl: 'https://news.google.com/rss/search?q=site:joongang.co.kr+when:1d&hl=ko&gl=KR&ceid=KR:ko', tier: 2, reliability: 'experimental', fetchMethod: 'google_news_rss' },

  // Tier 3 — 헬스케어 전문지
  { id: 'docdocdoc', name: '청년의사', rssUrl: 'https://www.docdocdoc.co.kr/rss/allArticle.xml', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'hitnews', name: '히트뉴스', rssUrl: 'https://www.hitnews.co.kr/rss/allArticle.xml', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'rapportian', name: '라포르시안', rssUrl: 'http://www.rapportian.com/rss/allArticle.xml', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'kormedi', name: '코메디닷컴', rssUrl: 'https://kormedi.com/feed', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'bosa', name: '의학신문', rssUrl: 'http://www.bosa.co.kr/rss/allArticle.xml', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'monews', name: '메디칼업저버', rssUrl: 'http://www.monews.co.kr/rss/allArticle.xml', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'pharmnews', name: '팜뉴스', rssUrl: 'https://www.pharmnews.com/rss/allArticle.xml', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
  { id: 'healthchosun', name: '헬스조선', rssUrl: 'https://health.chosun.com/site/data/rss/rss.xml', tier: 3, reliability: 'stable', fetchMethod: 'rss' },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/sources.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sources.config.ts tests/sources.test.ts
git commit -m "feat: add source registry for 23 RSS sources"
```

---

## Task 3: Keyword tagging & scoring

**Files:**
- Create: `src/lib/tags.config.ts`
- Create: `src/lib/tagging.ts`
- Test: `tests/tagging.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `TagDefinition`, `TAGS: TagDefinition[]`, `TagMatchResult { tags: string[]; score: number }`, `matchTags(text: string, tagDefs?: TagDefinition[]): TagMatchResult` — used by Task 8's `collect.ts`.

- [ ] **Step 1: Write the failing test**

`tests/tagging.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { matchTags } from '@/lib/tagging';
import type { TagDefinition } from '@/lib/tags.config';

const testTags: TagDefinition[] = [
  { tag: 'GLP-1', keywords: ['GLP-1', '위고비', '삭센다'] },
  { tag: '시니어', keywords: ['시니어', '고령자'] },
];

describe('matchTags', () => {
  it('matches a tag whose keyword appears in the text', () => {
    const result = matchTags('위고비 처방 확대 논의', testTags);
    expect(result.tags).toEqual(['GLP-1']);
    expect(result.score).toBe(1);
  });

  it('matches multiple tags and scores by count', () => {
    const result = matchTags('시니어 대상 GLP-1 비만치료제 급여화 검토', testTags);
    expect(result.tags.sort()).toEqual(['GLP-1', '시니어'].sort());
    expect(result.score).toBe(2);
  });

  it('returns empty tags and zero score when nothing matches', () => {
    const result = matchTags('오늘의 날씨 예보', testTags);
    expect(result.tags).toEqual([]);
    expect(result.score).toBe(0);
  });

  it('matching is case-insensitive for latin keywords', () => {
    const result = matchTags('glp-1 관련 소식', testTags);
    expect(result.tags).toEqual(['GLP-1']);
  });

  it('uses the default TAGS dictionary when none is passed', () => {
    const result = matchTags('국민건강보험공단 언더라이팅 데이터 활용');
    expect(result.tags).toContain('언더라이팅');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tagging.test.ts`
Expected: FAIL — `Cannot find module '@/lib/tagging'`.

- [ ] **Step 3: Write `src/lib/tags.config.ts`**

```ts
export interface TagDefinition {
  tag: string;
  keywords: string[];
}

export const TAGS: TagDefinition[] = [
  { tag: '암', keywords: ['암'] },
  { tag: '심뇌혈관', keywords: ['심뇌혈관', '심혈관', '뇌혈관', '심근경색', '뇌졸중'] },
  { tag: '중증질환', keywords: ['중증질환'] },
  { tag: '비만', keywords: ['비만'] },
  { tag: '당뇨', keywords: ['당뇨'] },
  { tag: '대사질환', keywords: ['대사질환', '대사증후군'] },
  { tag: 'GLP-1', keywords: ['GLP-1', 'GLP1', '위고비', '삭센다', '마운자로', '오젬픽'] },
  { tag: '치매', keywords: ['치매'] },
  { tag: '시니어', keywords: ['시니어', '고령자'] },
  { tag: '간병', keywords: ['간병'] },
  { tag: '요양', keywords: ['요양'] },
  { tag: '재가케어', keywords: ['재가케어', '재가서비스', '재가돌봄'] },
  { tag: 'Hospital at Home', keywords: ['Hospital at Home', '재택입원', '재택의료'] },
  { tag: 'PRO', keywords: ['환자보고결과'] },
  { tag: '재정케어', keywords: ['재정케어'] },
  { tag: '건강관리', keywords: ['건강관리'] },
  { tag: '예방', keywords: ['질병예방', '예방접종', '예방의학'] },
  { tag: '검진', keywords: ['건강검진', '암검진'] },
  { tag: '의료데이터', keywords: ['의료데이터', '의료 데이터'] },
  { tag: '건강데이터', keywords: ['건강데이터', '건강 데이터'] },
  { tag: '의료AI', keywords: ['의료AI', '의료 AI', '헬스케어 AI'] },
  { tag: '언더라이팅', keywords: ['언더라이팅'] },
  { tag: '상품개발', keywords: ['보험상품', '상품개발'] },
  { tag: '보험부가서비스', keywords: ['부가서비스', '헬스케어서비스', '헬스케어 서비스'] },
  { tag: '병원제휴', keywords: ['병원 제휴', '병원제휴', '의료기관 제휴'] },
  { tag: '제약사협업', keywords: ['제약사 협업', '제약사 파트너십'] },
  { tag: 'M&A', keywords: ['M&A', '인수합병', '인수 합병'] },
  { tag: '투자', keywords: ['투자 유치', 'VC 투자', '지분투자'] },
  { tag: '디지털헬스', keywords: ['디지털헬스', '디지털 헬스'] },
];
```

- [ ] **Step 4: Write `src/lib/tagging.ts`**

```ts
import { TAGS, type TagDefinition } from './tags.config';

export interface TagMatchResult {
  tags: string[];
  score: number;
}

export function matchTags(text: string, tagDefs: TagDefinition[] = TAGS): TagMatchResult {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  for (const def of tagDefs) {
    const hit = def.keywords.some((kw) => lower.includes(kw.toLowerCase()));
    if (hit) matched.push(def.tag);
  }
  return { tags: matched, score: matched.length };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/tagging.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/tags.config.ts src/lib/tagging.ts tests/tagging.test.ts
git commit -m "feat: add keyword tag dictionary and matching logic"
```

---

## Task 4: Title normalization & same-day dedup check

**Files:**
- Create: `src/lib/normalize.ts`
- Test: `tests/normalize.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `normalizeTitle(title: string): string`, `isSameDay(a: Date, b: Date): boolean` — used by Task 7's `db.ts` and Task 8's `collect.ts`.

- [ ] **Step 1: Write the failing test**

`tests/normalize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeTitle, isSameDay } from '@/lib/normalize';

describe('normalizeTitle', () => {
  it('lowercases and strips whitespace', () => {
    expect(normalizeTitle('GLP-1 처방 확대 논의')).toBe(normalizeTitle('glp-1  처방   확대  논의'));
  });

  it('strips punctuation', () => {
    expect(normalizeTitle('금융위, 헬스케어 규제 완화')).toBe(normalizeTitle('금융위 헬스케어 규제 완화'));
  });

  it('produces different output for genuinely different titles', () => {
    expect(normalizeTitle('금융위 헬스케어 규제 완화')).not.toBe(normalizeTitle('복지부 요양 정책 개편'));
  });
});

describe('isSameDay', () => {
  it('returns true for two timestamps on the same UTC calendar day', () => {
    expect(isSameDay(new Date('2026-09-03T01:00:00Z'), new Date('2026-09-03T23:00:00Z'))).toBe(true);
  });

  it('returns false for timestamps on different UTC calendar days', () => {
    expect(isSameDay(new Date('2026-09-03T23:59:00Z'), new Date('2026-09-04T00:01:00Z'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/normalize.test.ts`
Expected: FAIL — `Cannot find module '@/lib/normalize'`.

- [ ] **Step 3: Write the implementation**

`src/lib/normalize.ts`:

```ts
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\s　]+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/normalize.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/normalize.ts tests/normalize.test.ts
git commit -m "feat: add title normalization and same-day comparison helpers"
```

---

## Task 5: RSS fetch & parse layer

**Files:**
- Create: `src/lib/rss.ts`
- Test: `tests/rss.test.ts`

**Interfaces:**
- Consumes: `SourceConfig` from `src/lib/sources.config.ts` (Task 2).
- Produces: `RawArticle { title: string; url: string; publishedAt: Date | null; snippet: string }`, `fetchSourceArticles(source: SourceConfig): Promise<RawArticle[]>`, `resolveGoogleNewsUrl(redirectUrl: string): Promise<string | null>` — used by Task 8's `collect.ts`.

- [ ] **Step 1: Write the failing test**

`tests/rss.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchSourceArticles, resolveGoogleNewsUrl } from '@/lib/rss';
import type { SourceConfig } from '@/lib/sources.config';

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Sample Feed</title>
  <item>
    <title>GLP-1 비만치료제 급여화 논의</title>
    <link>https://example.com/articles/1</link>
    <pubDate>Thu, 3 Sep 2026 09:00:00 +0900</pubDate>
    <description>보건복지부가 GLP-1 계열 비만치료제 급여 적용을 검토 중이다.</description>
  </item>
</channel></rss>`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchSourceArticles', () => {
  it('parses a plain RSS feed into RawArticle objects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => SAMPLE_RSS,
      }),
    );

    const source: SourceConfig = {
      id: 'test-source',
      name: 'Test Source',
      rssUrl: 'https://example.com/rss.xml',
      tier: 1,
      reliability: 'stable',
      fetchMethod: 'rss',
    };

    const articles = await fetchSourceArticles(source);
    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe('GLP-1 비만치료제 급여화 논의');
    expect(articles[0].url).toBe('https://example.com/articles/1');
    expect(articles[0].publishedAt).toBeInstanceOf(Date);
    expect(articles[0].snippet).toContain('비만치료제');
  });

  it('sends a browser User-Agent header when requiresBrowserUA is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => SAMPLE_RSS,
    });
    vi.stubGlobal('fetch', fetchMock);

    const source: SourceConfig = {
      id: 'mk',
      name: '매일경제',
      rssUrl: 'https://www.mk.co.kr/rss/30100041/',
      tier: 2,
      reliability: 'stable',
      fetchMethod: 'rss',
      requiresBrowserUA: true,
    };

    await fetchSourceArticles(source);
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers['User-Agent']).toMatch(/Mozilla/);
  });

  it('throws when the HTTP response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => '' }),
    );

    const source: SourceConfig = {
      id: 'broken',
      name: 'Broken',
      rssUrl: 'https://example.com/broken.xml',
      tier: 1,
      reliability: 'stable',
      fetchMethod: 'rss',
    };

    await expect(fetchSourceArticles(source)).rejects.toThrow();
  });
});

describe('resolveGoogleNewsUrl', () => {
  it('returns the resolved URL when the fetch redirects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, url: 'https://joongang.co.kr/real-article-123' }),
    );
    const resolved = await resolveGoogleNewsUrl('https://news.google.com/rss/articles/abc');
    expect(resolved).toBe('https://joongang.co.kr/real-article-123');
  });

  it('returns null when resolution fails instead of throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network error')),
    );
    const resolved = await resolveGoogleNewsUrl('https://news.google.com/rss/articles/abc');
    expect(resolved).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/rss.test.ts`
Expected: FAIL — `Cannot find module '@/lib/rss'`.

- [ ] **Step 3: Install `rss-parser` if not already present**

Already added to `package.json` in Task 1. If `node_modules/rss-parser` is missing, run `npm install`.

- [ ] **Step 4: Write the implementation**

`src/lib/rss.ts`:

```ts
import Parser from 'rss-parser';
import type { SourceConfig } from './sources.config';

export interface RawArticle {
  title: string;
  url: string;
  publishedAt: Date | null;
  snippet: string;
}

const parser = new Parser();

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export async function fetchSourceArticles(source: SourceConfig): Promise<RawArticle[]> {
  const headers: Record<string, string> = {};
  if (source.requiresBrowserUA) {
    headers['User-Agent'] = BROWSER_USER_AGENT;
  }

  const res = await fetch(source.rssUrl, { headers });
  if (!res.ok) {
    throw new Error(`fetch failed for ${source.id}: HTTP ${res.status}`);
  }
  const xml = await res.text();
  const feed = await parser.parseString(xml);
  const items = feed.items ?? [];

  const results: RawArticle[] = [];
  for (const item of items) {
    if (!item.title || !item.link) continue;

    let url = item.link;
    if (source.fetchMethod === 'google_news_rss') {
      const resolved = await resolveGoogleNewsUrl(item.link);
      if (!resolved) continue; // skip this one item, never abort the whole source
      url = resolved;
    }

    results.push({
      title: item.title.trim(),
      url,
      publishedAt: item.isoDate ? new Date(item.isoDate) : item.pubDate ? new Date(item.pubDate) : null,
      snippet: (item.contentSnippet || item.content || '').slice(0, 500),
    });
  }
  return results;
}

export async function resolveGoogleNewsUrl(redirectUrl: string): Promise<string | null> {
  try {
    const res = await fetch(redirectUrl, { redirect: 'follow' });
    if (!res.ok) return null;
    if (res.url && res.url !== redirectUrl) return res.url;
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/rss.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/rss.ts tests/rss.test.ts
git commit -m "feat: add RSS fetch/parse layer with Google News redirect resolution"
```

---

## Task 6: Supabase project and database schema

**Files:**
- Create: `db/schema.sql`
- Create: `.env.local.example`

**Interfaces:**
- Produces: a live Supabase Postgres database with `sources` (23 rows) and `articles` (empty) tables, and a `DATABASE_URL` connection string — consumed by Task 7's `db.ts`.

- [ ] **Step 1: Create the Supabase project (manual, one-time)**

1. Go to https://supabase.com and sign in (or create a free account — no credit card required for the free tier).
2. Click **New Project**. Name it `healthcare-intelligence-radar`, choose a region close to you (e.g. Seoul if available, otherwise Tokyo), set a database password, and save that password somewhere safe.
3. Once the project finishes provisioning, go to **Project Settings → Database → Connection string → URI**. Copy the connection string — it looks like `postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxx.supabase.co:5432/postgres`. Replace `[YOUR-PASSWORD]` with the password from step 2.

- [ ] **Step 2: Write `db/schema.sql`**

```sql
create table if not exists sources (
  id text primary key,
  name text not null,
  rss_url text not null,
  tier smallint not null,
  reliability text not null default 'stable',
  fetch_method text not null default 'rss'
);

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
  score int not null default 0
);

create index if not exists idx_articles_title_norm_published on articles (title_norm, published_at);
create index if not exists idx_articles_published_at on articles (published_at desc);

insert into sources (id, name, rss_url, tier, reliability, fetch_method) values
  ('fsc', '금융위원회', 'http://www.fsc.go.kr/about/fsc_bbs_rss/?fid=0111', 1, 'stable', 'rss'),
  ('mohw', '보건복지부', 'https://www.mohw.go.kr/rss/board.es?mid=a10503000000&bid=0027', 1, 'stable', 'rss'),
  ('mfds', '식품의약품안전처', 'http://www.mfds.go.kr/www/rss/brd.do?brdId=ntc0021', 1, 'stable', 'rss'),
  ('hira', '건강보험심사평가원', 'https://www.hira.or.kr/cms/inform/02/news.xml', 1, 'stable', 'rss'),
  ('khidi', '한국보건산업진흥원', 'https://www.khidi.or.kr/rss?menuId=MENU00100', 1, 'stable', 'rss'),
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
  ('docdocdoc', '청년의사', 'https://www.docdocdoc.co.kr/rss/allArticle.xml', 3, 'stable', 'rss'),
  ('hitnews', '히트뉴스', 'https://www.hitnews.co.kr/rss/allArticle.xml', 3, 'stable', 'rss'),
  ('rapportian', '라포르시안', 'http://www.rapportian.com/rss/allArticle.xml', 3, 'stable', 'rss'),
  ('kormedi', '코메디닷컴', 'https://kormedi.com/feed', 3, 'stable', 'rss'),
  ('bosa', '의학신문', 'http://www.bosa.co.kr/rss/allArticle.xml', 3, 'stable', 'rss'),
  ('monews', '메디칼업저버', 'http://www.monews.co.kr/rss/allArticle.xml', 3, 'stable', 'rss'),
  ('pharmnews', '팜뉴스', 'https://www.pharmnews.com/rss/allArticle.xml', 3, 'stable', 'rss'),
  ('healthchosun', '헬스조선', 'https://health.chosun.com/site/data/rss/rss.xml', 3, 'stable', 'rss')
on conflict (id) do update set
  name = excluded.name,
  rss_url = excluded.rss_url,
  tier = excluded.tier,
  reliability = excluded.reliability,
  fetch_method = excluded.fetch_method;
```

- [ ] **Step 3: Run the schema against Supabase**

In the Supabase dashboard, go to **SQL Editor → New query**, paste the full contents of `db/schema.sql`, and click **Run**.

Expected: no errors; the **Table Editor** now shows `sources` (23 rows) and `articles` (0 rows).

- [ ] **Step 4: Write `.env.local.example`**

```
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxx.supabase.co:5432/postgres
CRON_SECRET=replace-with-a-random-string
```

- [ ] **Step 5: Create your real local `.env.local`**

Copy `.env.local.example` to `.env.local` and fill in the real `DATABASE_URL` from Step 1 and a random `CRON_SECRET` value (e.g. generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). `.env.local` is already gitignored (Task 1) — never commit it.

- [ ] **Step 6: Commit**

```bash
git add db/schema.sql .env.local.example
git commit -m "feat: add database schema and seed data for 23 sources"
```

---

## Task 7: Database client and persistence functions

**Files:**
- Create: `src/lib/db.ts`

**Interfaces:**
- Consumes: `DATABASE_URL` env var (Task 6).
- Produces: `sql` (postgres.js client), `ArticleInsert`, `articleUrlExists`, `findSameDayTitleDuplicate`, `insertArticle`, `ArticleRow`, `ArticleFilters`, `getRecentArticles`, `getArticleById` — used by Task 8 (`collect.ts`) and Tasks 10–12 (dashboard pages).

- [ ] **Step 1: Write the implementation**

`src/lib/db.ts`:

```ts
import postgres from 'postgres';

export const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });

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
```

- [ ] **Step 2: Manually verify against the real database**

Create a scratch file `scratch-db-check.mjs` (not committed) in the project root:

```js
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });
const sources = await sql`select count(*) from sources`;
console.log('sources count:', sources[0].count);
await sql.end();
```

Run: `node --env-file=.env.local scratch-db-check.mjs`
Expected: prints `sources count: 23`.

Delete `scratch-db-check.mjs` afterward — it was only to confirm the connection works, not a permanent test (a live DB isn't mocked in the automated test suite, per this project's scale).

- [ ] **Step 3: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add database client and article persistence/query functions"
```

---

## Task 8: Collection orchestrator and cron API route

**Files:**
- Create: `src/lib/collect.ts`
- Create: `src/app/api/cron/collect/route.ts`

**Interfaces:**
- Consumes: `SOURCES` (Task 2), `matchTags` (Task 3), `normalizeTitle`/`isSameDay` (Task 4), `fetchSourceArticles` (Task 5), `articleUrlExists`/`findSameDayTitleDuplicate`/`insertArticle` (Task 7).
- Produces: `CollectionSummary`, `collectSource(source: SourceConfig): Promise<CollectionSummary>`, `collectAll(): Promise<CollectionSummary[]>` — used by the cron route and by Task 9's deployment verification.

- [ ] **Step 1: Write `src/lib/collect.ts`**

```ts
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
```

- [ ] **Step 2: Write `src/app/api/cron/collect/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { collectAll } from '@/lib/collect';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const summary = await collectAll();
  return NextResponse.json({ summary });
}
```

- [ ] **Step 3: Manually verify end-to-end against the real database**

Run: `npm run dev`, then in another terminal:

```bash
curl -H "Authorization: Bearer <your CRON_SECRET from .env.local>" http://localhost:3000/api/cron/collect
```

Expected: a JSON response with a `summary` array of 23 entries, most with `error: null` and `inserted` counts ≥ 0. Check the Supabase **Table Editor → articles** table — it should now have rows, all with a non-empty `tags` array except any `tier = 1` rows with zero matches.

- [ ] **Step 4: Commit**

```bash
git add src/lib/collect.ts src/app/api/cron/collect/route.ts
git commit -m "feat: add collection orchestrator and cron API route"
```

---

## Task 9: Vercel deployment and cron schedule

**Files:**
- Create: `vercel.json`

**Interfaces:**
- Consumes: `/api/cron/collect` route (Task 8).
- Produces: a deployed app on Vercel with a daily cron trigger.

- [ ] **Step 1: Write `vercel.json`**

```json
{
  "crons": [
    { "path": "/api/cron/collect", "schedule": "0 22 * * *" }
  ]
}
```

This runs at 22:00 UTC = 07:00 KST daily.

- [ ] **Step 2: Push the repo to GitHub (manual, one-time)**

1. Create a new empty repository on GitHub (e.g. `healthcare-intelligence-radar`), no README/license/gitignore (this repo already has one).
2. Run:

```bash
git remote add origin <your-github-repo-url>
git push -u origin master
```

- [ ] **Step 3: Import into Vercel (manual, one-time)**

1. Go to https://vercel.com, sign in with GitHub, click **Add New → Project**, and import the repository from Step 2.
2. In the import screen's **Environment Variables** section, add:
   - `DATABASE_URL` = the same value as in your local `.env.local`
   - `CRON_SECRET` = the same value as in your local `.env.local`
3. Click **Deploy**.

Expected: the deployment succeeds and gives you a `https://<project>.vercel.app` URL. Vercel automatically reads `vercel.json` and registers the cron job — verify under **Project → Settings → Cron Jobs** that `/api/cron/collect` is listed with schedule `0 22 * * *`.

- [ ] **Step 4: Commit**

```bash
git add vercel.json
git commit -m "chore: add Vercel cron schedule for daily collection"
```

---

## Task 10: Dashboard home page

**Files:**
- Create: `src/components/PriorityBadge.tsx`
- Create: `src/components/ArticleCard.tsx`
- Create: `src/components/ArticleList.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `ArticleRow`, `getRecentArticles` (Task 7).
- Produces: `PriorityBadge`, `ArticleCard`, `ArticleList` React components — reused by Task 11.

- [ ] **Step 1: Write `src/components/PriorityBadge.tsx`**

```tsx
export function PriorityBadge({ score }: { score: number }) {
  const { emoji, label } =
    score >= 3 ? { emoji: '🔴', label: '높음' } : score >= 1 ? { emoji: '🟡', label: '보통' } : { emoji: '⚪', label: '참고' };
  return <span title={`매칭 태그 ${score}개`}>{emoji} {label}</span>;
}
```

- [ ] **Step 2: Write `src/components/ArticleCard.tsx`**

```tsx
import Link from 'next/link';
import { PriorityBadge } from './PriorityBadge';
import type { ArticleRow } from '@/lib/db';

export function ArticleCard({ article }: { article: ArticleRow }) {
  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid #e5e5e5' }}>
      <PriorityBadge score={article.score} />{' '}
      <Link href={`/article/${article.id}`}>{article.title}</Link>
      <div style={{ fontSize: 12, color: '#666' }}>
        {article.sourceId} · {article.tags.join(', ') || '태그 없음'}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write `src/components/ArticleList.tsx`**

```tsx
import { ArticleCard } from './ArticleCard';
import type { ArticleRow } from '@/lib/db';

export function ArticleList({ articles }: { articles: ArticleRow[] }) {
  if (articles.length === 0) {
    return <p>조건에 맞는 기사가 없습니다.</p>;
  }
  return (
    <div>
      {articles.map((a) => (
        <ArticleCard key={a.id} article={a} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `src/app/page.tsx`**

```tsx
import { getRecentArticles } from '@/lib/db';
import { ArticleList } from '@/components/ArticleList';

export default async function HomePage() {
  const articles = await getRecentArticles({ limit: 50 });

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <h1>Healthcare Intelligence Radar</h1>
      <ArticleList articles={articles} />
    </main>
  );
}
```

- [ ] **Step 5: Manually verify**

Run: `npm run dev`, open `http://localhost:3000`.
Expected: the page lists the articles inserted in Task 8's verification step, newest first, each with a priority badge and a link to its detail page (the detail page doesn't exist yet — that's fine for now, it 404s until Task 12).

- [ ] **Step 6: Commit**

```bash
git add src/components/PriorityBadge.tsx src/components/ArticleCard.tsx src/components/ArticleList.tsx src/app/page.tsx
git commit -m "feat: add dashboard home page with article list"
```

---

## Task 11: Filters and search

**Files:**
- Create: `src/components/FilterBar.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `getRecentArticles` with `ArticleFilters` (Task 7), `ArticleList` (Task 10).
- Produces: `FilterBar` component; `HomePage` now reads `tier`/`tag`/`search` from the URL query string.

- [ ] **Step 1: Write `src/components/FilterBar.tsx`**

```tsx
export function FilterBar({ tier, tag, search }: { tier?: number; tag?: string; search?: string }) {
  return (
    <form method="get" style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
      <select name="tier" defaultValue={tier ?? ''}>
        <option value="">전체 티어</option>
        <option value="1">Tier 1 (공공기관)</option>
        <option value="2">Tier 2 (종합/경제지)</option>
        <option value="3">Tier 3 (전문지)</option>
      </select>
      <input name="tag" defaultValue={tag ?? ''} placeholder="태그 (예: GLP-1)" />
      <input name="search" defaultValue={search ?? ''} placeholder="검색어" />
      <button type="submit">필터 적용</button>
    </form>
  );
}
```

- [ ] **Step 2: Rewrite `src/app/page.tsx` to read filters from the URL**

```tsx
import { getRecentArticles } from '@/lib/db';
import { ArticleList } from '@/components/ArticleList';
import { FilterBar } from '@/components/FilterBar';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string; tag?: string; search?: string }>;
}) {
  const params = await searchParams;
  const tier = params.tier ? (Number(params.tier) as 1 | 2 | 3) : undefined;

  const articles = await getRecentArticles({
    tier,
    tag: params.tag || undefined,
    search: params.search || undefined,
    limit: 50,
  });

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <h1>Healthcare Intelligence Radar</h1>
      <FilterBar tier={tier} tag={params.tag} search={params.search} />
      <ArticleList articles={articles} />
    </main>
  );
}
```

- [ ] **Step 3: Manually verify**

Run: `npm run dev`, open `http://localhost:3000?tier=1`.
Expected: only Tier 1 (공공기관) articles show. Try `?tag=GLP-1` and `?search=보험` similarly and confirm the list narrows correctly.

- [ ] **Step 4: Commit**

```bash
git add src/components/FilterBar.tsx src/app/page.tsx
git commit -m "feat: add tier/tag/search filters to dashboard home"
```

---

## Task 12: Article detail page

**Files:**
- Create: `src/app/article/[id]/page.tsx`

**Interfaces:**
- Consumes: `getArticleById` (Task 7).

- [ ] **Step 1: Write `src/app/article/[id]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { getArticleById } from '@/lib/db';

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = await getArticleById(Number(id));
  if (!article) notFound();

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <h1>{article.title}</h1>
      <p>
        {article.sourceId} · {article.publishedAt ? article.publishedAt.toLocaleString('ko-KR') : '날짜 미상'}
      </p>
      <p>태그: {article.tags.join(', ') || '없음'}</p>
      {article.snippet && <p>{article.snippet}</p>}
      <a href={article.url} target="_blank" rel="noreferrer">
        원문 보기
      </a>
    </main>
  );
}
```

- [ ] **Step 2: Manually verify**

Run: `npm run dev`, open `http://localhost:3000`, click any article title.
Expected: navigates to `/article/<id>`, shows the title, source, date, tags, snippet, and a working "원문 보기" link that opens the real source URL in a new tab.

- [ ] **Step 3: Commit**

```bash
git add src/app/article/[id]/page.tsx
git commit -m "feat: add article detail page"
```

---

## Post-implementation check

After Task 12, redeploy to Vercel (`git push`, or re-import if the Task 9 GitHub connection is already set up — Vercel auto-deploys on push) and confirm the live dashboard URL shows the same behavior as local `npm run dev`. Then wait for the next scheduled cron run (or trigger `/api/cron/collect` manually once with the production `CRON_SECRET`) and confirm new articles appear without duplicates on a second run.
