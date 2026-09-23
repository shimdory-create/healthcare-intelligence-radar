import { Document, Packer, Paragraph, TextRun, AlignmentType, LineRuleType } from 'docx';
import type { ReportCandidate } from './reportCandidates';
import type { CandidateDeepResult } from './reportAnalysis';
import { sourceDisplayName } from './sourceLookup';

export interface ReportBullet {
  text: string;
  /** term-glossary notes for this specific bullet -- rendered directly under it, so the
   *  explanation always sits next to the term it's explaining rather than in one fixed slot
   *  under the headline regardless of which bullet actually used the term. An array (not a
   *  single string) since one bullet's text can name more than one unfamiliar term needing
   *  separate explanations (2026-09-23). */
  notes: string[];
  /** each sub-bullet can carry its own term-glossary notes too (2026-09-21), same reasoning as
   *  a bullet's own notes -- an explanation sits next to the specific sub-bullet that used the
   *  term, not off in one shared slot. */
  subBullets: { text: string; notes: string[] }[];
}

export interface ReportItem {
  headline: string;
  /** term-glossary notes for words in the headline itself (not covered by any bullet's own
   *  notes) -- rendered directly under the headline, before outletNote/bullets. Empty array
   *  when nothing in the headline needs explaining. */
  headlineNotes: string[];
  /** citation naming the specific report/analysis this item's content is based on, when the
   *  article explicitly cites one (2026-09-21, see gemini.ts's DeepAnalysisResult.headlineSource
   *  doc comment) -- a different concept from headlineNotes, rendered as its own line under it. */
  headlineSource: string | null;
  /** the "N개 매체 보도 (매체1, 매체2, ...)" line for multi-outlet items -- distinct from a
   *  bullet's own term-glossary `note`; computed from the candidate's duplicate-group data,
   *  not from Gemini. Null for single-outlet items. */
  outletNote: string | null;
  /** "관련 보도 N건 통합" trace for items that absorbed other same-event candidates via
   *  consolidateSimilarStories (2026-09-21) -- distinct from outletNote, which only reflects
   *  getReportCandidates' exact-title duplicate grouping. Without this, a merge is invisible
   *  to the reader: the dropped items just silently disappear. Null when nothing was merged
   *  into this item. */
  consolidatedNote: string | null;
  bullets: ReportBullet[];
  /** background/context about a company or institution named in the item (e.g. a past
   *  certification, an unrelated business line) -- rendered with a "※ " prefix after the
   *  bullets, distinct from a bullet's own term-glossary note. */
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
// renders each note as its own "* " line at the given left indent -- shared by headline/bullet/
// sub-bullet notes, which only differ in indent depth. Multiple notes stack as consecutive
// lines (2026-09-23: a line can name more than one unfamiliar term).
function notesHtml(notes: string[], indentPx: number): string {
  return notes
    .map((n) => `<p style="margin:2px 0 0 ${indentPx}px;font-size:11px;color:#777;">* ${escapeHtml(n)}</p>`)
    .join('');
}

export function buildReportEmailHtml(sections: ReportSection[], dateLabel: string): string {
  const sectionsHtml = sections
    .map((section, i) => {
      const itemsHtml = section.items
        .map((item) => {
          const headlineNotesHtml = notesHtml(item.headlineNotes, 24);
          const headlineSourceHtml = item.headlineSource
            ? `<p style="margin:2px 0 0 24px;font-size:11px;color:#777;">* ${escapeHtml(item.headlineSource)}</p>`
            : '';
          const outletNoteHtml = item.outletNote
            ? `<p style="margin:2px 0 0 24px;font-size:11px;color:#777;">* ${escapeHtml(item.outletNote)}</p>`
            : '';
          const consolidatedNoteHtml = item.consolidatedNote
            ? `<p style="margin:2px 0 0 24px;font-size:11px;color:#777;">* ${escapeHtml(item.consolidatedNote)}</p>`
            : '';
          const bulletsHtml = item.bullets
            .map((b) => {
              const bulletNotesHtml = notesHtml(b.notes, 36);
              const subHtml = b.subBullets
                .map((s) => {
                  const subNotesHtml = notesHtml(s.notes, 52);
                  return `<p style="margin:2px 0 0 40px;font-size:12px;">·${escapeHtml(s.text)}</p>${subNotesHtml}`;
                })
                .join('');
              return `<p style="margin:2px 0 0 28px;font-size:12px;">- ${escapeHtml(b.text)}</p>${bulletNotesHtml}${subHtml}`;
            })
            .join('');
          const backgroundHtml = item.background
            ? `<p style="margin:4px 0 0;font-size:11px;color:#777;">※ ${escapeHtml(item.background)}</p>`
            : '';
          const headlineText = item.isReference ? `(참고) ${item.headline}` : item.headline;
          return `<p style="margin:10px 0 2px;font-size:13px;font-weight:600;">□ ${escapeHtml(headlineText)}</p>${headlineNotesHtml}${headlineSourceHtml}${outletNoteHtml}${consolidatedNoteHtml}${bulletsHtml}${backgroundHtml}`;
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

    // the multi-outlet promotion path (getReportCandidates' outlet-count rule) has no
    // relevance check of its own -- a job posting or an individual's award can clear "3+
    // outlets" without having any business relevance at all. isRelevant is Gemini's judgment
    // from the full article text (the most accurate point to check), applied to the 'high'
    // path too as a second check on top of analyzeArticles' 1차 classification.
    if (!deep.isRelevant) continue;

    const outletNote = candidate.isMultiOutlet
      ? `${candidate.outletCount}개 매체 보도 (${candidate.outletSourceIds.map(sourceDisplayName).join(', ')})`
      : null;
    // names the merged-in outlets the same way outletNote does, instead of a bare count --
    // user request 2026-09-23 ("다수매체 보도처럼 어디 어디 언급되었는지도 적어줘")
    const consolidatedNote =
      deep.consolidatedCount && deep.consolidatedCount > 1
        ? `관련 보도 ${deep.consolidatedCount}건 통합 (${(deep.consolidatedOutletSourceIds ?? []).map(sourceDisplayName).join(', ')})`
        : null;

    const sectionName: SectionName = candidate.isMultiOutlet ? '다수매체 보도' : deep.category;

    byName.get(sectionName)!.push({
      headline: deep.headline,
      headlineNotes: deep.headlineNotes,
      headlineSource: deep.headlineSource,
      outletNote,
      consolidatedNote,
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
// "※ " background/context line: 12pt (24 half-points), distinct from the 10pt "* " glossary
// note -- the user wants it slightly more readable than a glossary note but still smaller
// than body text.
const BACKGROUND_SIZE = 24;

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
      new TextRun({ text, bold: true, size: BODY_SIZE, font: FONT, characterSpacing: CHAR_SPACING }),
    ],
    spacing: { before: 200, after: 40, ...LINE_SPACING },
    indent: { left: 460, hanging: 260 },
  });
}

// docx-only: every "* " glossary-note line (headline/outlet/consolidated/bullet/sub-bullet
// notes all route through notePara/subNotePara) renders in blue so it visually reads as an
// aside distinct from the black report body -- the "※ " background line is a different marker
// (nicknamed 당구장표) and stays its existing color, not blue (user request 2026-09-23). Email
// HTML (buildReportEmailHtml) is untouched -- blue is docx-only, per the same request.
const NOTE_COLOR = '0070C0';

function notePara(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `* ${text}`, size: NOTE_SIZE, font: FONT, color: NOTE_COLOR, characterSpacing: CHAR_SPACING }),
    ],
    spacing: { after: 60, ...SINGLE_LINE_SPACING },
    indent: { left: 800, hanging: 180 },
  });
}

