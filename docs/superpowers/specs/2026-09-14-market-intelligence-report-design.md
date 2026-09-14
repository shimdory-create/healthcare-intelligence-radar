# Healthcare Market Intelligence Report — Design

**Goal:** Automate the "Healthcare Market Intelligence" Word report that has so
far been produced manually (Claude reading full article pages by hand and
hand-writing fact-dense bullets), and deliver it as part of the existing
daily email — an embedded preview image at the top, the existing article
digest below, and the `.docx` file attached.

**Status:** Drafted after several rounds of manual report iteration
(2026-09-14) that converged on format, category structure, and content
policy. This spec covers the automation of that already-validated format.

## 1. What "done" looks like

Every weekday morning, the existing daily cron additionally:

1. Picks the subset of that day's articles worth a deep dive (high-priority
   survivors, plus any story covered by 3+ outlets regardless of tier).
2. Fetches each one's full source page and asks Gemini for a fact-dense,
   categorized breakdown (not the existing short summary).
3. Assembles a `.docx` in the established "Daily Market Intelligence" house
   style.
4. Renders a preview image of the same content.
5. Sends the daily email with the image embedded at the top, the regular
   article digest below it (unchanged), and the `.docx` attached.

Saturday and Sunday collection continues exactly as today (regular digest
only, no report). Monday's report rolls up Saturday + Sunday + Monday's
articles into one report, since a weekend's volume is too thin to deserve
its own.

## 2. Content policy (already validated manually)

- **높음 (high) survivors** (`duplicate_of_id is null`) → full detailed
  treatment: headline, optional glossary note, fact bullets (with
  sub-bullets where useful).
- **다수매체 보도**: any story (regardless of its own priority tier) whose
  duplicate group has **3 or more total outlets** (the survivor plus 2 or
  more grouped duplicates — i.e. `count(duplicates) >= 2`) → same detailed
  treatment, in its own trailing section, noting the outlet count. (This
  fixes an inconsistency in the manual drafts, which described "3개 이상"
  but only actually promoted groups with ≥3 *followers*, i.e. ≥4 total —
  the threshold here is intentionally the more inclusive one that matches
  what was actually communicated.)
- Everything else (보통/참고 not part of a large duplicate group) is
  **omitted from the report entirely** — they're already visible in the
  regular digest below.
- Four sections, in this fixed order: **국내 보험·제도 → 국내 산업 →
  Global → 다수매체 보도**. Category is decided per-article by Gemini as
  part of the deep-analysis call (see §4) — it already has the full
  article in front of it at that point.

## 3. Document style (already validated manually)

- Font: 바탕체 throughout.
- Title centered; date + team name right-aligned below it.
- Section headings numbered (`1. 국내 보험·제도`, …).
- Each item: `□ 헤드라인` (bold+underline) → optional `* 용어설명` note →
  `- ` fact bullets → `  · ` sub-bullets for finer detail.
- Hanging indent on every marker line, so a wrapped line aligns under the
  text start, not under the marker.
- Closes with a centered `- 이상 -`.
- (Explicitly decided against: protecting specific proper nouns from
  mid-word line breaks via zero-width word-joiners — tried, user reverted
  it. Korean text wrapping mid-word is accepted as normal.)

## 4. Deep analysis: fetch + Gemini (Option B, as decided)

For each candidate article:

1. Fetch the article's own `url` server-side.
2. Extract the main article text from the raw HTML. **Library choice:
   `@mozilla/readability` + `jsdom`** (both MIT-licensed, zero-cost, the
   same engine behind Firefox Reader Mode) — far more robust across the
   24 different outlet HTML structures than hand-rolled tag-stripping.
3. Send the extracted text to Gemini with a dedicated "deep analysis"
   prompt (separate from the existing summary prompt) asking for:
   - `category`: one of `"국내 보험·제도" | "국내 산업" | "Global"`
     (다수매체 보도 placement is decided by the code from duplicate-group
     size, not by the model)
   - `note`: an optional one-line glossary/definition string, or empty
   - `bullets`: an array of fact strings (numbers, dates, entities —
     mirroring the density already demonstrated in the manual drafts)
   - `subBulletsByIndex`: optional finer-detail strings attached to a
     given bullet, for the "산도즈 vs 비아트리스 vs 바이엘" kind of
     breakdown
4. No caching/persistence for this output — unlike the existing
   `ai_analysis` cache (which exists to avoid re-spending quota on
   unchanged articles across days), the deep-analysis candidate set is
   different every day and is consumed immediately within the same
   request. Nothing new is written to the DB for this step.
