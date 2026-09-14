# Healthcare Market Intelligence Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate the daily "Healthcare Market Intelligence" Word report
(so far produced manually) and deliver it as part of the existing daily
email — an embedded preview image at the top, the existing digest below,
and the `.docx` attached.

**Architecture:** A new deep-analysis pipeline (fetch full article →
extract main text → dedicated Gemini prompt) runs only against a small
daily subset (high-priority survivors + heavily-duplicated stories),
fitting inside the existing single daily cron by first shrinking the
first-pass AI workload (skip already-rule-based-low articles) to make
room. Two new renderers (docx via the `docx` package, a PNG preview via
`@vercel/og`) consume the same shaped section data.

**Tech Stack:** Next.js API route (existing cron), `docx` (new), `jsdom` +
`@mozilla/readability` (new), `@vercel/og` (new), Gemini API (existing
integration, extended), Resend (existing, extended for attachments).

**Spec:** `docs/superpowers/specs/2026-09-14-market-intelligence-report-design.md`

## Global Constraints

- Zero added cost: every new dependency is free/MIT; no new paid services.
- AI stays optional: every new step must degrade gracefully (fallback to
  existing short summary) rather than fail the whole cron run.
- `maxDuration = 300` (Vercel Hobby ceiling) is a hard wall-clock limit
  that cannot be caught by try/catch — every new phase needs its own
  deadline guard, following the existing pattern in `enrichArticles`
  (`src/lib/aiEnrichment.ts`).
- Report categories, in fixed order: `국내 보험·제도`, `국내 산업`,
  `Global`, `다수매체 보도`.
- "다수매체 보도" threshold: a story's duplicate group has **3 or more
  total outlets** (survivor + 2 or more grouped duplicates).
- Docx style: 바탕체 font, centered title, `□ ` headline / `- ` bullet /
  `· ` sub-bullet markers, hanging indent on every marker line, closing
  centered `- 이상 -`.
- Report generation runs **weekdays only** (Mon-Fri). Tuesday-Friday use
  that day's own collected articles. Monday rolls up Saturday + Sunday +
  Monday's articles into one report. Saturday/Sunday get the regular
  digest only, no report.

---

### Task 1: Skip rule-based-low articles in first-pass AI enrichment

**Files:**
- Modify: `src/lib/aiEnrichment.ts`
- Test: `tests/aiEnrichment.test.ts`

**Interfaces:**
- Consumes: existing `ArticleRow.priority` field (already `'high' |
  'medium' | 'low'`, set at collection time before `enrichArticles` runs).
- Produces: no interface change — `enrichArticles(articles, deadlineMs?)`
  keeps its exact existing signature and `EnrichmentResult` shape. Only
  its internal filtering changes, which is why this task is independent
  of everything else in this plan and can ship on its own.

- [ ] **Step 1: Write the failing test**

Add to `tests/aiEnrichment.test.ts` (inside the existing `describe('enrichArticles', ...)` block):

```ts
  it('never sends an article whose rule-based priority is already low', async () => {
    const { enrichArticles } = await import('@/lib/aiEnrichment');
    const articles = [
      makeArticle({ id: 1, title: 'A', snippet: 'a', priority: 'low' }),
      makeArticle({ id: 2, title: 'B', snippet: 'b', priority: 'medium' }),
    ];
    getAiAnalysesForArticles.mockResolvedValue([]);
    analyzeArticles.mockResolvedValue([
      { articleId: 2, priority: 'high', summary: 's', implications: ['i'], watchPoint: 'w' },
    ]);

    const result = await enrichArticles(articles);

    expect(analyzeArticles).toHaveBeenCalledTimes(1);
    expect(analyzeArticles).toHaveBeenCalledWith([{ id: 2, title: 'B', snippet: 'b' }]);
    expect(result).toEqual({ analyzed: 1, cached: 0, skipped: null, stoppedEarly: false });
  });

  it('skips Gemini entirely and reports skipped when every article is already low', async () => {
    const { enrichArticles } = await import('@/lib/aiEnrichment');
    const articles = [makeArticle({ id: 1, priority: 'low' })];
    getAiAnalysesForArticles.mockResolvedValue([]);

    const result = await enrichArticles(articles);

    expect(analyzeArticles).not.toHaveBeenCalled();
    expect(result).toEqual({ analyzed: 0, cached: 0, skipped: null, stoppedEarly: false });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/aiEnrichment.test.ts`
Expected: FAIL — the low-priority article `A` currently still gets sent to
`analyzeArticles`, so `toHaveBeenCalledWith([{ id: 2, ... }])` fails
because the actual call includes both articles.

- [ ] **Step 3: Implement the filter**

In `src/lib/aiEnrichment.ts`, inside `enrichArticles`, change the loop that
builds `toAnalyze` (the one that currently only checks the cache):

```ts
  const toAnalyze: { id: number; title: string; snippet: string; hash: string }[] = [];
  let cached = 0;
  for (const a of articles) {
    // articles already at rule-based 'low' (keyword score 0) are almost always genuinely
    // low-relevance or untagged notices -- skipping them here roughly halves the daily
    // Gemini workload, which is what makes the report's deep-analysis pass (a separate,
    // later phase) fit inside the same time budget.
    if (a.priority === 'low') continue;

    const hash = contentHash(a.title, a.snippet ?? '');
    const existing = existingByArticleId.get(a.id);
    if (existing && existing.contentHash === hash) {
      cached++;
      continue;
    }
    toAnalyze.push({ id: a.id, title: a.title, snippet: a.snippet ?? '', hash });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/aiEnrichment.test.ts`
