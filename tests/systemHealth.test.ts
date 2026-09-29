import { describe, it, expect } from 'vitest';
import { computeSystemHealthIssues, shouldSendCriticalAlert } from '@/lib/systemHealth';
import type { PipelineRunRow, SourceHealthRow } from '@/lib/db';

const NOW = new Date('2026-09-24T00:00:00Z');

function makeRun(overrides: Partial<PipelineRunRow>): PipelineRunRow {
  return {
    id: 1,
    route: 'collect',
    startedAt: NOW,
    finishedAt: NOW,
    aiResult: 'analyzed 10, cached 0',
    dedupeResult: 'demoted 0 across 0 groups',
    reportResult: 'dates 2026-09-23, sections 3, deep-analyzed 4/4, excluded-irrelevant 0, skipped {}',
    emailResult: 'sent',
    kakaoResult: 'sent',
    pruneResult: 'articles 0, pipeline_runs 0',
    hasError: false,
    ...overrides,
  };
}

function makeSourceHealth(overrides: Partial<SourceHealthRow>): SourceHealthRow {
  return {
    sourceId: 'test',
    lastRunAt: NOW,
    fetched: 10,
    inserted: 5,
    skippedDuplicate: 0,
    skippedNoTagMatch: 0,
    skippedInvalidUrl: 0,
    error: null,
    consecutiveErrors: 0,
    consecutiveZeroFetch: 0,
    ...overrides,
  };
}

