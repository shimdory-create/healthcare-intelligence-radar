import type { PipelineRunRow, SourceHealthRow } from './db';

// exact strings enrichArticles() (aiEnrichment.ts) returns as its `skipped` value when AI is
// disabled by a missing/misconfigured env var, as opposed to a real Gemini failure. Defined
// here (not in aiEnrichment.ts, which imports db.ts) and imported the other way around, so this
// still-pure, no-DB-access module (see this file's own doc comment) doesn't gain a transitive
// DB dependency just for two string literals -- aiEnrichment.ts already depends on db.ts
// regardless, so importing them from here costs it nothing. In this deployment these vars are
// always meant to be set, so either string appearing at all is always a regression, never an
// intentional state, and neither matched any existing health check before 2026-09-29 (not an
// "error:" prefix, not the "analyzed N, ..." pattern) -- the whole system would silently fall
// back to keyword-only prioritization forever, with the daily digest's AI summaries just
// quietly gone.
export const AI_DISABLED_FREE_ONLY = 'FREE_ONLY is not set to true';
export const AI_DISABLED_NO_API_KEY = 'GEMINI_API_KEY is not set';

export interface SystemHealthIssue {
  severity: 'critical' | 'warning';
  message: string;
}

// covers the ~2h intraday cadence plus slack -- a gap this long means the scheduler itself
// (Vercel cron or the GitHub Actions workflow) has likely stopped firing, not just a single
// slow run.
const STALE_RUN_HOURS = 26;
// covers a long weekend/holiday rollup (Fri->Mon is 3 days) plus one day of slack -- the daily
// 08:00 'collect' route is the only one that sends the report, so a longer gap than this means
// the report itself has stopped going out.
const NO_COLLECT_DAYS = 4;
const AI_ERROR_STREAK = 2;
// collectAll() itself throwing (e.g. syncSources() hitting a DB hiccup) is now caught by both
// cron routes instead of crashing them outright (2026-09-29) -- see collect/route.ts's comment.
// That fix means recordPipelineRun/checkAndSendCriticalAlert always run even when collection
// itself failed, so this streak is what keeps a *persistent* collection failure detectable --
// without it, a route that "completes" every time (even though collectAll() failed inside it)
// would never trip STALE_RUN_HOURS/NO_COLLECT_DAYS, since those only look at whether a run was
// recorded at all, not whether it actually collected anything. Checked across ALL routes (not
// just 'collect') since 'enrich' hits collectAll() 12x/day too.
const COLLECT_ERROR_STREAK = 2;
// Kakao is a secondary channel (email is primary, see collect/route.ts's sendKakaoDigest
// comment) so this is a warning, not critical -- but before 2026-09-29 a broken Kakao channel
// (e.g. an expired OAuth refresh token) was invisible to every health check forever, since only
// emailResult was ever checked.
const KAKAO_ERROR_STREAK = 2;
// the .docx report is this project's actual deliverable (same reasoning as EMPTY_REPORT_STREAK
// above) -- before 2026-09-29, a reportResult of "error: ..." (an uncaught throw inside the
// report-generation try/catch never happens -- see report/route.ts -- but a caught one still
// produced this shape) matched neither this check nor EMPTY_REPORT_STREAK's "dates ..." pattern,
// so a persistently broken report generator could go unnoticed indefinitely as long as the
// plain digest email kept sending.
const REPORT_ERROR_STREAK = 2;
// AI enrichment silently falling back to keyword-only prioritization forever (a missing/
// misconfigured GEMINI_API_KEY or FREE_ONLY env var) was invisible to every check before
// 2026-09-29 -- see AI_DISABLED_FREE_ONLY/AI_DISABLED_NO_API_KEY's doc comment in
// aiEnrichment.ts. In this deployment these vars are always meant to be set, so this is never
// a false positive.
const AI_DISABLED_STREAK = 2;
const BROKEN_SOURCE_THRESHOLD = 5;
const SOURCE_ERROR_STREAK = 3;
// prune failures degrade slowly (DB storage grows toward the free-tier cap over roughly a
// year even if pruning never runs again -- see pruneOldData's doc comment), so this uses a
// longer streak than AI_ERROR_STREAK before surfacing anything -- a warning, not a critical.
const PRUNE_ERROR_STREAK = 3;
// a 'collect' run whose reportResult starts with "dates " actually attempted the report (as
// opposed to "skipped: non-business day"/"no-new-articles-since-last-report"/"skipped: time
// budget exhausted..."/"error: ..."), so its "sections N" count is a real signal. 2 consecutive
// such runs landing on 0 sections is the one failure mode none of the other checks above catch:
// the pipeline runs "successfully" every day (no error anywhere) but silently stops producing
// any report content -- e.g. a broken is_relevant/category classification, or every candidate
// failing the relevance gate. Critical, not warning: the report is this project's actual
// deliverable, and this means it's been empty, not just degraded.
const EMPTY_REPORT_STREAK = 2;
const REPORT_SECTIONS_PATTERN = /^dates .*sections (\d+)/;
// A Gemini call that fails is caught INSIDE enrichArticles per batch (aiEnrichment.ts's
// `catch { failedBatches++; continue; }`), so a total outage never produces an aiResult
// starting with "error" -- it returns a normal-looking "analyzed 0, cached N, failed-batches
// M" string instead, which AI_ERROR_STREAK's startsWith('error') check can't see at all.
// Found live 2026-09-28: a Gemini 503 ("model currently experiencing high demand") failed
// every single batch on a real run, and the existing check missed it entirely. Also checks
// ALL routes, not just 'collect' -- 'enrich' runs 12x/day and is where most AI calls happen,
// but the AI_ERROR_STREAK check above only ever looks at the once-daily 'collect' route.
const AI_TOTAL_FAILURE_STREAK = 2;
const AI_RESULT_PATTERN = /^analyzed (\d+), cached \d+(?:, failed-batches (\d+))?/;

