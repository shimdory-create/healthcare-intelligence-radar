import { NextRequest, NextResponse } from 'next/server';
import { collectAll } from '@/lib/collect';
import {
  getRecentArticles,
  getPriorityCounts,
  getLatestCollectionDate,
  getAiAnalysesForArticles,
  getAiAnalysesForArticles as getAiSummariesForFallback,
  getDuplicatesOf,
  type ArticleRow,
  type PriorityCounts,
} from '@/lib/db';
import { formatKstDate } from '@/lib/dateFormat';
import { sendDigestEmail, resolveDashboardUrl } from '@/lib/email';
import { sendKakaoMemo } from '@/lib/kakao';
import { enrichArticles } from '@/lib/aiEnrichment';
import { demoteDuplicatePriorities } from '@/lib/duplicates';
import { getCandidatesForReport } from '@/lib/reportCandidates';
import { analyzeCandidatesDeep } from '@/lib/reportAnalysis';
import { buildReportSections, buildReportDocx } from '@/lib/report';
import { buildReportImage } from '@/lib/reportImage';

export const maxDuration = 300;

// Vercel hard-kills this function at maxDuration with no chance for any try/catch to run --
// so AI enrichment gets its own deadline, well short of that limit, leaving enough of the
// budget for dedupe + email + kakao (all fast: DB-only or a single outbound call each) to
// always get their turn even when Gemini is unusually slow that day.
const AI_RESERVE_MS = 60_000;

// Same reasoning as AI_RESERVE_MS: the deep-analysis report phase (fetch + Readability +
// Gemini per candidate) gets its own deadline, reserved out of the same overall wall-clock
// budget, so dedupe + loadBatch + email + kakao always still get their turn.
const REPORT_RESERVE_MS = 90_000;

/** returns the KST collected-date(s) this report run should cover, or null on a weekend (no
 *  report). Monday rolls up Saturday+Sunday+Monday since a weekend's volume is too thin to
 *  deserve its own report -- everything else covers just that one day.
 *
 *  `collectedDate` is a plain 'YYYY-MM-DD' KST calendar date (see getLatestCollectionDate in
 *  db.ts, which derives it via `at time zone 'Asia/Seoul'`). Its day-of-week is a fixed fact
 *  independent of any timezone, so this parses the components directly with Date.UTC/getUTCDay
 *  rather than `new Date(...).getDay()` -- the latter reads the *runtime's local* timezone,
 *  which on Vercel is UTC, not KST, and would silently shift every date's weekday by one. */
function reportDateRange(collectedDate: string): string[] | null {
  const [y, m, d] = collectedDate.split('-').map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  const day = new Date(utcMidnight).getUTCDay(); // 0=Sun ... 6=Sat
  if (day === 0 || day === 6) return null; // Saturday/Sunday: no report
  if (day === 1) {
    const toDateStr = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const DAY_MS = 24 * 60 * 60 * 1000;
    return [toDateStr(utcMidnight - 2 * DAY_MS), toDateStr(utcMidnight - DAY_MS), collectedDate];
  }
  return [collectedDate];
}

interface LatestBatch {
  collectedDate: string;
  articles: ArticleRow[];
  counts: PriorityCounts;
}

async function loadBatch(collectedDate: string): Promise<LatestBatch> {
  const [{ articles }, counts] = await Promise.all([
    getRecentArticles({ collectedDate, limit: 500 }),
    getPriorityCounts(collectedDate),
  ]);
  return { collectedDate, articles, counts };
}

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

async function sendKakaoDigest(batch: LatestBatch): Promise<string> {
  if (batch.articles.length === 0) return 'no-articles';
  const { counts } = batch;
  const text = `🩺 헬스케어 레이더\n${formatKstDate(batch.collectedDate)} 수집 · 총 ${counts.total}건\n🔴 높음 ${counts.high} · 🟡 보통 ${counts.medium} · ⚪ 참고 ${counts.low}`;
  await sendKakaoMemo(text, resolveDashboardUrl());
  return 'sent';
}