5. **Failure handling**: if a fetch or Gemini call fails for one article,
   that article falls back to its existing short summary/implications
   (already in `ai_analysis`) rendered as a single bullet, rather than
   dropping it from the report or failing the whole run.

## 5. Reducing first-pass AI load (frees the time budget for §4)

`enrichArticles` (the existing first-pass batch summarizer) will skip any
article whose **rule-based priority is already `'low'`** (i.e. keyword
score is 0) — those never get sent to Gemini at all and simply keep their
rule-based priority, same as when AI is fully unconfigured. Rationale
(validated against real data): a 0-score article is either an untagged
tier-1 notice or a weak-tag-only tier-2/3 mention, and every promotion
candidate found in manual review so far already had score ≥ 1. This also
roughly halves the daily first-pass Gemini workload, which is what makes
fitting deep-analysis into the same cron run (Option A, decided) safe.

## 6. Time budget accounting (single cron run, `maxDuration = 300`)

Building on the existing `AI_RESERVE_MS` pattern in
`src/app/api/cron/collect/route.ts`:

| Phase | Existing/new | Budget |
|---|---|---|
| `collectAll()` | existing | ~100s observed, no hard cap beyond per-source 120s race |
| First-pass AI enrichment | existing, now skips score-0 articles | deadline = routeStart + 130s |
| Dedupe | existing | fast (<5s), unbudgeted |
| **Deep-report analysis** | **new** | deadline = routeStart + 220s (own stop-early guard, same pattern as §5 — remaining candidates fall back to their short summary per §4.5) |
| Build docx + image buffers | new | fast, unbudgeted |
| Send email (digest + embedded image + attachment) | existing, extended | unbudgeted (must always run) |
| Send kakao | existing | unbudgeted (must always run) |

These numbers are starting points, not final — like `AI_RESERVE_MS`, they
should be tuned empirically after real runs, the same way the current
110-item AI cutoff was discovered and is being monitored.

## 7. Email image rendering

Converting the actual `.docx` to an image was already ruled out (no
LibreOffice available, fragile in serverless). Instead, render the *same
content* directly as an image using **`@vercel/og`** (Satori under the
hood) — a JSX/HTML-subset template that mirrors the docx layout closely
enough to be recognizable, output as PNG, and embedded via Resend's
attachment-with-`content_id` mechanism (inline `cid:` image reference in
the HTML email body). This is a separate template from the docx builder
(Satori supports only a CSS subset), so the two renderers are maintained
side by side, not shared.

## 8. New/changed modules

- `src/lib/reportCandidates.ts` **(new)** — given a date (or date range
  for Monday), returns the high-priority survivors + 3+-outlet duplicate
  groups that qualify for deep treatment.
- `src/lib/reportAnalysis.ts` **(new)** — fetch + Readability extraction +
  Gemini deep-analysis call per candidate (§4).
- `src/lib/report.ts` **(new)** — groups analyzed candidates into the 4
  sections and builds the `.docx` buffer (the logic already prototyped in
  the manual `build_report.js` script, ported in).
- `src/lib/reportImage.ts` **(new)** — Satori/`@vercel/og` renderer (§7).
- `src/lib/aiEnrichment.ts` **(changed)** — skip priority `'low'` articles
  before calling Gemini (§5).
- `src/lib/email.ts` **(changed)** — `sendDigestEmail` gains optional
  `reportImageBuffer` and `reportDocxBuffer` params; when present, embeds
  the image at the top of the HTML body and attaches the docx.
- `src/app/api/cron/collect/route.ts` **(changed)** — weekday check +
  Monday-rollup date range, calls the new report pipeline, passes buffers
  to `sendDigestEmail`, adds `report` status to the JSON response
  (following the existing `ai`/`dedupe`/`email`/`kakao` status pattern).

New dependencies: `docx`, `@vercel/og`, `@mozilla/readability`, `jsdom`.
All free/MIT, no paid services introduced.

## 9. Known limitations (surfaced honestly, not solved here)

- Satori's image will not be pixel-identical to the `.docx` — it's a
  best-effort visual preview, not a document renderer.
- Article text extraction (Readability) will occasionally fail or produce
  a poor extract on unusual page layouts; §4's fallback-to-short-summary
  handles this without breaking the run.
- The 220s deep-analysis deadline is a starting estimate; real-world
  tuning (like the existing 110-item AI cutoff) should be expected and is
  not a bug when it happens.
