import { NextRequest, NextResponse } from 'next/server';
import { sendCriticalAlertEmail } from '@/lib/email';

// TEMPORARY diagnostic route -- delete after use. Confirms the new critical-alert email path
// (Resend config, EMAIL_TO parsing, actual delivery) actually works end-to-end, not just that
// the code compiles -- the real cron routes only send this when a genuine critical issue
// exists, which isn't the case right now, so this is the only way to prove the pathway live
// before relying on it for real. Sends ONE clearly-labeled test email, does not touch the
// cooldown state (last_critical_alert_sent_at), so it can't suppress a real future alert.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    await sendCriticalAlertEmail([
      {
        severity: 'critical',
        message: '[테스트] 이건 실제 장애가 아니라 알림 이메일 경로 자체가 동작하는지 확인하는 테스트입니다.',
      },
    ]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}
