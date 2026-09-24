import type { PipelineRunRow, SourceHealthRow } from './db';

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
const BROKEN_SOURCE_THRESHOLD = 5;
const SOURCE_ERROR_STREAK = 3;
// prune failures degrade slowly (DB storage grows toward the free-tier cap over roughly a
// year even if pruning never runs again -- see pruneOldData's doc comment), so this uses a
// longer streak than AI_ERROR_STREAK before surfacing anything -- a warning, not a critical.
const PRUNE_ERROR_STREAK = 3;

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

    const recentAiErrors = collectRuns.slice(0, AI_ERROR_STREAK).filter((r) => r.aiResult?.startsWith('error'));
    if (recentAiErrors.length >= AI_ERROR_STREAK) {
      issues.push({
        severity: 'warning',
        message: `최근 ${AI_ERROR_STREAK}회 연속 AI 분석 실패 — Gemini 모델/쿼터 문제일 수 있습니다.`,
      });
    }

    const recentPruneErrors = collectRuns.slice(0, PRUNE_ERROR_STREAK).filter((r) => r.pruneResult?.startsWith('error'));
    if (recentPruneErrors.length >= PRUNE_ERROR_STREAK) {
      issues.push({
        severity: 'warning',
        message: `최근 ${PRUNE_ERROR_STREAK}회 연속 데이터 정리(prune) 실패 — 저장공간이 서서히 찰 수 있습니다.`,
      });
    }
  }

  const brokenSources = sourceHealth.filter((h) => h.consecutiveErrors >= SOURCE_ERROR_STREAK).length;
  if (brokenSources >= BROKEN_SOURCE_THRESHOLD) {
    issues.push({ severity: 'warning', message: `${brokenSources}개 소스가 연속 오류 상태입니다 (자세히: /monitoring).` });
  }

  return issues;
}