Expected: PASS, all tests in the file green (existing tests unaffected
since their fixtures already use `medium`/no explicit priority which
defaults to `'medium'` in `makeArticle`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/aiEnrichment.ts tests/aiEnrichment.test.ts
git commit -m "Skip rule-based-low articles in first-pass AI enrichment"
```

---

### Task 2: DB query for deep-analysis candidates

**Files:**
- Modify: `src/lib/db.ts`

**Interfaces:**
- Consumes: existing `sql` client and `PriorityBand` type already in
  `db.ts`.
- Produces:
  ```ts
  export interface CandidateRow {
    id: number;
    title: string;
    url: string;
    tags: string[];
    priority: PriorityBand;
    outletCount: number; // 1 for a lone high article, 3+ for a multi-outlet group
  }
  export async function getReportCandidates(collectedDates: string[]): Promise<CandidateRow[]>
  ```
  Task 3 consumes this function and type directly.

No dedicated unit test for this step — `db.ts` has no existing test file
in this codebase (every other function in it is verified against real
Supabase data via the established temp-route-then-curl workflow, not
mocked unit tests). This function is exercised for real in Task 9's
production verification.

- [ ] **Step 1: Add the query**

In `src/lib/db.ts`, add near the other article-reading functions (e.g.
right after `getRecentArticles`):

```ts
export interface CandidateRow {
  id: number;
  title: string;
  url: string;
  tags: string[];
  priority: PriorityBand;
  outletCount: number;
}

/** candidates for the deep-analysis report pass: every 'high' survivor, plus every
 *  survivor (regardless of its own priority) whose duplicate group has 3+ total outlets
 *  (itself + 2 or more grouped duplicates). `collectedDates` lets Monday's report roll up
 *  Saturday+Sunday+Monday into one call. */
export async function getReportCandidates(collectedDates: string[]): Promise<CandidateRow[]> {
  const rows = await sql`
    select a.id, a.title, a.url, a.tags, a.priority,
      (1 + (select count(*) from articles b where b.duplicate_of_id = a.id))::int as outlet_count
    from articles a
    where a.collected_at::date = any(${collectedDates}::date[])
      and a.duplicate_of_id is null
      and (
        a.priority = 'high'
        or (select count(*) from articles b where b.duplicate_of_id = a.id) >= 2
      )
    order by a.id
  `;
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    url: r.url,
    tags: r.tags,
    priority: r.priority,
    outletCount: r.outlet_count,
  }));
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no test to run for this step; the function is new and
unused until Task 3 imports it, which typecheck alone will confirm
compiles).

- [ ] **Step 3: Commit**

```bash
git add src/lib/db.ts
git commit -m "Add getReportCandidates query for the deep-analysis report pass"
```

---

### Task 3: `reportCandidates.ts` — shape DB rows for report routing

**Files:**
- Create: `src/lib/reportCandidates.ts`
- Test: `tests/reportCandidates.test.ts`

**Interfaces:**
- Consumes: `CandidateRow` and `getReportCandidates` from Task 2
  (`@/lib/db`).
- Produces:
  ```ts
  export interface ReportCandidate {
    id: number;
    title: string;
    url: string;
    tags: string[];
    priority: PriorityBand;
    outletCount: number;
    isMultiOutlet: boolean; // true when priority !== 'high' (only reason it qualified)
  }
  export async function getCandidatesForReport(collectedDates: string[]): Promise<ReportCandidate[]>
  ```
  Tasks 5 and 6 consume `ReportCandidate` and this function.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getReportCandidates = vi.fn();
vi.mock('@/lib/db', () => ({ getReportCandidates }));

beforeEach(() => {
  getReportCandidates.mockReset();
});

