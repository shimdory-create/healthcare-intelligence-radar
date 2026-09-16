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
    outletSourceIds: ['yna'],
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
          bullets: [{ text: 't', note: null, subBullets: [] }],
          background: null,
          isReference: false,
          isRelevant: true,
        },
      ],
    ]);

    const sections = buildReportSections(candidates, deep);

    expect(sections).toEqual([
      {
        title: '국내 보험·제도',
        items: [
          {
            headline: '지텍정 약가협상 헤드라인',
            outletNote: null,
            bullets: [{ text: 't', note: null, subBullets: [] }],
            background: null,
            isReference: false,
          },
        ],
      },
    ]);
  });

  it('carries a bullet-level note through unchanged', () => {
    const candidates = [makeCandidate({ id: 1 })];
    const deep = new Map<number, CandidateDeepResult>([
      [
        1,
        {
          articleId: 1,
          category: '국내 산업',
          headline: 'h',
          bullets: [{ text: 't', note: '건정심: 건강보험정책심의위원회', subBullets: [] }],
          background: null,
          isReference: false,
          isRelevant: true,
        },
      ],
    ]);

    const sections = buildReportSections(candidates, deep);

    expect(sections[0].items[0].bullets[0].note).toBe('건정심: 건강보험정책심의위원회');
  });

  it('uses the deep-analysis headline instead of the source article title', () => {
    const candidates = [makeCandidate({ id: 1, title: '원본 뉴스 제목' })];
    const deep = new Map<number, CandidateDeepResult>([
      [1, { articleId: 1, category: '국내 산업', headline: '압축된 보고서용 헤드라인', bullets: [], background: null, isReference: false, isRelevant: true }],
    ]);

    const sections = buildReportSections(candidates, deep);

    expect(sections[0].items[0].headline).toBe('압축된 보고서용 헤드라인');
  });

  it('excludes a candidate entirely when deep analysis never reached it (time budget)', () => {
    const candidates = [
      makeCandidate({ id: 1, title: '딥분석 됨' }),
      makeCandidate({ id: 2, title: '딥분석 못 받음' }),
    ];
    const deep = new Map<number, CandidateDeepResult>([
      [1, { articleId: 1, category: '국내 산업', headline: '딥분석 됨', bullets: [], background: null, isReference: false, isRelevant: true }],
    ]);

    const sections = buildReportSections(candidates, deep);

    expect(sections).toHaveLength(1);
    expect(sections[0].items).toHaveLength(1);
    expect(sections[0].items[0].headline).toBe('딥분석 됨');
  });

  it('excludes a candidate whose deep analysis judges it has no business relevance, even if high priority', () => {
    const candidates = [
      makeCandidate({ id: 1, title: '건보공단 채용공고', priority: 'high' }),
      makeCandidate({ id: 2, title: '실제 관련 뉴스', priority: 'high' }),
    ];
    const deep = new Map<number, CandidateDeepResult>([
      [1, { articleId: 1, category: '국내 산업', headline: '건보공단 채용', bullets: [], background: null, isReference: false, isRelevant: false }],
      [2, { articleId: 2, category: '국내 산업', headline: '실제 관련 뉴스', bullets: [], background: null, isReference: false, isRelevant: true }],
    ]);

    const sections = buildReportSections(candidates, deep);

    expect(sections[0].items).toHaveLength(1);
    expect(sections[0].items[0].headline).toBe('실제 관련 뉴스');
  });

  it('excludes an irrelevant multi-outlet candidate the same way (the gap the outlet-count rule otherwise leaves open)', () => {
    const candidates = [
      makeCandidate({
        id: 1,
        title: '전공의 수상 소식',
        priority: 'medium',
        outletCount: 3,
        outletSourceIds: ['bosa', 'monews', 'rapportian'],
        isMultiOutlet: true,
      }),
    ];
    const deep = new Map<number, CandidateDeepResult>([
      [1, { articleId: 1, category: '국내 산업', headline: '전공의 수상', bullets: [], background: null, isReference: false, isRelevant: false }],
    ]);

    const sections = buildReportSections(candidates, deep);

    expect(sections).toEqual([]);
  });

  it('produces no sections at all when nothing has deep analysis', () => {
    const candidates = [makeCandidate({ id: 1, title: '딥분석 못 받음' })];

    const sections = buildReportSections(candidates, new Map());

    expect(sections).toEqual([]);
  });

  it('carries the background field through when Gemini provides one', () => {
    const candidates = [makeCandidate({ id: 1 })];
    const deep = new Map<number, CandidateDeepResult>([
      [1, { articleId: 1, category: '국내 산업', headline: 'h', bullets: [], background: 'Qubit은 디지털자산 전문 MGA', isReference: false, isRelevant: true }],
    ]);

    const sections = buildReportSections(candidates, deep);

    expect(sections[0].items[0].background).toBe('Qubit은 디지털자산 전문 MGA');
  });

  it('marks an item isReference when Gemini flags it as supplementary/FYI', () => {
    const candidates = [makeCandidate({ id: 1, title: '온라인 화제 기사' })];
    const deep = new Map<number, CandidateDeepResult>([
      [1, { articleId: 1, category: '국내 산업', headline: 'h', bullets: [], background: null, isReference: true, isRelevant: true }],
    ]);

    const sections = buildReportSections(candidates, deep);

    expect(sections[0].items[0].isReference).toBe(true);
  });

  it('groups isReference items after core items within a section, without reordering within each group', () => {
    const candidates = [
      makeCandidate({ id: 1, title: '참고1' }),
      makeCandidate({ id: 2, title: '핵심1' }),
      makeCandidate({ id: 3, title: '참고2' }),
      makeCandidate({ id: 4, title: '핵심2' }),
    ];
    const deep = new Map<number, CandidateDeepResult>([
      [1, { articleId: 1, category: '국내 산업', headline: '참고1', bullets: [], background: null, isReference: true, isRelevant: true }],
      [2, { articleId: 2, category: '국내 산업', headline: '핵심1', bullets: [], background: null, isReference: false, isRelevant: true }],
      [3, { articleId: 3, category: '국내 산업', headline: '참고2', bullets: [], background: null, isReference: true, isRelevant: true }],
      [4, { articleId: 4, category: '국내 산업', headline: '핵심2', bullets: [], background: null, isReference: false, isRelevant: true }],
    ]);

    const sections = buildReportSections(candidates, deep);

    expect(sections[0].items.map((i) => i.headline)).toEqual(['핵심1', '핵심2', '참고1', '참고2']);
  });

  it('routes a multi-outlet, non-high candidate into 다수매체 보도 regardless of its category', () => {
    const candidates = [
      makeCandidate({
        id: 2,
        title: 'GC녹십자 mRNA',
        priority: 'medium',
        outletCount: 4,
        outletSourceIds: ['yna', 'chosun', 'donga', 'joongang'],
        isMultiOutlet: true,
      }),
    ];
    const deep = new Map<number, CandidateDeepResult>([
      [2, { articleId: 2, category: '국내 산업', headline: 'GC녹십자 mRNA', bullets: [], background: null, isReference: false, isRelevant: true }],
    ]);

    const sections = buildReportSections(candidates, deep);

    expect(sections).toEqual([
      {
        title: '다수매체 보도',
        items: [
          {
            headline: 'GC녹십자 mRNA',
            outletNote: '4개 매체 보도 (연합뉴스, 조선일보, 동아일보, 중앙일보)',
            bullets: [],
            background: null,
            isReference: false,
          },
        ],
      },
    ]);
  });

  it('does not touch a bullet-level note when also computing the multi-outlet note', () => {
    const candidates = [
      makeCandidate({
        id: 3,
        priority: 'low',
        outletCount: 3,
        outletSourceIds: ['yna', 'chosun', 'donga'],
        isMultiOutlet: true,
      }),
    ];
    const deep = new Map<number, CandidateDeepResult>([
      [3, { articleId: 3, category: 'Global', headline: 'h', bullets: [{ text: 't', note: '용어 설명', subBullets: [] }], background: null, isReference: false, isRelevant: true }],
    ]);

    const sections = buildReportSections(candidates, deep);

    expect(sections[0].items[0].outletNote).toBe('3개 매체 보도 (연합뉴스, 조선일보, 동아일보)');
    expect(sections[0].items[0].bullets[0].note).toBe('용어 설명');
  });

  it('sets outletNote to null for a single-outlet item', () => {
    const candidates = [makeCandidate({ id: 1, isMultiOutlet: false })];
    const deep = new Map<number, CandidateDeepResult>([
      [1, { articleId: 1, category: '국내 산업', headline: 'h', bullets: [], background: null, isReference: false, isRelevant: true }],
    ]);

    const sections = buildReportSections(candidates, deep);

    expect(sections[0].items[0].outletNote).toBeNull();
  });

  it('keeps the fixed section order and omits empty sections', () => {
    const candidates = [
      makeCandidate({ id: 1, priority: 'high' }),
      makeCandidate({ id: 2, priority: 'medium', outletCount: 3, isMultiOutlet: true }),
    ];
    const deep = new Map<number, CandidateDeepResult>([
      [1, { articleId: 1, category: 'Global', headline: 'h1', bullets: [], background: null, isReference: false, isRelevant: true }],
      [2, { articleId: 2, category: '국내 산업', headline: 'h2', bullets: [], background: null, isReference: false, isRelevant: true }],
    ]);

    const sections = buildReportSections(candidates, deep);

    expect(sections.map((s) => s.title)).toEqual(['Global', '다수매체 보도']);
  });
});

