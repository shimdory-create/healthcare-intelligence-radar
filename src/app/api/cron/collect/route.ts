import { NextRequest, NextResponse } from 'next/server';
import { collectAll } from '@/lib/collect';
import {
  getRecentArticles,
  getPriorityCounts,
  getLatestCollectionDate,
  getAiAnalysesForArticles,
  getDuplicatesOf,
  type ArticleRow,
  type PriorityCounts,
} from '@/lib/db';
import { formatKstDate, formatReportDate } from '@/lib/dateFormat';
import { sendDigestEmail, resolveDashboardUrl } from '@/lib/email';
import { sendKakaoMemo } from '@/lib/kakao';
import { enrichArticles } from '@/lib/aiEnrichment';
import { demoteDuplicatePriorities } from '@/lib/duplicates';
import { getCandidatesForReport } from '@/lib/reportCandidates';
import { analyzeCandidatesDeep } from '@/lib/reportAnalysis';
import { buildReportSections, buildReportDocx, buildReportEmailHtml } from '@/lib/report';
import { reportDateRange } from '@/lib/reportSchedule';
import { isNonBusinessDay } from '@/lib/holidays';

export const maxDuration = 300;

// Vercel hard-kills this function at maxDuration with no chance for any try/catch to run --
// so AI enrichment gets its own deadline, well short of that limit, leaving enough of the
// budget for dedupe + email + kakao (all fast: DB-only or a single outbound call each) to
// always get their turn even when Gemini is unusually slow that day.
//
// INVARIANT: aiDeadline must always be meaningfully earlier than reportDeadline. AI
// enrichment runs first, and the deep-analysis report phase (below) needs real wall-clock
// time left over after AI finishes -- if reportDeadline is earlier (or too close), AI
// running its full budget (it has, in production, on 2026-09-10 and 2026-09-11) silently
// leaves no time for the report phase to do anything at all. Values here match the design
// spec's own §6 time-budget table (aiDeadline = routeStart + 130s, reportDeadline =
// routeStart + 220s).
const AI_RESERVE_MS = 170_000;

// Same reasoning as AI_RESERVE_MS: the deep-analysis report phase (fetch + Readability +
// Gemini per candidate) gets its own deadline, reserved out of the same overall wall-clock
// budget, so dedupe + loadBatch + email + kakao always still get their turn. See the
// INVARIANT note on AI_RESERVE_MS above -- this must stay meaningfully smaller than
// AI_RESERVE_MS (i.e. reportDeadline meaningfully later than aiDeadline).
const REPORT_RESERVE_MS = 80_000;

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
  reportHtml?: string,
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
    reportHtml,
    reportDocxBuffer,
    batch.collectedDate,
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
        let base = r.skipped ?? `analyzed ${r.analyzed}, cached ${r.cached}`;
        if (r.failedBatches > 0) base += `, failed-batches ${r.failedBatches}`;
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

    // deep-analysis report phase (fetch + extract + Gemini per candidate, then docx + a plain
    // HTML rendering for the email body) -- isolated by its own catch, same as ai/dedupe above,
    // so a failure here (or running out of its reserved time budget) never blocks the daily
    // email/kakao send.
    let reportHtml: string | undefined;
    let reportDocxBuffer: Buffer | undefined;
    const reportDates = reportDateRange(collectedDate);
    const reportDeadline = routeStart + maxDuration * 1000 - REPORT_RESERVE_MS;
    if (!reportDates) {
      report = 'no-report-today';
    } else if (Date.now() >= reportDeadline) {
      // Time budget is already exhausted (e.g. AI enrichment ran long) -- skip the whole
      // report phase, including the initial candidate fetch, rather than spend a DB
      // round-trip on a phase that has no time left to produce anything.
      report = 'skipped: time budget exhausted before render';
    } else {
      try {
        const candidates = await getCandidatesForReport(reportDates);
        const { results: deepResults, skipped } = await analyzeCandidatesDeep(candidates, reportDeadline);

        if (Date.now() >= reportDeadline) {
          // Time budget ran out during analyzeCandidatesDeep (it returned early/empty) --
          // skip building the docx entirely rather than let its unbounded latency eat into
          // the margin reserved for loadBatch/email/kakao below.
          report = 'skipped: time budget exhausted before render';
        } else {
          const sections = buildReportSections(candidates, deepResults);
          reportDocxBuffer = await buildReportDocx(sections, formatReportDate(collectedDate), '헬스케어사업팀');
          reportHtml = buildReportEmailHtml(sections, formatReportDate(collectedDate));

          // surfaces WHY a candidate isn't in the report, right in this response, instead of
          // needing a fresh temporary diagnostic route every time one goes missing -- see
          // DeepAnalysisSkipReason's doc comment for what each skip reason means, and
          // report.ts's isRelevant check for why a deep-analyzed candidate can still be
          // excluded (a real result, just judged to have no business relevance).
          const excludedIrrelevant = candidates.filter(
            (c) => deepResults.has(c.id) && !deepResults.get(c.id)!.isRelevant,
          ).length;
          const skipCounts = skipped.reduce<Record<string, number>>((acc, s) => {
            acc[s.reason] = (acc[s.reason] ?? 0) + 1;
            return acc;
          }, {});
          report = `sections ${sections.length}, deep-analyzed ${deepResults.size}/${candidates.length}, excluded-irrelevant ${excludedIrrelevant}, skipped ${JSON.stringify(skipCounts)}`;
        }
      } catch (err) {
        report = `error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    if (isNonBusinessDay(collectedDate)) {
      // Collection, AI enrichment, dedupe, and (on Mondays) the rolled-up report still run
      // every day -- skipping them on non-business days would either leave that day's
      // priorities unclassified when a later business day needs them, or force a multi-day
      // backlog through one run's time budget. Only the actual send is skipped here.
      email = 'skipped: non-business day';
      kakao = 'skipped: non-business day';
    } else {
      // re-fetched again so the batch reflects both AI-updated and dedupe-demoted priorities
      // rather than an earlier snapshot
      const batch = await loadBatch(collectedDate);

      email = await sendEmailDigest(batch, reportHtml, reportDocxBuffer).catch(
        (err) => `error: ${err instanceof Error ? err.message : String(err)}`,
      );
      kakao = await sendKakaoDigest(batch).catch((err) => `error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ summary, email, kakao, ai, dedupe, report });
}
