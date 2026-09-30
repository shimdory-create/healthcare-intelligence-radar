import { NextRequest, NextResponse } from 'next/server';
import { recordPipelineRun, getAppSetting, setAppSetting, sql } from '@/lib/db';
import { checkAndSendCriticalAlert } from '@/lib/criticalAlert';

const LAST_ALERT_KEY = 'last_critical_alert_sent_at';
const MARKER_PREFIX = '[TEST-2026-09-30-final]';

// Temporary diagnostic route (delete after use, per project convention) -- final-verification
// pass: live-fires the 3 new systemHealth checks (kakao/report/AI-disabled) that were only ever
// unit-tested with mocked data, never actually run through the real DB -> checkAndSendCriticalAlert
// -> Resend pipeline the way collectResult's check was on 2026-09-29. Runs each scenario in turn,
// resetting the cooldown between them so each gets its own real send attempt, and cleans up every
// synthetic row plus the cooldown timestamp itself afterward so production state ends up exactly
// as it was found.
async function runScenario(label: string, aiResult?: string, kakaoResult?: string, reportResult?: string) {
  await setAppSetting(LAST_ALERT_KEY, new Date(0).toISOString());
  const marker = `${MARKER_PREFIX} ${label}`;
  const t1 = new Date();
  await recordPipelineRun({
    route: 'collect',
    startedAt: t1,
    finishedAt: t1,
    aiResult: aiResult ?? marker,
    kakaoResult: kakaoResult ?? 'sent',
    reportResult: reportResult ?? marker,
  });
  const t2 = new Date(t1.getTime() + 1000);
  await recordPipelineRun({
    route: 'collect',
    startedAt: t2,
    finishedAt: t2,
    aiResult: aiResult ?? marker,
    kakaoResult: kakaoResult ?? 'sent',
    reportResult: reportResult ?? marker,
  });
  let result: string;
  try {
    result = await checkAndSendCriticalAlert();
  } catch (err) {
    result = `error: ${err instanceof Error ? err.message : String(err)}`;
  }
  return { label, result };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const originalCooldown = await getAppSetting(LAST_ALERT_KEY);

  const results = [];
  results.push(await runScenario('kakao-error', undefined, 'error: Kakao token refresh failed: 400', undefined));
  results.push(await runScenario('report-error', undefined, undefined, 'error: docx build failed'));
  results.push(await runScenario('ai-disabled', 'GEMINI_API_KEY is not set', undefined, undefined));

  const deleted = await sql`delete from pipeline_runs where ai_result like ${MARKER_PREFIX + '%'} or report_result like ${MARKER_PREFIX + '%'} returning id`;
  if (originalCooldown) {
    await setAppSetting(LAST_ALERT_KEY, originalCooldown);
  } else {
    await sql`delete from app_settings where key = ${LAST_ALERT_KEY}`;
  }

  return NextResponse.json({ results, cleanedUpRows: deleted.length, originalCooldownWasNull: originalCooldown === null });
}