/** a sub-bullet's own note, nested one level deeper than a bullet's note (left 800) to match
 *  the sub-bullet's own deeper indent (left 880) -- visually anchors the explanation under the
 *  specific sub-bullet it explains, not the bullet above it. */
function subNotePara(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `* ${text}`, size: NOTE_SIZE, font: FONT, color: NOTE_COLOR, characterSpacing: CHAR_SPACING }),
    ],
    spacing: { after: 60, ...SINGLE_LINE_SPACING },
    indent: { left: 1060, hanging: 180 },
  });
}

function backgroundPara(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `※ ${text}`, size: BACKGROUND_SIZE, font: FONT, color: '555555', characterSpacing: CHAR_SPACING }),
    ],
    spacing: { before: 40, after: 60, ...LINE_SPACING },
    // plain 2-character indent (480 twips = 2 * 12pt-em), not a hanging indent -- "※" is just
    // the first two characters of the line, not a marker needing wrapped lines realigned
    // after it the way □/-/· do.
    indent: { left: 480 },
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
      for (const note of item.headlineNotes) children.push(notePara(note));
      if (item.headlineSource) children.push(notePara(item.headlineSource));
      if (item.outletNote) children.push(notePara(item.outletNote));
      if (item.consolidatedNote) children.push(notePara(item.consolidatedNote));
      for (const bullet of item.bullets) {
        children.push(bulletPara(bullet.text));
        for (const note of bullet.notes) children.push(notePara(note));
        for (const sub of bullet.subBullets) {
          children.push(subBulletPara(sub.text));
          for (const note of sub.notes) children.push(subNotePara(note));
        }
      }
      if (item.background) children.push(backgroundPara(item.background));
    }
  });

  children.push(closingPara());

  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(doc);
}
