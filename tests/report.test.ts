import { describe, it, expect } from 'vitest';
import { buildReportSections, buildReportEmailHtml, type ReportSection } from '@/lib/report';
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
      [
        1,
        {
          articleId: 1,
          category: '국내 보험·제도',
          headline: '지텍정 약가협상 헤드라인',
          note: null,
          bullets: [{ text: 't', subBullets: [] }],
          background: null,
          isReference: false,
        },
      ],
    ]);

    const sections = buildReportSections(candidates, deep, new Map());

    expect(sections).toEqual([
      {
        title: '국내 보험·제도',
        items: [
          {
            headline: '지텍정 약가협상 헤드라인',
            note: null,
            bullets: [{ text: 't', subBullets: [] }],
            background: null,
            isReference: false,
          },
        ],
      },
    ]);
  });

  it('uses the deep-analysis headline instead of the source article title when available', () => {
    const candidates = [makeCandidate({ id: 1, title: '원본 뉴스 제목' })];
    const deep = new Map<number, CandidateDeepResult>([
      [1, { articleId: 1, category: '국내 산업', headline: '압축된 보고서용 헤드라인', note: null, bullets: [], background: null, isReference: false }],
    ]);

    const sections = buildReportSections(candidates, deep, new Map());

    expect(sections[0].items[0].headline).toBe('압축된 보고서용 헤드라인');
  });

  it('falls back to the raw article title when there is no deep-analysis headline', () => {
    const candidates = [makeCandidate({ id: 1, title: '원본 뉴스 제목' })];

    const sections = buildReportSections(candidates, new Map(), new Map([[1, '요약']]));

    expect(sections[0].items[0].headline).toBe('원본 뉴스 제목');
  });

  it('carries the background field through when Gemini provides one', () => {
    const candidates = [makeCandidate({ id: 1 })];
    const deep = new Map<number, CandidateDeepResult>([
      [1, { articleId: 1, category: '국내 산업', headline: 'h', note: null, bullets: [], background: 'Qubit은 디지털자산 전문 MGA', isReference: false }],
    ]);

    const sections = buildReportSections(candidates, deep, new Map());

    expect(sections[0].items[0].background).toBe('Qubit은 디지털자산 전문 MGA');
  });

  it('marks an item isReference when Gemini flags it as supplementary/FYI', () => {
    const candidates = [makeCandidate({ id: 1, title: '온라인 화제 기사' })];
    const deep = new Map<number, CandidateDeepResult>([
      [1, { articleId: 1, category: '국내 산업', headline: 'h', note: null, bullets: [], background: null, isReference: true }],
    ]);

    const sections = buildReportSections(candidates, deep, new Map());

    expect(sections[0].items[0].isReference).toBe(true);
  });

  it('routes a multi-outlet, non-high candidate into 다수매체 보도 regardless of its category', () => {
    const candidates = [makeCandidate({ id: 2, title: 'GC녹십자 mRNA', priority: 'medium', outletCount: 4, isMultiOutlet: true })];
    const deep = new Map<number, CandidateDeepResult>([
      [2, { articleId: 2, category: '국내 산업', headline: 'GC녹십자 mRNA', note: null, bullets: [], background: null, isReference: false }],
    ]);

    const sections = buildReportSections(candidates, deep, new Map());

    expect(sections).toEqual([
      {
        title: '다수매체 보도',
        items: [{ headline: 'GC녹십자 mRNA', note: '국내 4개 매체 보도', bullets: [], background: null, isReference: false }],
      },
    ]);
  });

  it('prefixes the outlet-count note onto an existing glossary note for multi-outlet items', () => {
    const candidates = [makeCandidate({ id: 3, priority: 'low', outletCount: 3, isMultiOutlet: true })];
    const deep = new Map<number, CandidateDeepResult>([
      [3, { articleId: 3, category: 'Global', headline: 'h', note: '용어 설명', bullets: [], background: null, isReference: false }],
    ]);

    const sections = buildReportSections(candidates, deep, new Map());

    expect(sections[0].items[0].note).toBe('국내 3개 매체 보도 — 용어 설명');
  });

  it('falls back to the existing short summary as a single bullet when deep analysis is missing', () => {
    const candidates = [makeCandidate({ id: 4, title: '높음인데 딥분석 실패' })];

    const sections = buildReportSections(candidates, new Map(), new Map([[4, '기존 짧은 요약문']]));

    expect(sections).toEqual([
      {
        title: '국내 산업',
        items: [
          {
            headline: '높음인데 딥분석 실패',
            note: null,
            bullets: [{ text: '기존 짧은 요약문', subBullets: [] }],
            background: null,
            isReference: false,
          },
        ],
      },
    ]);
  });

  it('falls back to a "no summary available" bullet -- never the article title -- when there is neither a deep result nor an existing summary', () => {
    const candidates = [makeCandidate({ id: 5, title: '딥분석도 기존요약도 없음' })];

    const sections = buildReportSections(candidates, new Map(), new Map());

    expect(sections).toEqual([
      {
        title: '국내 산업',
        items: [
          {
            headline: '딥분석도 기존요약도 없음',
            note: null,
            bullets: [{ text: '요약 정보 없음', subBullets: [] }],
            background: null,
            isReference: false,
          },
        ],
      },
    ]);
    // guard against the exact regression this covers: headline and bullet must never be identical
    expect(sections[0].items[0].bullets[0].text).not.toBe(sections[0].items[0].headline);
  });

  it('keeps the fixed section order and omits empty sections', () => {
    const candidates = [
      makeCandidate({ id: 1, priority: 'high' }),
      makeCandidate({ id: 2, priority: 'medium', outletCount: 3, isMultiOutlet: true }),
    ];
    const deep = new Map<number, CandidateDeepResult>([
      [1, { articleId: 1, category: 'Global', headline: 'h1', note: null, bullets: [], background: null, isReference: false }],
      [2, { articleId: 2, category: '국내 산업', headline: 'h2', note: null, bullets: [], background: null, isReference: false }],
    ]);

    const sections = buildReportSections(candidates, deep, new Map());

    expect(sections.map((s) => s.title)).toEqual(['Global', '다수매체 보도']);
  });
});