describe('getCandidatesForReport', () => {
  it('marks a high-priority candidate as not multi-outlet even if it is also heavily duplicated', async () => {
    const { getCandidatesForReport } = await import('@/lib/reportCandidates');
    getReportCandidates.mockResolvedValue([
      { id: 1, title: 'T', url: 'https://e.com/1', tags: ['GLP-1'], priority: 'high', outletCount: 5 },
    ]);

    const result = await getCandidatesForReport(['2026-09-14']);

    expect(result).toEqual([
      { id: 1, title: 'T', url: 'https://e.com/1', tags: ['GLP-1'], priority: 'high', outletCount: 5, isMultiOutlet: false },
    ]);
  });

  it('marks a non-high candidate that only qualified via outlet count as multi-outlet', async () => {
    const { getCandidatesForReport } = await import('@/lib/reportCandidates');
    getReportCandidates.mockResolvedValue([
      { id: 2, title: 'U', url: 'https://e.com/2', tags: ['암'], priority: 'medium', outletCount: 3 },
    ]);

    const result = await getCandidatesForReport(['2026-09-14']);

    expect(result[0].isMultiOutlet).toBe(true);
  });

  it('passes the collected dates through to the DB query unchanged', async () => {
    const { getCandidatesForReport } = await import('@/lib/reportCandidates');
    getReportCandidates.mockResolvedValue([]);

    await getCandidatesForReport(['2026-09-12', '2026-09-13', '2026-09-14']);

    expect(getReportCandidates).toHaveBeenCalledWith(['2026-09-12', '2026-09-13', '2026-09-14']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/reportCandidates.test.ts`
Expected: FAIL with "Cannot find module '@/lib/reportCandidates'".

- [ ] **Step 3: Implement**

```ts
import { getReportCandidates, type CandidateRow } from './db';
import type { PriorityBand } from './priority';

export interface ReportCandidate {
  id: number;
  title: string;
  url: string;
  tags: string[];
  priority: PriorityBand;
  outletCount: number;
  isMultiOutlet: boolean;
}

function toReportCandidate(row: CandidateRow): ReportCandidate {
  return { ...row, isMultiOutlet: row.priority !== 'high' };
}

export async function getCandidatesForReport(collectedDates: string[]): Promise<ReportCandidate[]> {
  const rows = await getReportCandidates(collectedDates);
  return rows.map(toReportCandidate);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/reportCandidates.test.ts`
Expected: PASS, 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reportCandidates.ts tests/reportCandidates.test.ts
git commit -m "Add reportCandidates: shape deep-analysis candidates for report routing"
```

---

### Task 4: Article text extraction (Readability + jsdom)

**Files:**
- Create: `src/lib/articleExtract.ts`
- Test: `tests/articleExtract.test.ts`
- Modify: `package.json` (add `jsdom`, `@mozilla/readability`)

**Interfaces:**
- Consumes: global `fetch`.
- Produces:
  ```ts
  export async function extractArticleText(url: string): Promise<string | null>
  ```
  Task 5 consumes this function directly.

- [ ] **Step 1: Install dependencies**

```bash
npm install jsdom @mozilla/readability
npm install -D @types/jsdom
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractArticleText } from '@/lib/articleExtract';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetchHtml(html: string, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, text: async () => html }));
}

describe('extractArticleText', () => {
  it('extracts the main article text from a real-shaped article page', async () => {
    mockFetchHtml(`
      <html><head><title>기사 제목</title></head>
      <body>
        <nav>메뉴 메뉴 메뉴</nav>
        <article>
          <h1>기사 제목입니다</h1>
          <p>이것은 본문 첫 문단입니다. 충분히 길게 작성해서 Readability가 본문으로 인식하도록 합니다.</p>
          <p>이것은 본문 두 번째 문단입니다. 마찬가지로 내용을 채워 넣어서 기사 판별에 필요한 최소 길이를 넘깁니다.</p>
        </article>
        <footer>저작권 안내 문구</footer>
      </body></html>
    `);

    const text = await extractArticleText('https://example.com/article');

    expect(text).toContain('본문 첫 문단');
    expect(text).toContain('본문 두 번째 문단');
  });

  it('returns null when the fetch fails', async () => {
    mockFetchHtml('', false);
    const text = await extractArticleText('https://example.com/broken');
    expect(text).toBeNull();
  });

  it('returns null when the page has no extractable article content', async () => {
    mockFetchHtml('<html><body><div>짧음</div></body></html>');
    const text = await extractArticleText('https://example.com/empty');
    expect(text).toBeNull();
  });

  it('returns null instead of throwing when fetch itself rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const text = await extractArticleText('https://example.com/timeout');
    expect(text).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- --run tests/articleExtract.test.ts`
Expected: FAIL with "Cannot find module '@/lib/articleExtract'".

- [ ] **Step 4: Implement**

```ts
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

/** fetches `url` and extracts its main article text with Readability (the same engine
 *  behind Firefox Reader Mode) -- far more robust across 24 different outlet HTML
 *  structures than hand-rolled tag stripping. Never throws: any failure (network, no
 *  extractable content, malformed HTML) resolves to null so callers can fall back. */
export async function extractArticleText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;

    const html = await res.text();
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    if (!article?.textContent) return null;

    const text = article.textContent.trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --run tests/articleExtract.test.ts`
Expected: PASS, 4 tests green.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add package.json package-lock.json src/lib/articleExtract.ts tests/articleExtract.test.ts
git commit -m "Add articleExtract: Readability-based article text extraction"
```

---

### Task 5: Gemini deep-analysis call + orchestration

**Files:**
- Modify: `src/lib/gemini.ts`
- Modify: `tests/gemini.test.ts`
- Create: `src/lib/reportAnalysis.ts`
- Test: `tests/reportAnalysis.test.ts`

**Interfaces:**
- Consumes: `extractArticleText` (Task 4), `ReportCandidate` (Task 3).
- Produces:
  ```ts
  // gemini.ts
  export interface DeepAnalysisResult {
    category: '국내 보험·제도' | '국내 산업' | 'Global';
    note: string | null;
    bullets: { text: string; subBullets: string[] }[];
  }
  export async function analyzeDeep(title: string, fullText: string): Promise<DeepAnalysisResult>

  // reportAnalysis.ts
  export interface CandidateDeepResult {
    articleId: number;
    category: DeepAnalysisResult['category'];
    note: string | null;
    bullets: { text: string; subBullets: string[] }[];
  }
  export async function analyzeCandidatesDeep(
    candidates: ReportCandidate[],
    deadlineMs?: number,
  ): Promise<Map<number, CandidateDeepResult>>
  ```
  Task 6 consumes `CandidateDeepResult` and `analyzeCandidatesDeep`.

#### Part A: `gemini.ts` — extract a shared HTTP helper, add `analyzeDeep`

- [ ] **Step 1: Write the failing test**

Add to `tests/gemini.test.ts`:

```ts
import { analyzeDeep } from '@/lib/gemini';

describe('analyzeDeep', () => {
  it('parses a valid deep-analysis response', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockGeminiResponse(
      JSON.stringify({
        category: '국내 산업',
        note: '',
        bullets: [{ text: '9월 8일부터 전국 공급 개시', sub_bullets: ['표준용량 대비 항원 4배'] }],
      }),
    );

    const result = await analyzeDeep('사노피 독감백신 공급', '본문 전체 텍스트...');

    expect(result).toEqual({
      category: '국내 산업',
      note: null,
      bullets: [{ text: '9월 8일부터 전국 공급 개시', subBullets: ['표준용량 대비 항원 4배'] }],
    });
  });

  it('throws when GEMINI_API_KEY is not set, same as analyzeArticles', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(analyzeDeep('제목', '본문')).rejects.toThrow('GEMINI_API_KEY');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/gemini.test.ts`
Expected: FAIL — `analyzeDeep` does not exist yet.

- [ ] **Step 3: Refactor + implement**

In `src/lib/gemini.ts`, replace the body of `analyzeArticles` (lines
84-118 as of this plan) to extract a shared `callGemini` helper, then add
`analyzeDeep` alongside it:

```ts
async function callGemini(prompt: string, schema: object): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
      }),
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!res.ok) {
    throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') throw new Error('Gemini response missing content');
  return JSON.parse(text);
}

/** sends up to ~10 articles in a single Gemini request and returns per-article analysis.
 *  Throws on any failure (missing key, quota, network, malformed response) -- callers must
 *  catch this and fall back to the rule-based system; AI analysis is always optional. */
export async function analyzeArticles(articles: GeminiArticleInput[]): Promise<GeminiAnalysisItem[]> {
  const parsed = (await callGemini(buildPrompt(articles), RESPONSE_SCHEMA)) as Array<{
    article_id: number;
    priority: PriorityBand;
    summary: string;
    implications: string[];
    watch_point: string;
  }>;

  return parsed.map((p) => ({
    articleId: p.article_id,
    priority: p.priority,
    summary: p.summary,
    implications: p.implications,
    watchPoint: p.watch_point,
  }));
}

export interface DeepAnalysisResult {
  category: '국내 보험·제도' | '국내 산업' | 'Global';
  note: string | null;
  bullets: { text: string; subBullets: string[] }[];
}

const DEEP_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: ['국내 보험·제도', '국내 산업', 'Global'] },
    note: { type: 'string' },
    bullets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          sub_bullets: { type: 'array', items: { type: 'string' } },
        },
        required: ['text', 'sub_bullets'],
      },
    },
  },
  required: ['category', 'note', 'bullets'],
};

function buildDeepPrompt(title: string, fullText: string): string {
  return `당신은 보험사 헬스케어 사업팀의 "Healthcare Market Intelligence" 보고서를 작성하는 애널리스트입니다.
아래 기사 전문을 읽고, 사내 보고서에 쓸 수 있도록 사실 위주로 정리하세요.

제목: ${title}

본문:
${fullText.slice(0, 6000)}

다음 필드를 포함한 JSON 객체 하나로만 응답하세요 (다른 텍스트 없이):
- category: 이 기사가 속할 분류를 아래 세 가지 중 하나로 판정
  - "국내 보험·제도": 국내 보험사·건강보험·정부 제도/정책 관련
  - "국내 산업": 국내 제약사·의료기기·헬스케어 기업의 사업 활동
  - "Global": 해외 기업·해외 규제기관(FDA 등) 관련
- note: 기사에 나온 전문용어나 낯선 약어에 대한 한 줄 설명. 없으면 빈 문자열("")
- bullets: 핵심 사실을 나열한 배열. 각 항목은:
  - text: 구체적인 수치·날짜·기관명·조건을 포함한 사실 한 문장
  - sub_bullets: text를 뒷받침하는 더 세부적인 사실들 (없으면 빈 배열 [])

지어내지 말고, 본문에 실제로 나온 내용만 사용하세요. 불필요하게 길게 쓰지 마세요.`;
}

