import { describe, it, expect } from 'vitest';
import { computeSystemHealthIssues } from '@/lib/systemHealth';
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