describe('buildReportEmailHtml', () => {
  it('renders section titles, headlines, notes, bullets, and sub-bullets as plain HTML text', () => {
    const sections: ReportSection[] = [
      {
        title: '국내 산업',
        items: [
          {
            headline: '테스트 헤드라인',
            note: '테스트 노트',
            bullets: [{ text: '사실 1', subBullets: ['세부 1'] }],
            background: null,
            isReference: false,
          },
        ],
      },
    ];

    const html = buildReportEmailHtml(sections, "'26.09.14 (월)");

    expect(html).toContain('1. 국내 산업');
    expect(html).toContain('□ 테스트 헤드라인');
    expect(html).toContain('테스트 노트');
    expect(html).toContain('사실 1');
    expect(html).toContain('세부 1');
    expect(html).not.toContain('cid:report-preview');
    expect(html).not.toContain('<img');
  });

  it('prefixes the headline with "(참고)" for reference-only items', () => {
    const sections: ReportSection[] = [
      { title: '국내 산업', items: [{ headline: '온라인 화제 기사', note: null, bullets: [], background: null, isReference: true }] },
    ];

    const html = buildReportEmailHtml(sections, "'26.09.14 (월)");

    expect(html).toContain('□ (참고) 온라인 화제 기사');
  });

  it('does not prefix headlines for core (non-reference) items', () => {
    const sections: ReportSection[] = [
      { title: '국내 산업', items: [{ headline: '핵심 뉴스', note: null, bullets: [], background: null, isReference: false }] },
    ];

    const html = buildReportEmailHtml(sections, "'26.09.14 (월)");

    expect(html).toContain('□ 핵심 뉴스');
    expect(html).not.toContain('(참고)');
  });

  it('renders a "※" background line after the bullets when background is present', () => {
    const sections: ReportSection[] = [
      {
        title: '국내 산업',
        items: [{ headline: 'h', note: null, bullets: [], background: 'Qubit은 디지털자산 전문 MGA', isReference: false }],
      },
    ];

    const html = buildReportEmailHtml(sections, "'26.09.14 (월)");

    expect(html).toContain('※ Qubit은 디지털자산 전문 MGA');
  });

  it('omits the "※" line when background is null', () => {
    const sections: ReportSection[] = [
      { title: '국내 산업', items: [{ headline: 'h', note: null, bullets: [], background: null, isReference: false }] },
    ];

    const html = buildReportEmailHtml(sections, "'26.09.14 (월)");

    expect(html).not.toContain('※');
  });
});

describe('buildReportDocx', () => {
  it('produces a non-empty valid docx (zip) buffer for a minimal report', async () => {
    const { buildReportDocx } = await import('@/lib/report');
    const sections = [
      {
        title: '국내 산업',
        items: [
          {
            headline: '테스트 헤드라인',
            note: '테스트 노트',
            bullets: [{ text: '사실 1', subBullets: ['세부 1'] }],
            background: '배경 정보',
            isReference: false,
          },
        ],
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
