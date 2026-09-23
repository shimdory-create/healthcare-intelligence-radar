import { NextRequest, NextResponse } from 'next/server';
import { collectAll } from '@/lib/collect';
import {
  getRecentArticles,
  getPriorityCounts,
  getLatestCollectionDate,
  getAiAnalysesForArticles,
  getDuplicatesOf,
  getAppSetting,
  setAppSetting,
  recordPipelineRun,
  pruneOldData,
  type ArticleRow,
  type PriorityCounts,
} from '@/lib/db';
import { formatKstDate, formatReportDate, todayKstDate } from '@/lib/dateFormat';
import { sendDigestEmail, resolveDashboardUrl } from '@/lib/email';
import { sendKakaoMemo } from '@/lib/kakao';
import { enrichArticles } from '@/lib/aiEnrichment';
import { demoteDuplicatePriorities } from '@/lib/duplicates';
import { getCandidatesForReport } from '@/lib/reportCandidates';
import { analyzeCandidatesDeep } from '@/lib/reportAnalysis';
import { buildReportSections, buildReportDocx, buildReportEmailHtml } from '@/lib/report';
import { datesSince, previousKstDate } from '@/lib/reportSchedule';
import { isNonBusinessDay } from '@/lib/holidays';

export const maxDuration = 300;

// Runs once daily at 08:00 KST -- moved from 07:00 on 2026-09-19 so the report captures as
// much of the morning news cycle as possible (delivery lands 08:00-09:00 given the route's
// own run time). The ~06:00 KST publish spike (see project memory's publish-time histogram)
// is already pre-collected and AI-analyzed by the 06:00 intraday run (see /api/cron/enrich's
// doc comment); this route's own collectAll()/enrichArticles() call below is just the final
// overnight (00:00-08:00) catch-up pass for whatever came in after that, plus the
// report/send step. The intraday schedule deliberately has no 08:00 slot of its own -- this
// route's catch-up pass already covers it, so a separate intraday run at the same time would
// just duplicate the work.
//
// INVARIANT: aiDeadline must always be meaningfully earlier than reportDeadline. AI
// enrichment runs first, and the deep-analysis report phase (below) needs real wall-clock
// time left over after AI finishes -- if reportDeadline is earlier (or too close), AI
// running its full budget silently leaves no time for the report phase to do anything at all.
const AI_RESERVE_MS = 170_000;

// Same reasoning as AI_RESERVE_MS: the deep-analysis report phase (fetch + Readability +
// Gemini per candidate) gets its own deadline, reserved out of the same overall wall-clock
// budget, so loadBatch + email + kakao always still get their turn. Must stay meaningfully
// smaller than AI_RESERVE_MS (i.e. reportDeadline meaningfully later than aiDeadline).
const REPORT_RESERVE_MS = 80_000;

// app_settings key holding the KST date ('YYYY-MM-DD') this route last successfully emailed
// through -- see reportSchedule.ts's datesSince for why "since the last report" replaced the
// old business-day-calendar rollup once collection moved to several times a day.
const LAST_REPORT_DATE_KEY = 'last_report_date';

interface ReportBatch {
  reportDates: string[];
  articles: ArticleRow[];
  counts: PriorityCounts;
}

async function loadBatch(reportDates: string[]): Promise<ReportBatch> {
  const [{ articles }, counts] = await Promise.all([
    getRecentArticles({ collectedDate: reportDates, limit: 500 }),
    getPriorityCounts(reportDates),
  ]);
  return { reportDates, articles, counts };
}

async function sendEmailDigest(
  batch: ReportBatch,
  labelDate: string,
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
    formatKstDate(labelDate),
    analysesById,
    duplicatesById,
    reportHtml,
    reportDocxBuffer,
    labelDate,
  );
  return 'sent';
}

async function sendKakaoDigest(batch: ReportBatch, labelDate: string): Promise<string> {
  if (batch.articles.length === 0) return 'no-articles';
  const { counts } = batch;
  const text = `🩺 헬스케어 레이더\n${formatKstDate(labelDate)} 수집 · 총 ${counts.total}건\n🔴 높음 ${counts.high} · 🟡 보통 ${counts.medium} · ⚪ 참고 ${counts.low}`;
  await sendKakaoMemo(text, resolveDashboardUrl());
  return 'sent';
}

