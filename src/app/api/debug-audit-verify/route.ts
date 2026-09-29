import { NextRequest, NextResponse } from 'next/server';
import { recordPipelineRun, getAppSetting, setAppSetting, sql } from '@/lib/db';
import { checkAndSendCriticalAlert } from '@/lib/criticalAlert';

const LAST_ALERT_KEY = 'last_critical_alert_sent_at';
const MARKER = 'error: [TEST] synthetic failure for 2026-09-29 audit verification';

// Temporary diagnostic route (delete after use, per project convention) -- live end-to-end
// verification that the 4 new systemHealth checks (collectResult/kakaoResult/reportResult
// error streaks + broadened AI-error streak) actually produce a real critical-alert email
// through the full real pipeline, not just the unit tests. Inserts 2 synthetic pipeline_runs
// rows, forces the cooldown open, triggers the real send, then cleans up everything it touched.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const originalCooldown = await getAppSetting(LAST_ALERT_KEY);
  if (originalCooldown) await setAppSetting(LAST_ALERT_KEY, new Date(0).toISOString());

  const t1 = new Date();
  await recordPipelineRun({ route: 'enrich', startedAt: t1, finishedAt: t1, collectResult: MARKER });
  const t2 = new Date(t1.getTime() + 1000);
  await recordPipelineRun({ route: 'enrich', startedAt: t2, finishedAt: t2, collectResult: MARKER });

  let result: string;
  try {
    result = await checkAndSendCriticalAlert();
  } catch (err) {
    result = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  const deleted = await sql`delete from pipeline_runs where collect_result = ${MARKER} returning id`;
  if (originalCooldown) await setAppSetting(LAST_ALERT_KEY, originalCooldown);

  return NextResponse.json({
    result,
    cleanedUpRows: deleted.length,
    cooldownRestored: originalCooldown !== null,
    originalCooldownWasNull: originalCooldown === null,
  });
}
