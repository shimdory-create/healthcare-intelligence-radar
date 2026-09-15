import { Document, Packer, Paragraph, TextRun, AlignmentType, LineRuleType } from 'docx';
import type { ReportCandidate } from './reportCandidates';
import type { CandidateDeepResult } from './reportAnalysis';
import { sourceDisplayName } from './sourceLookup';

export interface ReportBullet {
  text: string;
  subBullets: string[];
}

export interface ReportItem {
  headline: string;
  note: string | null;
  bullets: ReportBullet[];
  /** background/context about a company or institution named in the item (e.g. a past
   *  certification, an unrelated business line) -- rendered with a "※ " prefix after the
   *  bullets, distinct from `note`'s term-glossary role. */
  background: string | null;
  /** true for supplementary/FYI items (e.g. online-buzz pieces with no direct policy/product
   *  impact) -- rendered as a "(참고) " headline prefix rather than a separate section. */
  isReference: boolean;
}

export interface ReportSection {
  title: string;
  items: ReportItem[];
}

type SectionName = '국내 보험·제도' | '국내 산업' | 'Global' | '다수매체 보도';
const SECTION_ORDER: SectionName[] = ['국내 보험·제도', '국내 산업', 'Global', '다수매체 보도'];

function escapeHtml(text: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return text.replace(/[&<>"']/g, (c) => map[c]);
}

/** Renders the report as plain HTML text for the email body -- mirrors buildReportDocx's
 *  structure (title, numbered sections, □ headlines, * notes, - bullets, · sub-bullets) but
 *  as real text rather than a screenshot image. A corporate mail gateway (Samsung's) reliably
 *  blocked the earlier PNG-preview version of this email even though the same content as an
 *  attached docx or as this HTML passed -- a rendered image that's mostly dense Korean text is
 *  a classic phishing-image signature, so the report is no longer screenshotted for email. */
export function buildReportEmailHtml(sections: ReportSection[], dateLabel: string): string {
  const sectionsHtml = sections
    .map((section, i) => {
      const itemsHtml = section.items
        .map((item) => {
          const noteHtml = item.note
            ? `<p style="margin:2px 0 0 24px;font-size:11px;color:#777;">* ${escapeHtml(item.note)}</p>`
            : '';
          const bulletsHtml = item.bullets
            .map((b) => {
              const subHtml = b.subBullets
                .map((s) => `<p style="margin:2px 0 0 40px;font-size:12px;">·${escapeHtml(s)}</p>`)
                .join('');
              return `<p style="margin:2px 0 0 28px;font-size:12px;">- ${escapeHtml(b.text)}</p>${subHtml}`;
            })
            .join('');
          const backgroundHtml = item.background
            ? `<p style="margin:4px 0 0;font-size:11px;color:#777;">※ ${escapeHtml(item.background)}</p>`
            : '';
          const headlineText = item.isReference ? `(참고) ${item.headline}` : item.headline;
          return `<p style="margin:10px 0 2px;font-size:13px;font-weight:600;">□ ${escapeHtml(headlineText)}</p>${noteHtml}${bulletsHtml}${backgroundHtml}`;
        })
        .join('');
      return `<h3 style="margin:16px 0 4px;font-size:14px;">${i + 1}. ${escapeHtml(section.title)}</h3>${itemsHtml}`;
    })
    .join('');

  return `
    <div style="border:1px solid #e5e5e5;border-radius:8px;padding:16px;margin:0 0 16px;">
      <h2 style="text-align:center;margin:0 0 4px;font-size:16px;">Healthcare Market Intelligence</h2>
      <p style="text-align:right;margin:0 0 8px;font-size:11px;color:#666;">${escapeHtml(dateLabel)}</p>
      ${sectionsHtml}
    </div>`;
}

export function buildReportSections(
  candidates: ReportCandidate[],
  deepResults: Map<number, CandidateDeepResult>,
): ReportSection[] {
  const byName = new Map<SectionName, ReportItem[]>(SECTION_ORDER.map((name) => [name, []]));

  for (const candidate of candidates) {
    const deep = deepResults.get(candidate.id);
    // an item with no deep analysis (time budget exhausted before reaching it) has no
    // report-quality content available for it -- rather than show a jarringly different-toned
    // fallback (the plain digest summary, written for a different context entirely), drop it
    // from the report; it's still visible in the regular digest below.
    if (!deep) continue;

    let note = deep.note;
    if (candidate.isMultiOutlet) {
      const outletNames = candidate.outletSourceIds.map(sourceDisplayName).join(', ');
      const outletNote = `${candidate.outletCount}개 매체 보도 (${outletNames})`;
      note = note ? `${outletNote} — ${note}` : outletNote;
    }

    const sectionName: SectionName = candidate.isMultiOutlet ? '다수매체 보도' : deep.category;

    byName.get(sectionName)!.push({
      headline: deep.headline,
      note,
      bullets: deep.bullets,
      background: deep.background,
      isReference: deep.isReference,
    });
  }

  return SECTION_ORDER.map((title) => ({
    title,
    // core (non-reference) items first; supplementary/FYI ("(참고)") items grouped at the end
    items: [...byName.get(title)!].sort((a, b) => Number(a.isReference) - Number(b.isReference)),
  })).filter((section) => section.items.length > 0);
}

const FONT = '바탕체';

// 1.2x multiple line spacing throughout -- docx's "auto" line rule treats 240 as single
// spacing, so 1.2x is 240*1.2 = 288. Spread into every paragraph's `spacing` alongside its
// own before/after values.
const LINE_SPACING = { line: 288, lineRule: LineRuleType.AUTO };

// The "* " glossary note is always a single short line, so the document-wide 1.2x line height
// only adds dead space above and below it without helping readability (1.2x only matters once
// a paragraph wraps to multiple lines) -- single (1x) spacing lets it sit close to the
// headline above and the bullets below instead of floating in extra whitespace.
const SINGLE_LINE_SPACING = { line: 240, lineRule: LineRuleType.AUTO };

// Title is 22pt; everything else in the body (dates, headings, headlines, bullets, closing)
// is a uniform 14pt except the "* " glossary notes, which are 10pt -- docx sizes are in
// half-points, so these are 44/28/20 respectively.
const TITLE_SIZE = 44;
const BODY_SIZE = 28;
const NOTE_SIZE = 20;

// A slight (-0.5pt per character) global tightening applied to headline/bullet/note text --
// docx's characterSpacing is in twips (1/20 pt), so -10 = -0.5pt. This is "방법 1" from the
// 2026-09-15 discussion: a line that overflows by only 1-2 characters often fits back onto one
// line with a barely-perceptible per-character compression, without needing to calculate each
// paragraph's exact wrap point (which would need real font metrics this environment can't
// verify -- no local Word/LibreOffice to render against). Doesn't guarantee every overflow is
// fixed, only reduces how often one happens.
const CHAR_SPACING = -10;

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
      new TextRun({ text: '□ ', size: BODY_SIZE, font: FONT, characterSpacing: CHAR_SPACING }),
      new TextRun({ text, bold: true, underline: {}, size: BODY_SIZE, font: FONT, characterSpacing: CHAR_SPACING }),
    ],
    spacing: { before: 200, after: 40, ...LINE_SPACING },
    indent: { left: 460, hanging: 260 },
  });
}

