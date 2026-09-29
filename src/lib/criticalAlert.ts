import { getRecentPipelineRuns, getSourceHealth, getAppSetting, setAppSetting } from './db';
import { computeSystemHealthIssues, shouldSendCriticalAlert } from './systemHealth';
import { sendCriticalAlertEmail } from './email';

const LAST_ALERT_SENT_KEY = 'last_critical_alert_sent_at';

/** checks current system health and emails a `critical`-only alert if warranted, respecting
 *  the cooldown in systemHealth.ts. Called from both cron routes (not just computed when the
 *  dashboard page happens to render) so a real problem gets pushed out even during a stretch
 *  nobody opens the dashboard -- that's the whole point, see email.ts's buildCriticalAlertHtml
 *  doc comment. Never throws -- callers wrap this in .catch(() => {}), same as every other
 *  end-of-route bookkeeping call (recordPipelineRun, pruneOldData). */
export async function checkAndSendCriticalAlert(): Promise<string> {
  const [runs, sourceHealth] = await Promise.all([getRecentPipelineRuns(30), getSourceHealth()]);
  const issues = computeSystemHealthIssues(runs, sourceHealth);
  const critical = issues.filter((i) => i.severity === 'critical');
  if (critical.length === 0) return 'no-critical-issues';

  const lastSentRaw = await getAppSetting(LAST_ALERT_SENT_KEY);
  const lastSentAt = lastSentRaw ? new Date(lastSentRaw) : null;
  const now = new Date();
  if (!shouldSendCriticalAlert(now, lastSentAt)) return 'skipped: cooldown';

  await sendCriticalAlertEmail(critical);
  await setAppSetting(LAST_ALERT_SENT_KEY, now.toISOString());
  return `sent: ${critical.length} issue(s)`;
}
