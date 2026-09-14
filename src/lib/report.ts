import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle } from 'docx';
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
    const bullets: ReportBullet[] = deep
      ? deep.bullets
      : [{ text: fallbackSummaries.get(candidate.id) ?? candidate.title, subBullets: [] }];

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

function titlePara(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, bold: true, size: 32, font: FONT, underline: {} })],
    spacing: { after: 200 },
  });
}

function dateLinePara(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [new TextRun({ text, size: 20, font: FONT })],
    spacing: { after: 300 },
  });
}

function sectionHeadingPara(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 24, font: FONT })],
    spacing: { before: 300, after: 150 },
  });
}

function headlinePara(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: '□ ', bold: true, size: 21, font: FONT }),
      new TextRun({ text, bold: true, underline: {}, size: 21, font: FONT }),
    ],
    spacing: { before: 200, after: 40 },
    indent: { left: 460, hanging: 260 },
  });
}

function notePara(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `* ${text}`, italics: true, size: 17, font: FONT, color: '555555' })],
    spacing: { after: 60 },
    indent: { left: 800, hanging: 180 },
  });
}

function bulletPara(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: '- ', size: 20, font: FONT }),
      new TextRun({ text, size: 20, font: FONT }),
    ],
    spacing: { after: 60 },
    indent: { left: 620, hanging: 200 },
  });
}

function subBulletPara(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: '· ', size: 19, font: FONT }),
      new TextRun({ text, size: 19, font: FONT }),
    ],
    spacing: { after: 40 },
    indent: { left: 880, hanging: 200 },
  });
}

function closingPara(): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: '- 이상 -', size: 20, font: FONT })],
    spacing: { before: 400 },
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