describe('computeSystemHealthIssues', () => {
  it('returns no issues for a healthy recent run and healthy sources', () => {
    const issues = computeSystemHealthIssues([makeRun({})], [makeSourceHealth({})], NOW);
    expect(issues).toEqual([]);
  });

  it('flags a critical issue when there are no pipeline runs at all', () => {
    const issues = computeSystemHealthIssues([], [], NOW);
    expect(issues).toEqual([{ severity: 'critical', message: '파이프라인이 한 번도 실행된 기록이 없습니다.' }]);
  });

  it('flags a critical issue when the most recent run is more than 26 hours old', () => {
    const staleRun = makeRun({ startedAt: new Date(NOW.getTime() - 30 * 3_600_000) });
    const issues = computeSystemHealthIssues([staleRun], [makeSourceHealth({})], NOW);
    expect(issues.some((i) => i.severity === 'critical' && i.message.includes('스케줄러'))).toBe(true);
  });

  it('does not flag staleness for a run only a few hours old', () => {
    const recentRun = makeRun({ startedAt: new Date(NOW.getTime() - 2 * 3_600_000) });
    const issues = computeSystemHealthIssues([recentRun], [makeSourceHealth({})], NOW);
    expect(issues.some((i) => i.message.includes('스케줄러'))).toBe(false);
  });

  it('flags a critical issue when the last collect run is more than 4 days old', () => {
    const oldCollect = makeRun({ route: 'collect', startedAt: new Date(NOW.getTime() - 5 * 86_400_000) });
    const issues = computeSystemHealthIssues([oldCollect], [makeSourceHealth({})], NOW);
    expect(issues.some((i) => i.severity === 'critical' && i.message.includes('일일 리포트'))).toBe(true);
  });

  it('does not flag missing-collect for a normal long-weekend gap (<=4 days)', () => {
    const fridayCollect = makeRun({ route: 'collect', startedAt: new Date(NOW.getTime() - 3 * 86_400_000) });
    const issues = computeSystemHealthIssues([fridayCollect], [makeSourceHealth({})], NOW);
    expect(issues.some((i) => i.message.includes('일일 리포트'))).toBe(false);
  });

  it('flags a critical issue when the last collect run failed to send email', () => {
    const failedEmail = makeRun({ emailResult: 'error: Resend API error 401: invalid key' });
    const issues = computeSystemHealthIssues([failedEmail], [makeSourceHealth({})], NOW);
    expect(issues.some((i) => i.severity === 'critical' && i.message.includes('이메일 발송 실패'))).toBe(true);
  });

  it('flags a warning when AI analysis failed on the last 2 collect runs in a row', () => {
    const runs = [
      makeRun({ id: 2, aiResult: 'error: Gemini API error 404: model not found', startedAt: new Date(NOW.getTime() - 86_400_000) }),
      makeRun({ id: 1, aiResult: 'error: Gemini API error 404: model not found', startedAt: new Date(NOW.getTime() - 2 * 86_400_000) }),
    ];
    const issues = computeSystemHealthIssues(runs, [makeSourceHealth({})], NOW);
    expect(issues.some((i) => i.severity === 'warning' && i.message.includes('AI 분석 실패'))).toBe(true);
  });

  it('does not flag AI failure from a single isolated failed run', () => {
    const runs = [
      makeRun({ id: 2, aiResult: 'error: transient', startedAt: new Date(NOW.getTime() - 86_400_000) }),
      makeRun({ id: 1, aiResult: 'analyzed 10, cached 0', startedAt: new Date(NOW.getTime() - 2 * 86_400_000) }),
    ];
    const issues = computeSystemHealthIssues(runs, [makeSourceHealth({})], NOW);
    expect(issues.some((i) => i.message.includes('AI 분석 실패'))).toBe(false);
  });

  it('flags a warning when every batch failed on the last 2 runs (found live 2026-09-28: a Gemini 503 outage never produces an "error"-prefixed aiResult)', () => {
    const runs = [
      makeRun({ id: 2, route: 'enrich', aiResult: 'analyzed 0, cached 15, failed-batches 3', startedAt: new Date(NOW.getTime() - 3_600_000) }),
      makeRun({ id: 1, route: 'enrich', aiResult: 'analyzed 0, cached 94, failed-batches 9', startedAt: new Date(NOW.getTime() - 7_200_000) }),
    ];
    const issues = computeSystemHealthIssues(runs, [makeSourceHealth({})], NOW);
    expect(issues.some((i) => i.severity === 'warning' && i.message.includes('AI 분석이 전부 실패'))).toBe(true);
  });

  it('does not flag a total-AI-failure warning from a single isolated run', () => {
    const runs = [
      makeRun({ id: 2, route: 'enrich', aiResult: 'analyzed 0, cached 15, failed-batches 3', startedAt: new Date(NOW.getTime() - 3_600_000) }),
      makeRun({ id: 1, route: 'enrich', aiResult: 'analyzed 33, cached 15', startedAt: new Date(NOW.getTime() - 7_200_000) }),
    ];
    const issues = computeSystemHealthIssues(runs, [makeSourceHealth({})], NOW);
    expect(issues.some((i) => i.message.includes('AI 분석이 전부 실패'))).toBe(false);
  });

  it('does not flag "analyzed 0" runs that have no failed batches (everything was just a cache hit, not a failure)', () => {
    const runs = [
      makeRun({ id: 2, route: 'enrich', aiResult: 'analyzed 0, cached 15', startedAt: new Date(NOW.getTime() - 3_600_000) }),
      makeRun({ id: 1, route: 'enrich', aiResult: 'analyzed 0, cached 94', startedAt: new Date(NOW.getTime() - 7_200_000) }),
    ];
    const issues = computeSystemHealthIssues(runs, [makeSourceHealth({})], NOW);
    expect(issues.some((i) => i.message.includes('AI 분석이 전부 실패'))).toBe(false);
  });

  it('flags a warning when data-retention pruning failed on the last 3 collect runs in a row', () => {
    const runs = [
      makeRun({ id: 3, pruneResult: 'error: statement timeout', startedAt: new Date(NOW.getTime() - 86_400_000) }),
      makeRun({ id: 2, pruneResult: 'error: statement timeout', startedAt: new Date(NOW.getTime() - 2 * 86_400_000) }),
      makeRun({ id: 1, pruneResult: 'error: statement timeout', startedAt: new Date(NOW.getTime() - 3 * 86_400_000) }),
    ];
    const issues = computeSystemHealthIssues(runs, [makeSourceHealth({})], NOW);
    expect(issues.some((i) => i.severity === 'warning' && i.message.includes('데이터 정리'))).toBe(true);
  });

  it('does not flag pruning failure from only 2 consecutive failed runs', () => {
    const runs = [
      makeRun({ id: 2, pruneResult: 'error: transient', startedAt: new Date(NOW.getTime() - 86_400_000) }),
      makeRun({ id: 1, pruneResult: 'error: transient', startedAt: new Date(NOW.getTime() - 2 * 86_400_000) }),
    ];
    const issues = computeSystemHealthIssues(runs, [makeSourceHealth({})], NOW);
    expect(issues.some((i) => i.message.includes('데이터 정리'))).toBe(false);
  });

  it('flags a critical issue when the last 2 attempted reports both had 0 sections', () => {
    const runs = [
      makeRun({
        id: 2,
        reportResult: 'dates 2026-09-27, sections 0, deep-analyzed 6/6, excluded-irrelevant 6, skipped {}',
        startedAt: new Date(NOW.getTime() - 86_400_000),
      }),
      makeRun({
        id: 1,
        reportResult: 'dates 2026-09-26, sections 0, deep-analyzed 4/4, excluded-irrelevant 4, skipped {}',
        startedAt: new Date(NOW.getTime() - 2 * 86_400_000),
      }),
    ];
    const issues = computeSystemHealthIssues(runs, [makeSourceHealth({})], NOW);
    expect(issues.some((i) => i.severity === 'critical' && i.message.includes('0건'))).toBe(true);
  });

  it('does not flag an empty report from a single isolated 0-section run', () => {
    const runs = [
      makeRun({
        id: 2,
        reportResult: 'dates 2026-09-27, sections 0, deep-analyzed 6/6, excluded-irrelevant 6, skipped {}',
        startedAt: new Date(NOW.getTime() - 86_400_000),
      }),
      makeRun({ id: 1, startedAt: new Date(NOW.getTime() - 2 * 86_400_000) }), // default has sections 3
    ];
    const issues = computeSystemHealthIssues(runs, [makeSourceHealth({})], NOW);
    expect(issues.some((i) => i.message.includes('0건'))).toBe(false);
  });

  it('skips non-attempted reports (non-business day etc) when checking for the 0-section streak', () => {
    // 2 real 0-section reports either side of a weekend skip must still count as consecutive
    const runs = [
      makeRun({
        id: 3,
        reportResult: 'dates 2026-09-28, sections 0, deep-analyzed 5/5, excluded-irrelevant 5, skipped {}',
        startedAt: new Date(NOW.getTime() - 86_400_000),
      }),
      makeRun({ id: 2, reportResult: 'skipped: non-business day', startedAt: new Date(NOW.getTime() - 2 * 86_400_000) }),
      makeRun({
        id: 1,
        reportResult: 'dates 2026-09-25, sections 0, deep-analyzed 3/3, excluded-irrelevant 3, skipped {}',
        startedAt: new Date(NOW.getTime() - 3 * 86_400_000),
      }),
    ];
    const issues = computeSystemHealthIssues(runs, [makeSourceHealth({})], NOW);
    expect(issues.some((i) => i.message.includes('0건'))).toBe(true);
  });

  it('flags a warning when 5+ sources have a 3+ consecutive-error streak', () => {
    const sources = Array.from({ length: 5 }, (_, i) => makeSourceHealth({ sourceId: `s${i}`, consecutiveErrors: 3 }));
    const issues = computeSystemHealthIssues([makeRun({})], sources, NOW);
    expect(issues.some((i) => i.severity === 'warning' && i.message.includes('소스가 연속 오류'))).toBe(true);
  });

  it('does not flag source errors below the threshold count', () => {
    const sources = Array.from({ length: 4 }, (_, i) => makeSourceHealth({ sourceId: `s${i}`, consecutiveErrors: 3 }));
    const issues = computeSystemHealthIssues([makeRun({})], sources, NOW);
    expect(issues.some((i) => i.message.includes('소스가 연속 오류'))).toBe(false);
  });
});

describe('shouldSendCriticalAlert', () => {
  it('sends when no alert has ever been sent', () => {
    expect(shouldSendCriticalAlert(NOW, null)).toBe(true);
  });

  it('does not send again within the 20h cooldown', () => {
    const lastSentAt = new Date(NOW.getTime() - 19 * 3_600_000);
    expect(shouldSendCriticalAlert(NOW, lastSentAt)).toBe(false);
  });

  it('sends again once the cooldown has fully elapsed', () => {
    const lastSentAt = new Date(NOW.getTime() - 21 * 3_600_000);
    expect(shouldSendCriticalAlert(NOW, lastSentAt)).toBe(true);
  });

  it('sends exactly at the cooldown boundary (>=, not >)', () => {
    const lastSentAt = new Date(NOW.getTime() - 20 * 3_600_000);
    expect(shouldSendCriticalAlert(NOW, lastSentAt)).toBe(true);
  });
});
