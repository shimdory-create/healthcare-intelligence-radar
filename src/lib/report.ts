import { Document, Packer, Paragraph, TextRun, AlignmentType, LineRuleType } from 'docx';
import type { ReportCandidate } from './reportCandidates';
import type { CandidateDeepResult } from './reportAnalysis';

export interface ReportBullet {
  text: string;
  subBullets: string[];
}

export interface ReportItem {
  headline: string;
  note: string | null;
  bullets: ReportBullet[];
}

export interface ReportSection {
  title: string;
  items: ReportItem[];
}

type SectionName = '국내 보험·제도' | '국내 산업' | 'Global' | '다수매체 보도';
const SECTION_ORDER: SectionName[] = ['국내 보험·제도', '국내 산업', 'Global', '다수매체 보도'];

/** items with no deep analysis (fetch/extraction/Gemini all failed for it, or the
 *  deadline was reached first) fall back to this default category -- an honest,
 *  simple catch-all rather than guessing from tags. */
const FALLBACK_CATEGORY: SectionName = '국내 산업';

export function buildReportSections(
  candidates: ReportCandidate[],
  deepResults: Map<number, CandidateDeepResult>,
  fallbackSummaries: Map<number, string>,
): ReportSection[] {
  const byName = new Map<SectionName, ReportItem[]>(SECTION_ORDER.map((name) => [name, []]));

  for (const candidate of candidates) {
    const deep = deepResults.get(candidate.id);

    let note = deep?.note ?? null;
    // When deep analysis is missing, fall back to the article's existing short summary
    // (already in ai_analysis) as a single bullet. If even that doesn't exist -- no
    // ai_analysis row at all, which now happens routinely for rule-based-low articles
    // (skipped from AI enrichment entirely) and for rule-based-high articles past an
    // early-stopped enrichment cutoff -- don't echo the headline back as its own bullet;
    // say plainly that no summary is available.
    const fallbackSummary = fallbackSummaries.get(candidate.id);
    const bullets: ReportBullet[] = deep
      ? deep.bullets
      : [{ text: fallbackSummary ?? '요약 정보 없음', subBullets: [] }];

    const sectionName: SectionName = candidate.isMultiOutlet
      ? '다수매체 보도'
      : (deep?.category ?? FALLBACK_CATEGORY);

    if (candidate.isMultiOutlet) {
      const outletNote = `국내 ${candidate.outletCount}개 매체 보도`;
      note = note ? `${outletNote} — ${note}` : outletNote;
    }

    byName.get(sectionName)!.push({ headline: candidate.title, note, bullets });
  }

  return SECTION_ORDER.map((title) => ({ title, items: byName.get(title)! })).filter(
    (section) => section.items.length > 0,
  );
}

const FONT = '바탕체';

// 1.2x multiple line spacing throughout -- docx's "auto" line rule treats 240 as single
// spacing, so 1.2x is 240*1.2 = 288. Spread into every paragraph's `spacing` alongside its
// own before/after values.
const LINE_SPACING = { line: 288, lineRule: LineRuleType.AUTO };

// Title is 22pt; everything else in the body (dates, headings, headlines, bullets, closing)
// is a uniform 14pt except the "* " glossary notes, which are 10pt -- docx sizes are in
// half-points, so these are 44/28/20 respectively.
const TITLE_SIZE = 44;
const BODY_SIZE = 28;
const NOTE_SIZE = 20;

function titlePara(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, bold: true, size: TITLE_SIZE, font: FONT, underline: {} })],
    spacing: { after: 200, ...LINE_SPACING },
  });
}

function dateLinePara(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [new TextRun({ text, size: BODY_SIZE, font: FONT })],
    spacing: { after: 300, ...LINE_SPACING },
  });
}

function sectionHeadingPara(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: BODY_SIZE, font: FONT })],
    spacing: { before: 300, after: 150, ...LINE_SPACING },
  });
}

function headlinePara(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: '□ ', bold: true, size: BODY_SIZE, font: FONT }),
      new TextRun({ text, bold: true, underline: {}, size: BODY_SIZE, font: FONT }),
    ],
    spacing: { before: 200, after: 40, ...LINE_SPACING },
    indent: { left: 460, hanging: 260 },
  });
}

function notePara(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `* ${text}`, italics: true, size: NOTE_SIZE, font: FONT, color: '555555' })],
    spacing: { after: 60, ...LINE_SPACING },
    indent: { left: 800, hanging: 180 },
  });
}

function bulletPara(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: '- ', size: BODY_SIZE, font: FONT }),
      new TextRun({ text, size: BODY_SIZE, font: FONT }),
    ],
    spacing: { after: 60, ...LINE_SPACING },
    indent: { left: 620, hanging: 200 },
  });
}

function subBulletPara(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: '· ', size: BODY_SIZE, font: FONT }),
      new TextRun({ text, size: BODY_SIZE, font: FONT }),
    ],
    spacing: { after: 40, ...LINE_SPACING },
    indent: { left: 880, hanging: 200 },
  });
}

function closingPara(): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [new TextRun({ text: '- 이 상 -', size: BODY_SIZE, font: FONT })],
    spacing: { before: 400, ...LINE_SPACING },
  });
}

export async function buildReportDocx(
  sections: ReportSection[],
  dateLabel: string,
  teamLabel: string,
): Promise<Buffer> {
  const children: Paragraph[] = [titlePara('Healthcare Market Intelligence'), dateLinePara(`${dateLabel} / ${teamLabel}`)];

  sections.forEach((section, sectionIndex) => {
    children.push(sectionHeadingPara(`${sectionIndex + 1}. ${section.title}`));
    for (const item of section.items) {
      children.push(headlinePara(item.headline));
      if (item.note) children.push(notePara(item.note));
      for (const bullet of item.bullets) {
        children.push(bulletPara(bullet.text));
        for (const sub of bullet.subBullets) children.push(subBulletPara(sub));
      }
    }
  });

  children.push(closingPara());

  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(doc);
}