function notePara(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `* ${text}`, size: NOTE_SIZE, font: FONT, color: '555555', characterSpacing: CHAR_SPACING }),
    ],
    spacing: { after: 60, ...SINGLE_LINE_SPACING },
    indent: { left: 800, hanging: 180 },
  });
}

function backgroundPara(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `※ ${text}`, size: NOTE_SIZE, font: FONT, color: '555555', characterSpacing: CHAR_SPACING }),
    ],
    spacing: { before: 40, after: 60, ...LINE_SPACING },
    indent: { left: 460, hanging: 260 },
  });
}

function bulletPara(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: '- ', size: BODY_SIZE, font: FONT, characterSpacing: CHAR_SPACING }),
      new TextRun({ text, size: BODY_SIZE, font: FONT, characterSpacing: CHAR_SPACING }),
    ],
    spacing: { after: 60, ...LINE_SPACING },
    indent: { left: 620, hanging: 200 },
  });
}

function subBulletPara(text: string): Paragraph {
  return new Paragraph({
    children: [
      // no trailing space after "·" -- the glyph's own right-side bearing already reads as a
      // gap, so an explicit space on top of it left a visibly wider gap than "□ "/"- " get
      new TextRun({ text: '·', size: BODY_SIZE, font: FONT, characterSpacing: CHAR_SPACING }),
      new TextRun({ text, size: BODY_SIZE, font: FONT, characterSpacing: CHAR_SPACING }),
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
      children.push(headlinePara(item.isReference ? `(참고) ${item.headline}` : item.headline));
      if (item.note) children.push(notePara(item.note));
      for (const bullet of item.bullets) {
        children.push(bulletPara(bullet.text));
        for (const sub of bullet.subBullets) children.push(subBulletPara(sub));
      }
      if (item.background) children.push(backgroundPara(item.background));
    }
  });

  children.push(closingPara());

  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(doc);
}