function isTotalAiFailure(aiResult: string | null | undefined): boolean {
  const m = aiResult?.match(AI_RESULT_PATTERN);
  if (!m) return false;
  const analyzed = Number(m[1]);
  const failedBatches = m[2] ? Number(m[2]) : 0;
  return analyzed === 0 && failedBatches > 0;
}

/** derives user-facing health issues from already-fetched pipeline/source data -- pure
 *  function (no DB access) so it's directly testable and reusable between the dashboard's
 *  quiet banner (nothing rendered when this returns []) and /monitoring's fuller view.
 *  `runs` must be ordered most-recent-first (see getRecentPipelineRuns). Deliberately
 *  conservative thresholds: this exists to be trustworthy noise-free signal for someone who
 *  is no longer actively watching the system, not a hair-trigger alert. */
export function computeSystemHealthIssues(
  runs: PipelineRunRow[],
  sourceHealth: SourceHealthRow[],
  now: Date = new Date(),
): SystemHealthIssue[] {
  const issues: SystemHealthIssue[] = [];

  if (runs.length === 0) {
    issues.push({ severity: 'critical', message: '파이프라인이 한 번도 실행된 기록이 없습니다.' });
    return issues;
  }

  const mostRecent = runs[0];
  const hoursSinceLastRun = (now.getTime() - mostRecent.startedAt.getTime()) / 3_600_000;
  if (hoursSinceLastRun > STALE_RUN_HOURS) {
    issues.push({
      severity: 'critical',
      message: `마지막 파이프라인 실행이 ${Math.round(hoursSinceLastRun)}시간 전입니다 — 스케줄러가 멈췄을 수 있습니다.`,
    });
  }

  const recentTotalAiFailures = runs.slice(0, AI_TOTAL_FAILURE_STREAK).filter((r) => isTotalAiFailure(r.aiResult));
  if (recentTotalAiFailures.length >= AI_TOTAL_FAILURE_STREAK) {
    issues.push({
      severity: 'warning',
      message: `최근 ${AI_TOTAL_FAILURE_STREAK}회 연속 AI 분석이 전부 실패했습니다 (Gemini 서비스 과부하/장애 가능성) — 당분간 규칙 기반 우선순위로만 동작합니다.`,
    });
  }

  const recentCollectErrors = runs.slice(0, COLLECT_ERROR_STREAK).filter((r) => r.collectResult?.startsWith('error'));
  if (recentCollectErrors.length >= COLLECT_ERROR_STREAK) {
    issues.push({
      severity: 'critical',
      message: `최근 ${COLLECT_ERROR_STREAK}회 연속 기사 수집(collectAll) 자체가 실패했습니다: ${recentCollectErrors[0].collectResult}`,
    });
  }

  // across ALL routes, not just 'collect' -- 'enrich' hits Gemini 12x/day and an uncaught
  // throw there (e.g. a DB read inside enrichArticles) used to match neither this check (which
  // only looked at 'collect') nor AI_TOTAL_FAILURE_STREAK (whose pattern only matches the
  // "analyzed N, ..." shape, not a raw "error: ..." string) -- found in the 2026-09-29 audit.
  const recentAiErrors = runs.slice(0, AI_ERROR_STREAK).filter((r) => r.aiResult?.startsWith('error'));
  if (recentAiErrors.length >= AI_ERROR_STREAK) {
    issues.push({
      severity: 'warning',
      message: `최근 ${AI_ERROR_STREAK}회 연속 AI 분석 실패 — Gemini 모델/쿼터 문제일 수 있습니다.`,
    });
  }

  const recentAiDisabled = runs
    .slice(0, AI_DISABLED_STREAK)
    .filter((r) => r.aiResult === AI_DISABLED_FREE_ONLY || r.aiResult === AI_DISABLED_NO_API_KEY);
  if (recentAiDisabled.length >= AI_DISABLED_STREAK) {
    issues.push({
      severity: 'warning',
      message: `최근 ${AI_DISABLED_STREAK}회 연속 AI 분석이 비활성 상태입니다 (${recentAiDisabled[0].aiResult}) — 환경변수가 실수로 지워졌을 수 있습니다. 규칙 기반 우선순위로만 동작 중입니다.`,
    });
  }

  const collectRuns = runs.filter((r) => r.route === 'collect');
  if (collectRuns.length > 0) {
    const lastCollect = collectRuns[0];
    const daysSinceLastCollect = (now.getTime() - lastCollect.startedAt.getTime()) / 86_400_000;
    if (daysSinceLastCollect > NO_COLLECT_DAYS) {
      issues.push({
        severity: 'critical',
        message: `일일 리포트(08:00) 실행이 ${Math.round(daysSinceLastCollect)}일간 없었습니다.`,
      });
    }

    if (lastCollect.emailResult?.startsWith('error')) {
      issues.push({ severity: 'critical', message: `최근 리포트 이메일 발송 실패: ${lastCollect.emailResult}` });
    }

    // real articles silently dropped from the digest/report because a single load hit its row
    // cap -- found live 2026-09-29 that daily volume (300-365 on a busy day) was already close
    // enough to the old 500-row cap to make this a real, not hypothetical, risk for a multi-day
    // watermark rollup. The cap itself was raised the same day, but this stays as a net in case
    // volume ever outgrows even the new one.
    if (lastCollect.emailResult?.includes('TRUNCATED')) {
      issues.push({ severity: 'critical', message: `최근 리포트에서 기사가 잘렸습니다: ${lastCollect.emailResult}` });
    }

    const recentKakaoErrors = collectRuns.slice(0, KAKAO_ERROR_STREAK).filter((r) => r.kakaoResult?.startsWith('error'));
    if (recentKakaoErrors.length >= KAKAO_ERROR_STREAK) {
      issues.push({
        severity: 'warning',
        message: `최근 ${KAKAO_ERROR_STREAK}회 연속 카카오 발송 실패: ${recentKakaoErrors[0].kakaoResult} — OAuth 토큰 만료 가능성.`,
      });
    }

    const recentReportErrors = collectRuns.slice(0, REPORT_ERROR_STREAK).filter((r) => r.reportResult?.startsWith('error'));
    if (recentReportErrors.length >= REPORT_ERROR_STREAK) {
      issues.push({
        severity: 'critical',
        message: `최근 ${REPORT_ERROR_STREAK}회 연속 리포트(.docx) 생성 실패: ${recentReportErrors[0].reportResult}`,
      });
    }

    const recentPruneErrors = collectRuns.slice(0, PRUNE_ERROR_STREAK).filter((r) => r.pruneResult?.startsWith('error'));
    if (recentPruneErrors.length >= PRUNE_ERROR_STREAK) {
      issues.push({
        severity: 'warning',
        message: `최근 ${PRUNE_ERROR_STREAK}회 연속 데이터 정리(prune) 실패 — 저장공간이 서서히 찰 수 있습니다.`,
      });
    }

    const sectionsCounts = collectRuns
      .map((r) => r.reportResult?.match(REPORT_SECTIONS_PATTERN))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => Number(m[1]));
    const recentSections = sectionsCounts.slice(0, EMPTY_REPORT_STREAK);
    if (recentSections.length >= EMPTY_REPORT_STREAK && recentSections.every((n) => n === 0)) {
      issues.push({
        severity: 'critical',
        message: `최근 ${EMPTY_REPORT_STREAK}회 연속 리포트에 담긴 항목이 0건입니다 — 후보 선정/관련성 판정 로직에 문제가 있을 수 있습니다.`,
      });
    }
  }

  const brokenSources = sourceHealth.filter((h) => h.consecutiveErrors >= SOURCE_ERROR_STREAK).length;
  if (brokenSources >= BROKEN_SOURCE_THRESHOLD) {
    issues.push({ severity: 'warning', message: `${brokenSources}개 소스가 연속 오류 상태입니다 (자세히: /monitoring).` });
  }

  return issues;
}

// the dashboard banner only shows an issue to someone who opens the dashboard -- during a
// stretch with nobody watching (the whole reason this project needs to survive unattended),
// that's not enough. A critical issue also gets emailed via criticalAlert.ts, but only once
// per this cooldown window while it persists, not on every cron run that notices it (enrich
// runs every 2h; without a cooldown that's up to 12 emails/day for one ongoing problem). 20h,
// not 24h, so a persisting issue reliably gets a fresh reminder once per calendar day rather
// than drifting later each day from small scheduling jitter.
const CRITICAL_ALERT_COOLDOWN_HOURS = 20;

/** pure cooldown check -- true when enough time has passed since the last alert email (or none
 *  was ever sent) that a new one should go out now. Kept separate from the DB-touching send
 *  logic in criticalAlert.ts so the cooldown math itself is directly unit-testable. */
export function shouldSendCriticalAlert(now: Date, lastSentAt: Date | null): boolean {
  if (!lastSentAt) return true;
  const hoursSinceLastAlert = (now.getTime() - lastSentAt.getTime()) / 3_600_000;
  return hoursSinceLastAlert >= CRITICAL_ALERT_COOLDOWN_HOURS;
}