describe('buildReportEmailHtml', () => {
  it('renders section titles, headlines, outlet notes, bullets, and sub-bullets as plain HTML text', () => {
    const sections: ReportSection[] = [
      {
        title: '국내 산업',
        items: [
          {
            headline: '테스트 헤드라인',
            outletNote: '테스트 노트',
            bullets: [{ text: '사실 1', note: null, subBullets: ['세부 1'] }],
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

  it('renders a bullet-level note directly under that bullet, not under the headline', () => {
    const sections: ReportSection[] = [
      {
        title: '국내 산업',
        items: [
          {
            headline: 'h',
            outletNote: null,
            bullets: [{ text: '건정심 재평가 착수', note: '건정심: 건강보험정책심의위원회', subBullets: [] }],
            background: null,
            isReference: false,
          },
        ],
      },
    ];

    const html = buildReportEmailHtml(sections, "'26.09.14 (월)");

    const bulletIdx = html.indexOf('건정심 재평가 착수');
    const noteIdx = html.indexOf('건정심: 건강보험정책심의위원회');
    expect(bulletIdx).toBeGreaterThan(-1);
    expect(noteIdx).toBeGreaterThan(bulletIdx);
  });

  it('omits a bullet-level note line when the bullet has none', () => {
    const sections: ReportSection[] = [
      {
        title: '국내 산업',
        items: [{ headline: 'h', outletNote: null, bullets: [{ text: '사실', note: null, subBullets: [] }], background: null, isReference: false }],
      },
    ];

    const html = buildReportEmailHtml(sections, "'26.09.14 (월)");

    expect(html).not.toContain('* ');
  });

  it('prefixes the headline with "(참고)" for reference-only items', () => {
    const sections: ReportSection[] = [
      { title: '국내 산업', items: [{ headline: '온라인 화제 기사', outletNote: null, bullets: [], background: null, isReference: true }] },
    ];

    const html = buildReportEmailHtml(sections, "'26.09.14 (월)");

    expect(html).toContain('□ (참고) 온라인 화제 기사');
  });

  it('does not prefix headlines for core (non-reference) items', () => {
    const sections: ReportSection[] = [
      { title: '국내 산업', items: [{ headline: '핵심 뉴스', outletNote: null, bullets: [], background: null, isReference: false }] },
    ];

    const html = buildReportEmailHtml(sections, "'26.09.14 (월)");

    expect(html).toContain('□ 핵심 뉴스');
    expect(html).not.toContain('(참고)');
  });

  it('renders a "※" background line after the bullets when background is present', () => {
    const sections: ReportSection[] = [
      {
        title: '국내 산업',
        items: [{ headline: 'h', outletNote: null, bullets: [], background: 'Qubit은 디지털자산 전문 MGA', isReference: false }],
      },
    ];

    const html = buildReportEmailHtml(sections, "'26.09.14 (월)");

    expect(html).toContain('※ Qubit은 디지털자산 전문 MGA');
  });

  it('omits the "※" line when background is null', () => {
    const sections: ReportSection[] = [
      { title: '국내 산업', items: [{ headline: 'h', outletNote: null, bullets: [], background: null, isReference: false }] },
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
            outletNote: '테스트 노트',
            bullets: [{ text: '사실 1', note: '용어 설명', subBullets: ['세부 1'] }],
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