export async function GET(req: NextRequest) {
  const routeStart = Date.now();
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const summary = await collectAll();

  const collectedDate = await getLatestCollectionDate();

  let email = 'no-collection-date';
  let kakao = 'no-collection-date';
  let ai = 'no-collection-date';
  let dedupe = 'no-collection-date';
  let report = 'no-collection-date';
  if (collectedDate) {
    // AI runs first (and is fully isolated by its own catch) so its priority updates, if any,
    // are ready in time for today's email/kakao -- a failure here must never block delivery.
    const preAiArticles = await getRecentArticles({ collectedDate, limit: 500 }).then((p) => p.articles);
    const aiDeadline = routeStart + maxDuration * 1000 - AI_RESERVE_MS;
    ai = await enrichArticles(preAiArticles, aiDeadline)
      .then((r) => {
        const base = r.skipped ?? `analyzed ${r.analyzed}, cached ${r.cached}`;
        return r.stoppedEarly ? `${base} (stopped early: time budget)` : base;
      })
      .catch((err) => `error: ${err instanceof Error ? err.message : String(err)}`);

    // cross-outlet duplicate coverage of the same story (2+ shared tags, same day) shouldn't
    // each count as their own "high" -- demote all but the strongest one, using whatever
    // priority AI (or the rule-based fallback) just set
    const postAiArticles = await getRecentArticles({ collectedDate, limit: 500 }).then((p) => p.articles);
    dedupe = await demoteDuplicatePriorities(postAiArticles)
      .then((r) => `demoted ${r.demoted} across ${r.groups} groups`)
      .catch((err) => `error: ${err instanceof Error ? err.message : String(err)}`);

    // deep-analysis report phase (fetch + extract + Gemini per candidate, then docx + preview
    // image) -- isolated by its own catch, same as ai/dedupe above, so a failure here (or
    // running out of its reserved time budget) never blocks the daily email/kakao send.
    let reportImageBuffer: Buffer | undefined;
    let reportDocxBuffer: Buffer | undefined;
    const reportDates = reportDateRange(collectedDate);
    if (!reportDates) {
      report = 'no-report-today';
    } else {
      try {
        const candidates = await getCandidatesForReport(reportDates);
        const reportDeadline = routeStart + maxDuration * 1000 - REPORT_RESERVE_MS;
        const deepResults = await analyzeCandidatesDeep(candidates, reportDeadline);

        if (Date.now() >= reportDeadline) {
          // Time budget is already exhausted (e.g. AI enrichment ran long and analyzeCandidatesDeep
          // returned early/empty) -- skip building the docx/image entirely rather than let their
          // unbounded latency eat into the margin reserved for loadBatch/email/kakao below.
          report = 'skipped: time budget exhausted before render';
        } else {
          const missingIds = candidates.filter((c) => !deepResults.has(c.id)).map((c) => c.id);
          const fallbackAnalyses = await getAiSummariesForFallback(missingIds);
          const fallbackSummaries = new Map(fallbackAnalyses.map((a) => [a.articleId, a.summary]));

          const sections = buildReportSections(candidates, deepResults, fallbackSummaries);
          reportDocxBuffer = await buildReportDocx(sections, formatKstDate(collectedDate), '헬스케어사업팀');
          reportImageBuffer = await buildReportImage(sections);
          report = `sections ${sections.length}, deep-analyzed ${deepResults.size}/${candidates.length}`;
        }
      } catch (err) {
        report = `error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    // re-fetched again so the batch reflects both AI-updated and dedupe-demoted priorities
    // rather than an earlier snapshot
    const batch = await loadBatch(collectedDate);

    email = await sendEmailDigest(batch, reportImageBuffer, reportDocxBuffer).catch(
      (err) => `error: ${err instanceof Error ? err.message : String(err)}`,
    );
    kakao = await sendKakaoDigest(batch).catch((err) => `error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return NextResponse.json({ summary, email, kakao, ai, dedupe, report });
}
