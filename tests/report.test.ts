import { describe, it, expect } from 'vitest';
import { buildReportSections } from '@/lib/report';
import type { ReportCandidate } from '@/lib/reportCandidates';
import type { CandidateDeepResult } from '@/lib/reportAnalysis';

function makeCandidate(overrides: Partial<ReportCandidate>): ReportCandidate {
  return {
    id: 1,
    title: '기본 제목',
    url: 'https://example.com/a',
    tags: [],
    priority: 'high',
    outletCount: 1,
    isMultiOutlet: false,
    ...overrides,
  };
}

describe('buildReportSections', () => {
  it('routes a high candidate into its Gemini-decided category section', () => {
    const candidates = [makeCandidate({ id: 1, title: '지텍정 약가협상' })];
    const deep = new Map<number, CandidateDeepResult>([
      [1, { articleId: 1, category: '국내 보험·제도', note: null, bullets: [{ text: 't', subBullets: [] }] }],
    ]);

    const sections = buildReportSections(candidates, deep, new Map());

    expect(sections).toEqual([
      { title: '국내 보험·제도', items: [{ headline: '지텍정 약가협상', note: null, bullets: [{ text: 't', subBullets: [] }] }] },
    ]);
  });

  it('routes a multi-outlet, non-high candidate into 다수매체 보도 regardless of its category', () => {
    const candidates = [makeCandidate({ id: 2, title: 'GC녹십자 mRNA', priority: 'medium', outletCount: 4, isMultiOutlet: true })];
    const deep = new Map<number, CandidateDeepResult>([
      [2, { articleId: 2, category: '국내 산업', note: null, bullets: [] }],
    ]);

    const sections = buildReportSections(candidates, deep, new Map());

    expect(sections).toEqual([
      { title: '다수매체 보도', items: [{ headline: 'GC녹십자 mRNA', note: '국내 4개 매체 보도', bullets: [] }] },
    ]);
  });

  it('prefixes the outlet-count note onto an existing glossary note for multi-outlet items', () => {
    const candidates = [makeCandidate({ id: 3, priority: 'low', outletCount: 3, isMultiOutlet: true })];
    const deep = new Map<number, CandidateDeepResult>([
      [3, { articleId: 3, category: 'Global', note: '용어 설명', bullets: [] }],
    ]);

    const sections = buildReportSections(candidates, deep, new Map());

    expect(sections[0].items[0].note).toBe('국내 3개 매체 보도 — 용어 설명');
  });

  it('falls back to the existing short summary as a single bullet when deep analysis is missing', () => {
    const candidates = [makeCandidate({ id: 4, title: '높음인데 딥분석 실패' })];

    const sections = buildReportSections(candidates, new Map(), new Map([[4, '기존 짧은 요약문']]));

    expect(sections).toEqual([
      { title: '국내 산업', items: [{ headline: '높음인데 딥분석 실패', note: null, bullets: [{ text: '기존 짧은 요약문', subBullets: [] }] }] },
    ]);
  });

  it('keeps the fixed section order and omits empty sections', () => {
    const candidates = [
      makeCandidate({ id: 1, priority: 'high' }),
      makeCandidate({ id: 2, priority: 'medium', outletCount: 3, isMultiOutlet: true }),
    ];
    const deep = new Map<number, CandidateDeepResult>([
      [1, { articleId: 1, category: 'Global', note: null, bullets: [] }],
      [2, { articleId: 2, category: '국내 산업', note: null, bullets: [] }],
    ]);

    const sections = buildReportSections(candidates, deep, new Map());

    expect(sections.map((s) => s.title)).toEqual(['Global', '다수매체 보도']);
  });
});

describe('buildReportDocx', () => {
  it('produces a non-empty valid docx (zip) buffer for a minimal report', async () => {
    const { buildReportDocx } = await import('@/lib/report');
    const sections = [
      {
        title: '국내 산업',
        items: [{ headline: '테스트 헤드라인', note: '테스트 노트', bullets: [{ text: '사실 1', subBullets: ['세부 1'] }] }],
      },
    ];

    const buffer = await buildReportDocx(sections, "'26.09.14 (월)", '헬스케어사업팀');

    expect(buffer.length).toBeGreaterThan(0);
    // .docx files are zip archives -- the first two bytes are always "PK"
    expect(buffer.subarray(0, 2).toString('ascii')).toBe('PK');
  });

  it('produces a valid buffer even for zero sections (nothing qualified that day)', async () => {
    const { buildReportDocx } = await import('@/lib/report');
    const buffer = await buildReportDocx([], "'26.09.14 (월)", '헬스케어사업팀');
    expect(buffer.subarray(0, 2).toString('ascii')).toBe('PK');
  });
});
