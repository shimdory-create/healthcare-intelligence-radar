import { NextRequest, NextResponse } from 'next/server';
import { collectAll } from '@/lib/collect';
import { getRecentArticles, getLatestCollectionDate } from '@/lib/db';
import { enrichArticles } from '@/lib/aiEnrichment';
import { demoteDuplicatePriorities } from '@/lib/duplicates';
import { isNonBusinessDay } from '@/lib/holidays';
import { todayKstDate } from '@/lib/dateFormat';

// Collect + AI-enrich + dedupe only -- no report, no email/kakao send. Triggered several
// times during KST business hours (see the GitHub Actions workflow) so each run only has a
// couple of hours' worth of new articles to handle, instead of the once-daily
// /api/cron/collect run cramming a full day's volume into one pass, which is what made
// collection alone take 100+ seconds and left almost no time budget for AI analysis (found
// live 2026-09-17/18 -- see project memory). /api/cron/collect still runs once a day at
// 07:00 KST for a final catch-up pass plus the report/send step.
export const maxDuration = 200;

const AI_RESERVE_MS = 30_000;

export async function GET(req: NextRequest) {
  const routeStart = Date.now();
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // near-zero real news volume on weekends/holidays (see project memory's publish-time
  // histogram) -- skip the whole pass rather than burn a run for nothing. Collection isn't
  // lost: the daily 07:00 report run still does its own catch-up pass every day regardless.
  if (isNonBusinessDay(todayKstDate())) {
    return NextResponse.json({ summary: 'skipped: non-business day' });
  }

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

  return NextResponse.json({ summary, ai, dedupe });
}