export async function GET(req: NextRequest) {
  const routeStart = Date.now();
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // final overnight catch-up -- runs every day regardless of business-day status, same
  // reasoning as before: collection/AI/dedupe must never silently stop just because today
  // happens to be a non-business day, or a later business day's watermark-driven report
  // would be missing whatever came in today.
  const summary = await collectAll();
  const collectedDate = await getLatestCollectionDate();

  let ai = 'no-collection-date';
  let dedupe = 'no-collection-date';
  if (collectedDate) {
    const preAiArticles = await getRecentArticles({ collectedDate, limit: 500 }).then((p) => p.articles);
    const aiDeadline = routeStart + maxDuration * 1000 - AI_RESERVE_MS;
    ai = await enrichArticles(preAiArticles, aiDeadline)
      .then((r) => {
        let base = r.skipped ?? `analyzed ${r.analyzed}, cached ${r.cached}`;
        if (r.failedBatches > 0) base += `, failed-batches ${r.failedBatches}`;
        return r.stoppedEarly ? `${base} (stopped early: time budget)` : base;
      })
      .catch((err) => `error: ${err instanceof Error ? err.message : String(err)}`);

    const postAiArticles = await getRecentArticles({ collectedDate, limit: 500 }).then((p) => p.articles);
    dedupe = await demoteDuplicatePriorities(postAiArticles)
      .then((r) => `demoted ${r.demoted} across ${r.groups} groups`)
      .catch((err) => `error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const today = todayKstDate();
  let email = 'no-collection-date';
  let kakao = 'no-collection-date';
  let report = 'no-collection-date';

  if (collectedDate) {
    if (isNonBusinessDay(today)) {
      // nothing sent today -- whatever's pending (including today's own catch-up pass
      // above) stays queued, and the watermark is left untouched, so the next business
      // day's report reaches back and picks all of it up in one go (see datesSince).
      email = 'skipped: non-business day';
      kakao = 'skipped: non-business day';
      report = 'skipped: non-business day';
    } else {
      const lastReportDate = (await getAppSetting(LAST_REPORT_DATE_KEY)) ?? previousKstDate(today);
      const reportDates = datesSince(lastReportDate, today);

      if (reportDates.length === 0) {
        email = 'skipped: no new articles since last report';
        kakao = 'skipped: no new articles since last report';
        report = 'no-new-articles-since-last-report';
      } else {
        let reportHtml: string | undefined;
        let reportDocxBuffer: Buffer | undefined;
        const reportDeadline = routeStart + maxDuration * 1000 - REPORT_RESERVE_MS;

        if (Date.now() >= reportDeadline) {
          report = 'skipped: time budget exhausted before render';
        } else {
          try {
            const candidates = await getCandidatesForReport(reportDates);
            const { results: deepResults, skipped } = await analyzeCandidatesDeep(candidates, reportDeadline);

            if (Date.now() >= reportDeadline) {
              report = 'skipped: time budget exhausted before render';
            } else {
              const sections = buildReportSections(candidates, deepResults);
              reportDocxBuffer = await buildReportDocx(sections, formatReportDate(today), '헬스케어사업팀');
              reportHtml = buildReportEmailHtml(sections, formatReportDate(today));

              const excludedIrrelevant = candidates.filter(
                (c) => deepResults.has(c.id) && !deepResults.get(c.id)!.isRelevant,
              ).length;
              const skipCounts = skipped.reduce<Record<string, number>>((acc, s) => {
                acc[s.reason] = (acc[s.reason] ?? 0) + 1;
                return acc;
              }, {});
              report = `dates ${reportDates.join(',')}, sections ${sections.length}, deep-analyzed ${deepResults.size}/${candidates.length}, excluded-irrelevant ${excludedIrrelevant}, skipped ${JSON.stringify(skipCounts)}`;
            }
          } catch (err) {
            report = `error: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        const batch = await loadBatch(reportDates);
        email = await sendEmailDigest(batch, today, reportHtml, reportDocxBuffer).catch(
          (err) => `error: ${err instanceof Error ? err.message : String(err)}`,
        );
        kakao = await sendKakaoDigest(batch, today).catch(
          (err) => `error: ${err instanceof Error ? err.message : String(err)}`,
        );

        // only advance the watermark once the email actually went out (or genuinely had
        // nothing to send) -- if it errored, leave it be so the next run's range still
        // reaches back and retries the same content, instead of silently losing a day's
        // digest to a transient send failure. Kakao is a secondary channel and doesn't
        // gate this.
        if (!email.startsWith('error')) {
          await setAppSetting(LAST_REPORT_DATE_KEY, today);
        }
      }
    }
  }

  await recordPipelineRun({
    route: 'collect',
    startedAt: new Date(routeStart),
    finishedAt: new Date(),
    aiResult: ai,
    dedupeResult: dedupe,
    reportResult: report,
    emailResult: email,
    kakaoResult: kakao,
  }).catch(() => {});

  // once-daily retention sweep -- keeps this Supabase free-tier project's storage from growing
  // unbounded forever (see pruneOldData's doc comment). Runs after everything else so a slow
  // prune never competes with the time-critical report/send work; failure here must never fail
  // the whole route, same reasoning as recordPipelineRun above.
  const prune = await pruneOldData()
    .then((r) => `articles ${r.articlesDeleted}, pipeline_runs ${r.pipelineRunsDeleted}`)
    .catch((err) => `error: ${err instanceof Error ? err.message : String(err)}`);

  return NextResponse.json({ summary, email, kakao, ai, dedupe, report, prune });
}
