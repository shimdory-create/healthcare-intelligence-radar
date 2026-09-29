import { NextRequest, NextResponse } from 'next/server';
import { collectAll, type CollectionSummary } from '@/lib/collect';
import { getRecentArticles, getLatestCollectionDate, recordPipelineRun } from '@/lib/db';
import { enrichArticles } from '@/lib/aiEnrichment';
import { demoteDuplicatePriorities } from '@/lib/duplicates';
import { isNonBusinessDay } from '@/lib/holidays';
import { todayKstDate } from '@/lib/dateFormat';
import { checkAndSendCriticalAlert } from '@/lib/criticalAlert';

// Collect + AI-enrich + dedupe only -- no report, no email/kakao send. Triggered several
// times during KST business hours (see the GitHub Actions workflow) so each run only has a
// couple of hours' worth of new articles to handle, instead of the once-daily
// /api/cron/collect run cramming a full day's volume into one pass, which is what made
// collection alone take 100+ seconds and left almost no time budget for AI analysis (found
// live 2026-09-17/18 -- see project memory). /api/cron/collect still runs once a day at
// 08:00 KST for a final catch-up pass plus the report/send step.
export const maxDuration = 200;

const AI_RESERVE_MS = 30_000;

// row cap for a single getRecentArticles() call -- real daily volume already hits 300-365 on a
// busy day (found live 2026-09-29), which made the original 500 cap too close for comfort even
// for a single intraday window. See collect/route.ts's loadBatch comment for the fuller reasoning.
const LOAD_LIMIT = 3000;

export async function GET(req: NextRequest) {
  const routeStart = Date.now();
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // near-zero real news volume on weekends/holidays (see project memory's publish-time
  // histogram) -- skip the whole pass rather than burn a run for nothing. Collection isn't
  // lost: the daily 08:00 report run still does its own catch-up pass every day regardless.
  if (isNonBusinessDay(todayKstDate())) {
    return NextResponse.json({ summary: 'skipped: non-business day' });
  }

  // Wrapped in try/catch (2026-09-29) for the same reason as the 'collect' route: an unguarded
  // throw from collectAll() (e.g. syncSources() hitting a DB hiccup) used to crash this whole
  // route before recordPipelineRun/checkAndSendCriticalAlert ever ran -- see that route's
  // comment for the full reasoning.
  let summary: CollectionSummary[] | null = null;
  let collectResult: string | null = null;
  try {
    summary = await collectAll();
  } catch (err) {
    collectResult = `error: ${err instanceof Error ? err.message : String(err)}`;
  }
  const collectedDate = await getLatestCollectionDate();

  let ai = 'no-collection-date';
  let dedupe = 'no-collection-date';
  if (collectedDate) {
    const preAiArticles = await getRecentArticles({ collectedDate, limit: LOAD_LIMIT }).then((p) => p.articles);
    const aiDeadline = routeStart + maxDuration * 1000 - AI_RESERVE_MS;
    ai = await enrichArticles(preAiArticles, aiDeadline)
      .then((r) => {
        let base = r.skipped ?? `analyzed ${r.analyzed}, cached ${r.cached}`;
        if (r.failedBatches > 0) base += `, failed-batches ${r.failedBatches}`;
        return r.stoppedEarly ? `${base} (stopped early: time budget)` : base;
      })
      .catch((err) => `error: ${err instanceof Error ? err.message : String(err)}`);

    const postAiArticles = await getRecentArticles({ collectedDate, limit: LOAD_LIMIT }).then((p) => p.articles);
    dedupe = await demoteDuplicatePriorities(postAiArticles)
      .then((r) => `demoted ${r.demoted} across ${r.groups} groups`)
      .catch((err) => `error: ${err instanceof Error ? err.message : String(err)}`);
  }

  await recordPipelineRun({
    route: 'enrich',
    startedAt: new Date(routeStart),
    finishedAt: new Date(),
    collectResult,
    aiResult: ai,
    dedupeResult: dedupe,
  }).catch(() => {});

  // this route runs 12x/day, far more often than 'collect' -- checking here too (not just
  // there) means a critical issue gets noticed within ~2h instead of up to 24h. The cooldown
  // in systemHealth.ts keeps either route's checks from turning that into a flood of emails.
  const alert = await checkAndSendCriticalAlert().catch((err) => `error: ${err instanceof Error ? err.message : String(err)}`);

  return NextResponse.json({ summary, ai, dedupe, alert });
}