/** deep, fact-dense analysis of a single article's full text for the Market Intelligence
 *  report -- distinct from analyzeArticles' short daily-digest summary. Throws on any
 *  failure; callers (reportAnalysis.ts) catch per-candidate and fall back to the existing
 *  short summary rather than dropping the article or failing the whole report. */
export async function analyzeDeep(title: string, fullText: string): Promise<DeepAnalysisResult> {
  const parsed = (await callGemini(buildDeepPrompt(title, fullText), DEEP_RESPONSE_SCHEMA)) as {
    category: DeepAnalysisResult['category'];
    note: string;
    bullets: { text: string; sub_bullets: string[] }[];
  };

  return {
    category: parsed.category,
    note: parsed.note || null,
    bullets: parsed.bullets.map((b) => ({ text: b.text, subBullets: b.sub_bullets })),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/gemini.test.ts`
Expected: PASS, all tests green (existing `analyzeArticles` tests
unaffected — same behavior, refactored internals).

- [ ] **Step 5: Commit**

```bash
git add src/lib/gemini.ts tests/gemini.test.ts
git commit -m "Add analyzeDeep for the report's fact-dense per-article analysis"
```

#### Part B: `reportAnalysis.ts` — orchestrate fetch + analyze with a deadline guard

- [ ] **Step 6: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReportCandidate } from '@/lib/reportCandidates';

const extractArticleText = vi.fn();
const analyzeDeep = vi.fn();

vi.mock('@/lib/articleExtract', () => ({ extractArticleText }));
vi.mock('@/lib/gemini', () => ({ analyzeDeep }));

function makeCandidate(overrides: Partial<ReportCandidate>): ReportCandidate {
  return {
    id: 1,
    title: '기본 제목',
    url: 'https://example.com/a',
    tags: [],
    priority: 'high',
    outletCount: 1,
    isMultiOutlet: false,
    ...overrides,
  };
}

beforeEach(() => {
  extractArticleText.mockReset();
  analyzeDeep.mockReset();
});

describe('analyzeCandidatesDeep', () => {
  it('returns a deep result for each candidate whose fetch and analysis both succeed', async () => {
    const { analyzeCandidatesDeep } = await import('@/lib/reportAnalysis');
    extractArticleText.mockResolvedValue('본문 전체');
    analyzeDeep.mockResolvedValue({ category: '국내 산업', note: null, bullets: [{ text: 't', subBullets: [] }] });

    const result = await analyzeCandidatesDeep([makeCandidate({ id: 5 })]);

    expect(result.get(5)).toEqual({
      articleId: 5,
      category: '국내 산업',
      note: null,
      bullets: [{ text: 't', subBullets: [] }],
    });
  });

  it('omits a candidate whose article text could not be extracted, without throwing', async () => {
    const { analyzeCandidatesDeep } = await import('@/lib/reportAnalysis');
    extractArticleText.mockResolvedValue(null);

    const result = await analyzeCandidatesDeep([makeCandidate({ id: 6 })]);

    expect(result.has(6)).toBe(false);
    expect(analyzeDeep).not.toHaveBeenCalled();
  });

  it('omits a candidate whose Gemini call fails, without throwing or affecting others', async () => {
    const { analyzeCandidatesDeep } = await import('@/lib/reportAnalysis');
    extractArticleText.mockResolvedValue('본문');
    analyzeDeep
      .mockRejectedValueOnce(new Error('quota exceeded'))
      .mockResolvedValueOnce({ category: 'Global', note: null, bullets: [] });

    const result = await analyzeCandidatesDeep([makeCandidate({ id: 7 }), makeCandidate({ id: 8 })]);

    expect(result.has(7)).toBe(false);
    expect(result.get(8)?.category).toBe('Global');
  });

  it('stops before the deadline and leaves the rest for the fallback path', async () => {
    const { analyzeCandidatesDeep } = await import('@/lib/reportAnalysis');
    extractArticleText.mockResolvedValue('본문');
    analyzeDeep.mockResolvedValue({ category: '국내 산업', note: null, bullets: [] });
    let call = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      call++;
      return call <= 1 ? 1_000 : 2_000;
    });

    const result = await analyzeCandidatesDeep(
      [makeCandidate({ id: 1 }), makeCandidate({ id: 2 })],
      1_500,
    );

    expect(analyzeDeep).toHaveBeenCalledTimes(1);
    expect(result.size).toBe(1);
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- --run tests/reportAnalysis.test.ts`
Expected: FAIL with "Cannot find module '@/lib/reportAnalysis'".

- [ ] **Step 8: Implement**

```ts
import { extractArticleText } from './articleExtract';
import { analyzeDeep, type DeepAnalysisResult } from './gemini';
import type { ReportCandidate } from './reportCandidates';

export interface CandidateDeepResult {
  articleId: number;
  category: DeepAnalysisResult['category'];
  note: string | null;
  bullets: DeepAnalysisResult['bullets'];
}

/** runs the fetch+extract+Gemini deep-analysis pipeline for each candidate, stopping
 *  before `deadlineMs` (same pattern as enrichArticles' time-budget guard) rather than
 *  risking the platform's wall-clock kill. A candidate that fails at any step (fetch,
 *  extraction, or Gemini) is simply left out of the returned map -- report.ts falls back
 *  to that article's existing short summary rather than dropping it or failing the run. */
export async function analyzeCandidatesDeep(
  candidates: ReportCandidate[],
  deadlineMs?: number,
): Promise<Map<number, CandidateDeepResult>> {
  const results = new Map<number, CandidateDeepResult>();

  for (const candidate of candidates) {
    if (deadlineMs !== undefined && Date.now() >= deadlineMs) break;

    const fullText = await extractArticleText(candidate.url);
    if (!fullText) continue;

    try {
      const deep = await analyzeDeep(candidate.title, fullText);
      results.set(candidate.id, { articleId: candidate.id, ...deep });
    } catch {
      continue;
    }
  }

  return results;
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- --run tests/reportAnalysis.test.ts`
Expected: PASS, 4 tests green.

- [ ] **Step 10: Typecheck and commit**

```bash
npm run typecheck
git add src/lib/reportAnalysis.ts tests/reportAnalysis.test.ts
git commit -m "Add reportAnalysis: deep-analysis orchestration with a time-budget guard"
```

---

### Task 6: Docx report builder

**Files:**
- Create: `src/lib/report.ts`
- Test: `tests/report.test.ts`
- Modify: `package.json` (add `docx`)

**Interfaces:**
- Consumes: `ReportCandidate` (Task 3), `CandidateDeepResult` (Task 5).
- Produces:
  ```ts
  export interface ReportBullet { text: string; subBullets: string[] }
  export interface ReportItem { headline: string; note: string | null; bullets: ReportBullet[] }
  export interface ReportSection { title: string; items: ReportItem[] }

  export function buildReportSections(
    candidates: ReportCandidate[],
    deepResults: Map<number, CandidateDeepResult>,
    fallbackSummaries: Map<number, string>,
  ): ReportSection[]

  export async function buildReportDocx(
    sections: ReportSection[],
    dateLabel: string,
    teamLabel: string,
  ): Promise<Buffer>
  ```
  Task 7 consumes `ReportSection` and `buildReportSections`'s output. Task
  9 consumes `buildReportDocx`.

- [ ] **Step 1: Install dependency**

```bash
npm install docx
```

#### Part A: `buildReportSections` — routing logic

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { buildReportSections } from '@/lib/report';
import type { ReportCandidate } from '@/lib/reportCandidates';
import type { CandidateDeepResult } from '@/lib/reportAnalysis';

function makeCandidate(overrides: Partial<ReportCandidate>): ReportCandidate {
  return {
    id: 1,
    title: '기본 제목',
    url: 'https://example.com/a',
    tags: [],
    priority: 'high',
    outletCount: 1,
    isMultiOutlet: false,
    ...overrides,
  };
}

describe('buildReportSections', () => {
  it('routes a high candidate into its Gemini-decided category section', () => {
    const candidates = [makeCandidate({ id: 1, title: '지텍정 약가협상' })];
    const deep = new Map<number, CandidateDeepResult>([
      [1, { articleId: 1, category: '국내 보험·제도', note: null, bullets: [{ text: 't', subBullets: [] }] }],
    ]);

    const sections = buildReportSections(candidates, deep, new Map());

    expect(sections).toEqual([
      { title: '국내 보험·제도', items: [{ headline: '지텍정 약가협상', note: null, bullets: [{ text: 't', subBullets: [] }] }] },
    ]);
  });

  it('routes a multi-outlet, non-high candidate into 다수매체 보도 regardless of its category', () => {
    const candidates = [makeCandidate({ id: 2, title: 'GC녹십자 mRNA', priority: 'medium', outletCount: 4, isMultiOutlet: true })];
    const deep = new Map<number, CandidateDeepResult>([
      [2, { articleId: 2, category: '국내 산업', note: null, bullets: [] }],
    ]);

    const sections = buildReportSections(candidates, deep, new Map());

    expect(sections).toEqual([
      { title: '다수매체 보도', items: [{ headline: 'GC녹십자 mRNA', note: '국내 4개 매체 보도', bullets: [] }] },
    ]);
  });

  it('prefixes the outlet-count note onto an existing glossary note for multi-outlet items', () => {
    const candidates = [makeCandidate({ id: 3, priority: 'low', outletCount: 3, isMultiOutlet: true })];
    const deep = new Map<number, CandidateDeepResult>([
      [3, { articleId: 3, category: 'Global', note: '용어 설명', bullets: [] }],
    ]);

    const sections = buildReportSections(candidates, deep, new Map());

    expect(sections[0].items[0].note).toBe('국내 3개 매체 보도 — 용어 설명');
  });

  it('falls back to the existing short summary as a single bullet when deep analysis is missing', () => {
    const candidates = [makeCandidate({ id: 4, title: '높음인데 딥분석 실패' })];

    const sections = buildReportSections(candidates, new Map(), new Map([[4, '기존 짧은 요약문']]));

    expect(sections).toEqual([
      { title: '국내 산업', items: [{ headline: '높음인데 딥분석 실패', note: null, bullets: [{ text: '기존 짧은 요약문', subBullets: [] }] }] },
    ]);
  });

  it('keeps the fixed section order and omits empty sections', () => {
    const candidates = [
      makeCandidate({ id: 1, priority: 'high' }),
      makeCandidate({ id: 2, priority: 'medium', outletCount: 3, isMultiOutlet: true }),
    ];
    const deep = new Map<number, CandidateDeepResult>([
      [1, { articleId: 1, category: 'Global', note: null, bullets: [] }],
      [2, { articleId: 2, category: '국내 산업', note: null, bullets: [] }],
    ]);

    const sections = buildReportSections(candidates, deep, new Map());

    expect(sections.map((s) => s.title)).toEqual(['Global', '다수매체 보도']);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- --run tests/report.test.ts`
Expected: FAIL with "Cannot find module '@/lib/report'".

- [ ] **Step 4: Implement `buildReportSections`**

Create `src/lib/report.ts` with:

```ts
import type { ReportCandidate } from './reportCandidates';
import type { CandidateDeepResult } from './reportAnalysis';

export interface ReportBullet {
  text: string;
  subBullets: string[];
}

export interface ReportItem {
  headline: string;
  note: string | null;
  bullets: ReportBullet[];
}

export interface ReportSection {
  title: string;
  items: ReportItem[];
}

type SectionName = '국내 보험·제도' | '국내 산업' | 'Global' | '다수매체 보도';
const SECTION_ORDER: SectionName[] = ['국내 보험·제도', '국내 산업', 'Global', '다수매체 보도'];

/** items with no deep analysis (fetch/extraction/Gemini all failed for it, or the
 *  deadline was reached first) fall back to this default category -- an honest,
 *  simple catch-all rather than guessing from tags. */
const FALLBACK_CATEGORY: SectionName = '국내 산업';

export function buildReportSections(
  candidates: ReportCandidate[],
  deepResults: Map<number, CandidateDeepResult>,
  fallbackSummaries: Map<number, string>,
): ReportSection[] {
  const byName = new Map<SectionName, ReportItem[]>(SECTION_ORDER.map((name) => [name, []]));

  for (const candidate of candidates) {
    const deep = deepResults.get(candidate.id);

    let note = deep?.note ?? null;
    const bullets: ReportBullet[] = deep
      ? deep.bullets
      : [{ text: fallbackSummaries.get(candidate.id) ?? candidate.title, subBullets: [] }];

    const sectionName: SectionName = candidate.isMultiOutlet
      ? '다수매체 보도'
      : (deep?.category ?? FALLBACK_CATEGORY);

    if (candidate.isMultiOutlet) {
      const outletNote = `국내 ${candidate.outletCount}개 매체 보도`;
      note = note ? `${outletNote} — ${note}` : outletNote;
    }

    byName.get(sectionName)!.push({ headline: candidate.title, note, bullets });
  }

  return SECTION_ORDER.map((title) => ({ title, items: byName.get(title)! })).filter(
    (section) => section.items.length > 0,
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --run tests/report.test.ts`
Expected: PASS, 5 tests green.

#### Part B: `buildReportDocx` — port the docx layout

- [ ] **Step 6: Write the failing test**

Add to `tests/report.test.ts`:

```ts
describe('buildReportDocx', () => {
  it('produces a non-empty valid docx (zip) buffer for a minimal report', async () => {
    const { buildReportDocx } = await import('@/lib/report');
    const sections = [
      {
        title: '국내 산업',
        items: [{ headline: '테스트 헤드라인', note: '테스트 노트', bullets: [{ text: '사실 1', subBullets: ['세부 1'] }] }],
      },
    ];

    const buffer = await buildReportDocx(sections, "'26.09.14 (월)", '헬스케어사업팀');

    expect(buffer.length).toBeGreaterThan(0);
    // .docx files are zip archives -- the first two bytes are always "PK"
    expect(buffer.subarray(0, 2).toString('ascii')).toBe('PK');
  });

  it('produces a valid buffer even for zero sections (nothing qualified that day)', async () => {
    const { buildReportDocx } = await import('@/lib/report');
    const buffer = await buildReportDocx([], "'26.09.14 (월)", '헬스케어사업팀');
    expect(buffer.subarray(0, 2).toString('ascii')).toBe('PK');
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- --run tests/report.test.ts`
Expected: FAIL — `buildReportDocx` is not exported yet.

- [ ] **Step 8: Implement `buildReportDocx`**

Append to `src/lib/report.ts` (this ports the manually-prototyped
`build_report.js` styling into the app, unchanged in its visual
decisions):

```ts
import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle } from 'docx';

const FONT = '바탕체';

function titlePara(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, bold: true, size: 32, font: FONT, underline: {} })],
    spacing: { after: 200 },
  });
}

function dateLinePara(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [new TextRun({ text, size: 20, font: FONT })],
    spacing: { after: 300 },
  });
}

function sectionHeadingPara(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 24, font: FONT })],
    spacing: { before: 300, after: 150 },
  });
}

