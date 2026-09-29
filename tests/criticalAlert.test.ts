import { describe, it, expect, vi, beforeEach } from 'vitest';

const getRecentPipelineRuns = vi.fn();
const getSourceHealth = vi.fn();
const getAppSetting = vi.fn();
const setAppSetting = vi.fn();
const sendCriticalAlertEmail = vi.fn();

vi.mock('@/lib/db', () => ({ getRecentPipelineRuns, getSourceHealth, getAppSetting, setAppSetting }));
vi.mock('@/lib/email', () => ({ sendCriticalAlertEmail }));

beforeEach(() => {
  getRecentPipelineRuns.mockReset();
  getSourceHealth.mockReset();
  getAppSetting.mockReset();
  setAppSetting.mockReset();
  sendCriticalAlertEmail.mockReset();
  sendCriticalAlertEmail.mockResolvedValue(undefined);
  setAppSetting.mockResolvedValue(undefined);
  getSourceHealth.mockResolvedValue([]);
  // no runs at all always yields a critical issue ("파이프라인이 한 번도 실행된 기록이
  // 없습니다") -- the simplest deterministic way to exercise the real
  // computeSystemHealthIssues rather than mocking it too
  getRecentPipelineRuns.mockResolvedValue([]);
});

describe('checkAndSendCriticalAlert', () => {
  it('does nothing when there are no critical issues', async () => {
    getRecentPipelineRuns.mockResolvedValue([
      {
        id: 1,
        route: 'collect',
        startedAt: new Date(),
        finishedAt: new Date(),
        aiResult: 'analyzed 10, cached 0',
        dedupeResult: null,
        reportResult: 'dates 2026-09-28, sections 3, deep-analyzed 3/3, excluded-irrelevant 0, skipped {}',
        emailResult: 'sent',
        kakaoResult: 'sent',
        pruneResult: null,
        hasError: false,
      },
    ]);

    const { checkAndSendCriticalAlert } = await import('@/lib/criticalAlert');
    const result = await checkAndSendCriticalAlert();

    expect(result).toBe('no-critical-issues');
    expect(sendCriticalAlertEmail).not.toHaveBeenCalled();
    expect(setAppSetting).not.toHaveBeenCalled();
  });

  it('sends an alert when a critical issue exists and none was ever sent before', async () => {
    getAppSetting.mockResolvedValue(null);

    const { checkAndSendCriticalAlert } = await import('@/lib/criticalAlert');
    const result = await checkAndSendCriticalAlert();

    expect(result).toBe('sent: 1 issue(s)');
    expect(sendCriticalAlertEmail).toHaveBeenCalledTimes(1);
    expect(setAppSetting).toHaveBeenCalledWith('last_critical_alert_sent_at', expect.any(String));
  });

  it('skips sending when a critical issue persists but the cooldown has not elapsed', async () => {
    getAppSetting.mockResolvedValue(new Date().toISOString()); // "just sent"

    const { checkAndSendCriticalAlert } = await import('@/lib/criticalAlert');
    const result = await checkAndSendCriticalAlert();

    expect(result).toBe('skipped: cooldown');
    expect(sendCriticalAlertEmail).not.toHaveBeenCalled();
    expect(setAppSetting).not.toHaveBeenCalled();
  });

  it('sends again once the cooldown has elapsed', async () => {
    getAppSetting.mockResolvedValue(new Date(Date.now() - 21 * 3_600_000).toISOString()); // 21h ago

    const { checkAndSendCriticalAlert } = await import('@/lib/criticalAlert');
    const result = await checkAndSendCriticalAlert();

    expect(result).toBe('sent: 1 issue(s)');
    expect(sendCriticalAlertEmail).toHaveBeenCalledTimes(1);
  });
});