function headlinePara(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: '□ ', bold: true, size: 21, font: FONT }),
      new TextRun({ text, bold: true, underline: {}, size: 21, font: FONT }),
    ],
    spacing: { before: 200, after: 40 },
    indent: { left: 460, hanging: 260 },
  });
}

function notePara(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `* ${text}`, italics: true, size: 17, font: FONT, color: '555555' })],
    spacing: { after: 60 },
    indent: { left: 800, hanging: 180 },
  });
}

function bulletPara(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: '- ', size: 20, font: FONT }),
      new TextRun({ text, size: 20, font: FONT }),
    ],
    spacing: { after: 60 },
    indent: { left: 620, hanging: 200 },
  });
}

function subBulletPara(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: '· ', size: 19, font: FONT }),
      new TextRun({ text, size: 19, font: FONT }),
    ],
    spacing: { after: 40 },
    indent: { left: 880, hanging: 200 },
  });
}

function closingPara(): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: '- 이상 -', size: 20, font: FONT })],
    spacing: { before: 400 },
  });
}

export async function buildReportDocx(
  sections: ReportSection[],
  dateLabel: string,
  teamLabel: string,
): Promise<Buffer> {
  const children: Paragraph[] = [titlePara('Healthcare Market Intelligence'), dateLinePara(`${dateLabel} / ${teamLabel}`)];

  sections.forEach((section, sectionIndex) => {
    children.push(sectionHeadingPara(`${sectionIndex + 1}. ${section.title}`));
    for (const item of section.items) {
      children.push(headlinePara(item.headline));
      if (item.note) children.push(notePara(item.note));
      for (const bullet of item.bullets) {
        children.push(bulletPara(bullet.text));
        for (const sub of bullet.subBullets) children.push(subBulletPara(sub));
      }
    }
  });

  children.push(closingPara());

  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(doc);
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test -- --run tests/report.test.ts`
Expected: PASS, all 7 tests in the file green.

- [ ] **Step 10: Typecheck and commit**

```bash
npm run typecheck
git add package.json package-lock.json src/lib/report.ts tests/report.test.ts
git commit -m "Add report.ts: section routing and docx assembly"
```

---

### Task 7: Report preview image renderer

**Files:**
- Create: `src/lib/reportImage.tsx`
- Test: `tests/reportImage.test.ts`
- Modify: `package.json` (add `@vercel/og`)

**Interfaces:**
- Consumes: `ReportSection` (Task 6).
- Produces: `export async function buildReportImage(sections: ReportSection[]): Promise<Buffer>`.
  Task 9 consumes this directly.

- [ ] **Step 1: Install dependency**

```bash
npm install @vercel/og
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { buildReportImage } from '@/lib/reportImage';

describe('buildReportImage', () => {
  it('renders a non-empty PNG buffer for a minimal report', async () => {
    const sections = [
      { title: '국내 산업', items: [{ headline: '테스트 헤드라인', note: null, bullets: [{ text: '사실 1', subBullets: [] }] }] },
    ];

    const buffer = await buildReportImage(sections);

    expect(buffer.length).toBeGreaterThan(0);
    // PNG files always start with this 8-byte magic number
    expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  it('renders without throwing when there are no sections', async () => {
    const buffer = await buildReportImage([]);
    expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- --run tests/reportImage.test.ts`
Expected: FAIL with "Cannot find module '@/lib/reportImage'".

- [ ] **Step 4: Implement**

`@vercel/og`'s `ImageResponse` renders a CSS-subset JSX tree (Satori) to a
`Response` whose body is PNG bytes — it needs every direct child of a
flex container to itself be `display: flex` or text, so the template
below keeps that constraint explicit throughout.

```tsx
import { ImageResponse } from '@vercel/og';
import type { ReportSection } from './report';

export async function buildReportImage(sections: ReportSection[]): Promise<Buffer> {
  const response = new ImageResponse(
    (
      <div style={{ display: 'flex', flexDirection: 'column', width: '800px', padding: '32px', backgroundColor: '#ffffff', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, justifyContent: 'center', marginBottom: 24 }}>
          Healthcare Market Intelligence
        </div>
        {sections.map((section, i) => (
          <div key={section.title} style={{ display: 'flex', flexDirection: 'column', marginBottom: 20 }}>
            <div style={{ display: 'flex', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              {i + 1}. {section.title}
            </div>
            {section.items.map((item) => (
              <div key={item.headline} style={{ display: 'flex', flexDirection: 'column', marginBottom: 10, paddingLeft: 12 }}>
                <div style={{ display: 'flex', fontSize: 15, fontWeight: 700 }}>□ {item.headline}</div>
                {item.bullets.slice(0, 2).map((bullet, bi) => (
                  <div key={bi} style={{ display: 'flex', fontSize: 13, color: '#333333', paddingLeft: 16 }}>
                    - {bullet.text}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    ),
    { width: 800, height: 1000 },
  );

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --run tests/reportImage.test.ts`
Expected: PASS, 2 tests green. If Satori rejects a style (unsupported CSS
property), the error message names the offending property directly —
remove or replace that property and rerun.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck` — if it complains about JSX in a `.ts` file,
confirm the file is named `reportImage.tsx` (not `.ts`) and that
`tsconfig.json`'s `jsx` option already covers it (it does — this repo is
already a Next.js/React project).

```bash
git add package.json package-lock.json src/lib/reportImage.tsx tests/reportImage.test.ts
git commit -m "Add reportImage: Satori-rendered PNG preview for email embedding"
```

---

### Task 8: Extend `sendDigestEmail` for embedded image + docx attachment

**Files:**
- Modify: `src/lib/email.ts`
- Modify: `tests/email.test.ts`

**Interfaces:**
- Consumes: `Buffer` outputs from `buildReportImage` (Task 7) and
  `buildReportDocx` (Task 6) — this task only changes `email.ts`'s
  signature to accept them, it does not call the builders itself (Task 9
  does that and passes the results in).
- Produces: `sendDigestEmail` gains two new optional trailing parameters;
  every existing call site (all calls currently pass 4-6 args) keeps
  working unchanged since the new params are optional and appended at
  the end.

- [ ] **Step 1: Confirm Resend's inline-image mechanism**

Before writing code: check Resend's current API docs (`resend.com/docs`)
for its attachment shape — specifically whether inline (`cid:`-referenced)
images are supported via a `content_id` field on the same `attachments`
array used for regular file attachments, and whether attachment content
must be base64-encoded there. Resend's API has changed shape before in
this project (see the Gemini free-tier model churn precedent) — verify
against the live docs rather than assuming the shape below is still
current, and adjust the implementation in Step 3 to match whatever the
docs say now.

- [ ] **Step 2: Write the failing test**

Add to `tests/email.test.ts`:

```ts
  it('embeds the report image at the top of the body and attaches the docx when both are provided', () => {
    const article = makeArticle({ id: 1 });
    const reportImageBuffer = Buffer.from('fake-png-bytes');
    const reportDocxBuffer = Buffer.from('fake-docx-bytes');

    const html = buildDigestHtml(
      [article],
      COUNTS,
      '9월 3일 (목)',
      'https://healthcare-radar.vercel.app',
      new Map(),
      new Map(),
      reportImageBuffer,
    );

    expect(html.indexOf('cid:report-preview')).toBeLessThan(html.indexOf(article.title));
  });

  it('omits the report image markup entirely when no report was generated that day', () => {
    const article = makeArticle({ id: 1 });
    const html = buildDigestHtml([article], COUNTS, '9월 3일 (목)', 'https://healthcare-radar.vercel.app');
    expect(html).not.toContain('cid:report-preview');
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- --run tests/email.test.ts`
Expected: FAIL — `buildDigestHtml` does not yet accept a 7th argument, so
the image markup is never present.

- [ ] **Step 4: Implement**

In `src/lib/email.ts`, extend `buildDigestHtml`'s signature and prepend
the image markup when a buffer is given:

```ts
export function buildDigestHtml(
  articles: ArticleRow[],
  counts: PriorityCounts,
  dateLabel: string,
  dashboardUrl: string,
  analysesById: Map<number, AiAnalysis> = new Map(),
  duplicatesById: Map<number, DuplicateRef[]> = new Map(),
  reportImageBuffer?: Buffer,
): string {
  const reportImageHtml = reportImageBuffer
    ? `<img src="cid:report-preview" alt="Healthcare Market Intelligence" style="max-width:100%;margin:0 0 16px;border:1px solid #e5e5e5;border-radius:8px;" />`
    : '';

  const cards = articles
    // ... existing mapping unchanged
```

(the existing body of the function continues unchanged below this point
— only the signature and the new `reportImageHtml` prefix are added; find
where the function currently starts assembling the returned HTML string
and prepend `reportImageHtml` to it.)

Then extend `sendDigestEmail` to accept and pass through the two buffers,
and add them to the Resend request body once Step 1's verification
confirms the exact attachment field names:

```ts
export async function sendDigestEmail(
  articles: ArticleRow[],
  counts: PriorityCounts,
  dateLabel: string,
  analysesById: Map<number, AiAnalysis> = new Map(),
  duplicatesById: Map<number, DuplicateRef[]> = new Map(),
  reportImageBuffer?: Buffer,
  reportDocxBuffer?: Buffer,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.EMAIL_TO;
  if (!apiKey || !to) throw new Error('RESEND_API_KEY or EMAIL_TO is not set');

  const html = buildDigestHtml(
    articles,
    counts,
    dateLabel,
    resolveDashboardUrl(),
    analysesById,
    duplicatesById,
    reportImageBuffer,
  );

  const attachments: Array<{ filename: string; content: string; content_id?: string }> = [];
  if (reportImageBuffer) {
    attachments.push({ filename: 'report-preview.png', content: reportImageBuffer.toString('base64'), content_id: 'report-preview' });
  }
  if (reportDocxBuffer) {
    attachments.push({ filename: `healthcare-market-intelligence-${dateLabel}.docx`, content: reportDocxBuffer.toString('base64') });
  }

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to,
      subject: `헬스케어 레이더 ${dateLabel}`,
      html,
      ...(attachments.length > 0 ? { attachments } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend API error ${res.status}: ${await res.text()}`);
  }
}
```

(keep whatever the existing subject-line construction and `from` handling
already were — the block above shows only the parts that change; do not
remove existing logic not shown here.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- --run tests/email.test.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add src/lib/email.ts tests/email.test.ts
git commit -m "Extend sendDigestEmail with report image embedding and docx attachment"
```

---

### Task 9: Wire the report pipeline into the daily cron

**Files:**
- Modify: `src/app/api/cron/collect/route.ts`

**Interfaces:**
- Consumes: `getCandidatesForReport` (Task 3), `analyzeCandidatesDeep`
  (Task 5), `buildReportSections` + `buildReportDocx` (Task 6),
  `buildReportImage` (Task 7), extended `sendDigestEmail` (Task 8).
- Produces: the route's JSON response gains a `report` status field,
  following the existing `ai`/`dedupe`/`email`/`kakao` pattern.

No dedicated unit test — this route has none today (it's an integration
of many already-tested pieces, verified against real production data via
the project's established temp-route-then-curl-then-delete workflow, same
as every other cron change so far this project).

- [ ] **Step 1: Add the weekday/date-range helper**

In `src/app/api/cron/collect/route.ts`, add near the top (after the
existing imports):

```ts
import { getCandidatesForReport } from '@/lib/reportCandidates';
import { analyzeCandidatesDeep } from '@/lib/reportAnalysis';
import { buildReportSections, buildReportDocx } from '@/lib/report';
import { buildReportImage } from '@/lib/reportImage';
import { getAiAnalysesForArticles as getAiSummariesForFallback } from '@/lib/db';

const REPORT_RESERVE_MS = 90_000;

/** returns the KST collected-date(s) this report run should cover, or null on a
 *  weekend (no report). Monday rolls up Saturday+Sunday+Monday since a weekend's volume
 *  is too thin to deserve its own report -- everything else covers just that one day. */
function reportDateRange(collectedDate: string): string[] | null {
  const day = new Date(`${collectedDate}T00:00:00+09:00`).getDay(); // 0=Sun ... 6=Sat
  if (day === 0 || day === 6) return null; // Saturday/Sunday: no report
  if (day === 1) {
    const d = new Date(`${collectedDate}T00:00:00+09:00`);
    const sat = new Date(d);
    sat.setDate(d.getDate() - 2);
    const sun = new Date(d);
    sun.setDate(d.getDate() - 1);
    const toDateStr = (x: Date) => x.toISOString().slice(0, 10);
    return [toDateStr(sat), toDateStr(sun), collectedDate];
  }
  return [collectedDate];
}
```

- [ ] **Step 2: Add the report-generation phase to the `GET` handler**

Find the existing block that already computes `collectedDate`, runs `ai`
and `dedupe`, and then calls `sendEmailDigest`/`sendKakaoDigest`. Insert
the report phase between `dedupe` and the final `loadBatch`/email call,
and thread its results into `sendEmailDigest`:

```ts
    const dedupe = await demoteDuplicatePriorities(postAiArticles)
      .then((r) => `demoted ${r.demoted} across ${r.groups} groups`)
      .catch((err) => `error: ${err instanceof Error ? err.message : String(err)}`);

    let report = 'no-report-today';
    let reportImageBuffer: Buffer | undefined;
    let reportDocxBuffer: Buffer | undefined;
    const reportDates = reportDateRange(collectedDate);
    if (reportDates) {
      try {
        const candidates = await getCandidatesForReport(reportDates);
        const reportDeadline = routeStart + maxDuration * 1000 - REPORT_RESERVE_MS;
        const deepResults = await analyzeCandidatesDeep(candidates, reportDeadline);

        const missingIds = candidates.filter((c) => !deepResults.has(c.id)).map((c) => c.id);
        const fallbackAnalyses = await getAiSummariesForFallback(missingIds);
        const fallbackSummaries = new Map(fallbackAnalyses.map((a) => [a.articleId, a.summary]));

        const sections = buildReportSections(candidates, deepResults, fallbackSummaries);
        reportDocxBuffer = await buildReportDocx(sections, formatKstDate(collectedDate), '헬스케어사업팀');
        reportImageBuffer = await buildReportImage(sections);
        report = `sections ${sections.length}, deep-analyzed ${deepResults.size}/${candidates.length}`;
      } catch (err) {
        report = `error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
```

- [ ] **Step 3: Pass the buffers through to the email send**

Find the existing `sendEmailDigest` helper function (defined near the top
of the same file, above `GET`) and extend it to accept and forward the
two buffers:

```ts
async function sendEmailDigest(
  batch: LatestBatch,
  reportImageBuffer?: Buffer,
  reportDocxBuffer?: Buffer,
): Promise<string> {
  if (batch.articles.length === 0) return 'no-articles';
  const analyses = await getAiAnalysesForArticles(batch.articles.map((a) => a.id));
  const analysesById = new Map(analyses.map((a) => [a.articleId, a]));
  const duplicatesById = await getDuplicatesOf(batch.articles.map((a) => a.id));
  await sendDigestEmail(
    batch.articles,
    batch.counts,
    formatKstDate(batch.collectedDate),
    analysesById,
    duplicatesById,
    reportImageBuffer,
    reportDocxBuffer,
  );
  return 'sent';
}
```

Then update the call site to pass the two buffers computed in Step 2, and
add `report` to the final JSON response:

```ts
    email = await sendEmailDigest(batch, reportImageBuffer, reportDocxBuffer).catch(
      (err) => `error: ${err instanceof Error ? err.message : String(err)}`,
    );
```

```ts
  return NextResponse.json({ summary, email, kakao, ai, dedupe, report });
```

- [ ] **Step 4: Typecheck and build**

```bash
npm run typecheck
npm run build
```

Expected: both clean, matching the project's established verification
discipline before any deploy.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/collect/route.ts
git commit -m "Wire the deep-analysis report pipeline into the daily cron"
```

- [ ] **Step 6: Verify against real production data**

Follow the project's established workflow: create a temporary
`CRON_SECRET`-protected route (e.g. `src/app/api/test-report/route.ts`)
that calls `getCandidatesForReport` for today's date and returns the
candidate list as JSON (a cheap way to sanity-check the DB query and
routing logic without spending a full Gemini deep-analysis quota or
sending a live email) → commit/push → poll production until it deploys →
`curl` it with the `CRON_SECRET` bearer token → inspect the result →
`git rm` the route and push again → poll until 404 confirms removal. Once
that looks right, do one full end-to-end check by manually triggering the
real `/api/cron/collect` route on a weekday and confirming the received
email contains the embedded image and docx attachment, and that the
attached `.docx` opens correctly.

---

## Self-Review

**Spec coverage:**
- §2 content policy → Task 6's `buildReportSections` routing rules and
  tests.
- §3 document style → Task 6's `buildReportDocx` (ported verbatim from
  the validated manual prototype).
- §4 deep analysis (fetch + Readability + Gemini, category/note/bullets
  shape, no persistence, per-candidate fallback) → Tasks 4, 5.
- §5 reducing first-pass AI load → Task 1.
- §6 time budget accounting → Task 9's `REPORT_RESERVE_MS` and the
  `reportDeadline` passed into `analyzeCandidatesDeep`.
- §7 email image rendering via `@vercel/og` → Task 7.
- §8 module list → matches the files created/modified across Tasks 1-9
  one-to-one.
- Weekday-only + Monday rollup scheduling → Task 9's `reportDateRange`.
- Email body image + digest below + docx attachment → Task 8.

**Placeholder scan:** no TBD/TODO markers; the one open item (Resend's
exact attachment field names) is explicitly called out as a
verify-before-implementing step in Task 8, Step 1, not left vague in the
implementation itself.

**Type consistency:** `ReportCandidate` (Task 3) is consumed identically
in Tasks 5 and 6; `CandidateDeepResult` (Task 5) is consumed identically
in Task 6; `ReportSection`/`ReportItem`/`ReportBullet` (Task 6) are
consumed identically in Tasks 7 and 9. `buildReportDocx` and
`buildReportImage` both take `ReportSection[]` as their first/only
argument, matching how Task 9 calls them.
