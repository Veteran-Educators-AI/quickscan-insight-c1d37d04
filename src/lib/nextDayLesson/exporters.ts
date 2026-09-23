// =============================================================================
// NEXT DAY LESSON — EXPORTERS
// =============================================================================
// Every file the teacher can download. Each builder returns { name, blob } so
// the same builder feeds both a single download and the "Download all" zip.
//   - Lesson plan            PDF + DOCX
//   - Presentation           PPTX + PDF
//   - Worksheet              PDF + DOCX
//   - Answer key             PDF + DOCX  (names the error tag to record)
//   - Exit ticket            PDF + DOCX  (two per page, class period box)
//   - Who does which         PPTX + PDF  (names only — goes on the board)
//   - Teacher list           PDF + DOCX  (set, items, check total, evidence)
// =============================================================================

import jsPDF from 'jspdf';
import JSZip from 'jszip';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  LevelFormat,
  PageBreak,
} from 'docx';
import type { NextDayDraft, WorksheetItemDraft } from './types';
import { hillcrestHtmlBlob, openHillcrestHtml } from '@/lib/hillcrestPdf';
import { base, foot, GOLD, INK, LINE, MUTE, mk, RED, SOFT, T } from '@/lib/hillcrestDeck';
import {
  answerKeyHtml,
  calendarLessonHtml,
  exitTicketsHtml,
  firstSixTotal,
  houseFormatLine,
  lessonDeckEntries,
  lessonDeckSlideCount,
  lessonPeriodRows,
  lessonPlanHtml,
  printPackHtml,
  setMap,
  speakerNoteWithFormat,
  standardsText,
  studentBoardName as hillcrestStudentBoardName,
  teacherListHtml,
  tipAlignmentRows,
  tipFindingRows,
  TIP_SOURCE_TEXT,
  totalMap,
  whoDoesWhichHtml,
  worksheetHtml,
} from './hillcrestArtifacts';

export interface ExportFile {
  name: string;
  blob: Blob;
}

// ----------------------------------------------------------------- shared bits

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 40;

const safe = (text: string): string =>
  (text || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2212/g, '-')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00d7/g, 'x')
    .replace(/\u00f7/g, '/')
    // Arrows and maths symbols the built-in PDF fonts cannot draw.
    .replace(/[\u2192\u21d2\u27f6\u27f9]/g, '->')
    .replace(/[\u2190\u21d0]/g, '<-')
    .replace(/[\u2194\u21d4]/g, '<->')
    .replace(/\u2264/g, '<=')
    .replace(/\u2265/g, '>=')
    .replace(/\u2260/g, '!=')
    .replace(/\u2248/g, '~=')
    .replace(/\u00b1/g, '+/-')
    .replace(/\u221a/g, 'sqrt')
    .replace(/\u03c0/g, 'pi')
    .replace(/\u00b7/g, '-')
    .replace(/\u2022/g, '-')
    .replace(/\u2026/g, '...')
    // Anything else outside Latin-1 would render as a stray glyph.
    // eslint-disable-next-line no-control-regex
    .replace(/[^\u0000-\u00ff]/g, '');


const slug = (text: string) => (text || 'file').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

class PdfWriter {
  doc: jsPDF;
  y = MARGIN;

  constructor() {
    this.doc = new jsPDF({ unit: 'pt', format: [PAGE_W, PAGE_H] });
  }

  room(height: number) {
    if (this.y + height > PAGE_H - MARGIN) {
      this.doc.addPage([PAGE_W, PAGE_H]);
      this.y = MARGIN;
    }
  }

  text(value: string, opts: { size?: number; bold?: boolean; gap?: number; indent?: number; color?: number } = {}) {
    const size = opts.size ?? 11;
    const indent = opts.indent ?? 0;
    this.doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    this.doc.setFontSize(size);
    this.doc.setTextColor(opts.color ?? 20);
    const lines = this.doc.splitTextToSize(safe(value), PAGE_W - MARGIN * 2 - indent);
    for (const line of lines) {
      this.room(size + 4);
      this.doc.text(line, MARGIN + indent, this.y);
      this.y += size + 3;
    }
    this.y += opts.gap ?? 4;
  }

  heading(value: string) {
    this.y += 6;
    this.text(value, { size: 14, bold: true, gap: 6 });
  }

  rule() {
    this.room(10);
    this.doc.setDrawColor(190);
    this.doc.line(MARGIN, this.y, PAGE_W - MARGIN, this.y);
    this.y += 10;
  }

  box(height: number, label?: string) {
    this.room(height + 8);
    this.doc.setDrawColor(120);
    this.doc.roundedRect(MARGIN, this.y, PAGE_W - MARGIN * 2, height, 4, 4);
    if (label) {
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(8);
      this.doc.setTextColor(120);
      this.doc.text(safe(label), MARGIN + 6, this.y + 12);
    }
    this.y += height + 12;
  }

  newPage() {
    this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = MARGIN;
  }

  blob(): Blob {
    return this.doc.output('blob');
  }
}

const docHeading = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_2) =>
  new Paragraph({ heading: level, children: [new TextRun({ text, bold: true })] });

const docText = (text: string, opts: { bold?: boolean; italics?: boolean; indent?: number } = {}) =>
  new Paragraph({
    indent: opts.indent ? { left: opts.indent } : undefined,
    children: [new TextRun({ text, bold: opts.bold, italics: opts.italics })],
  });

const docBullet = (text: string) =>
  new Paragraph({ numbering: { reference: 'ndl-bullets', level: 0 }, children: [new TextRun(text)] });

async function buildDocx(children: any[]): Promise<Blob> {
  const document = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 32, bold: true, font: 'Arial' },
          paragraph: { spacing: { before: 240, after: 200 }, outlineLevel: 0 },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 26, bold: true, font: 'Arial' },
          paragraph: { spacing: { before: 200, after: 140 }, outlineLevel: 1 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: 'ndl-bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '\u2022',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBlob(document);
}

const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const cellBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

function docTable(rows: string[][], widths: number[]): Table {
  const total = widths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map(
      (row, rowIndex) =>
        new TableRow({
          children: row.map(
            (value, colIndex) =>
              new TableCell({
                borders: cellBorders,
                width: { size: widths[colIndex], type: WidthType.DXA },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                shading: rowIndex === 0 ? { fill: 'EDF2F7', type: ShadingType.CLEAR } : undefined,
                children: [
                  new Paragraph({ children: [new TextRun({ text: value, bold: rowIndex === 0 })] }),
                ],
              })
          ),
        })
    ),
  });
}

function builtFromLine(draft: NextDayDraft): string {
  const b = draft.builtFrom;
  const when = b.worksheetDate ? new Date(b.worksheetDate).toLocaleDateString() : 'undated';
  return `Built from results actually received: ${b.className} · ${b.worksheetCode} (${b.worksheetTitle}) · ${when} · ${b.papers} paper(s) from ${b.studentCount} student(s).`;
}


function assertReadyForExport(draft: NextDayDraft) {
  const unchecked = [...(draft.worksheet.items || []), ...(draft.exitTicket.items || [])].filter((item) => item.verified !== true);
  if (unchecked.length > 0) {
    throw new Error(`This pack cannot be exported until every number is checked. Unchecked item(s): ${unchecked.map((i) => i.itemNumber).join(', ')}.`);
  }
  const badTotals = (draft.grouping.groups || []).filter((group) => {
    const sum = group.itemNumbers.reduce((total, n) => {
      const found = draft.worksheet.items.find((item) => item.itemNumber === n);
      return total + (typeof found?.answerNumeric === 'number' ? found.answerNumeric : 0);
    }, 0);
    return Math.abs(Math.round(sum * 1000) / 1000 - group.checkTotal) > 1e-6;
  });
  if (badTotals.length > 0) {
    throw new Error(`This pack cannot be exported because a check total is stale: ${badTotals.map((g) => g.label).join(', ')}.`);
  }
}

// ------------------------------------------------------------------ lesson plan

export function lessonPlanPdf(draft: NextDayDraft): ExportFile {
  assertReadyForExport(draft);
  return { name: `${slug(draft.className)}-lesson-plan.pdf`, blob: hillcrestHtmlBlob(lessonPlanHtml(draft)) };
}

export async function lessonPlanDocx(draft: NextDayDraft): Promise<ExportFile> {
  assertReadyForExport(draft);
  const plan = draft.lessonPlan;
  const coverage = formatCoverageRows(draft);
  const totalSlides = (draft.slides?.length || 0) + 2;
  const children: any[] = [
    docHeading(plan.title || draft.nextLessonTitle, HeadingLevel.HEADING_1),
    docText(`${draft.className} · ${draft.nextLessonDate} · ${plan.durationMinutes || 45} minutes`),
    docText(builtFromLine(draft), { italics: true }),
    docHeading('Identity'),
    docTable(
      [
        ['Date and topic', `${draft.nextLessonDate}${draft.dayNumber ? ` · Day ${draft.dayNumber}` : ''} · ${draft.nextLessonTitle}`],
        ['Aim', plan.aim || draft.nextLessonTitle],
        ['Built from', builtFromLine(draft)],
        ['Materials', `Slides (${totalSlides}, the last two teacher-reference — hide them before you present); worksheet sides; exit tickets; Who Does Which`],
      ],
      [2200, 7460]
    ),
    docHeading('Standards'),
    docText((plan.standards || []).join(', ') || 'Standards not supplied'),
    docHeading('The period'),
    docTable(
      [['Minutes', 'Slides', 'What happens'], ...(plan.timeline || []).map((step, index) => [String(step.minutes), String(index + 1), `${step.label}: ${step.detail}`])],
      [1200, 1200, 7260]
    ),
    docHeading('Format coverage — where each required element is done'),
    docTable([['Required element', 'Where', 'Exactly what does it'], ...coverage.map((row) => [row.element, row.where.replace(/<[^>]*>/g, ''), row.what.replace(/<[^>]*>/g, '')])], [2800, 1800, 5060]),
    ...(coverage.some((row) => row.met === false)
      ? [docText('Format exception: the teacher can live with it for this lesson, change the pack, or change the rule.', { bold: true })]
      : []),
    docHeading('Where this sits on the calendar'),
    docText(`Yesterday: ${draft.builtFrom.worksheetTitle}`),
    docText(`Today: ${draft.nextLessonTitle}`),
    docText('Regents: Thursday 17 June 2027.'),
    docHeading('Supports'),
    ...(plan.differentiationNotes?.length ? plan.differentiationNotes.map(docBullet) : [docBullet('Side 2 help card, answer strip, and check totals.')]),
  ];

  return { name: `${slug(draft.className)}-lesson-plan.docx`, blob: await buildDocx(children) };
}

// ----------------------------------------------------------------- presentation

const DECK_BG = '10213A';
const DECK_ACCENT = 'F2B237';

export async function presentationPptx(draft: NextDayDraft): Promise<ExportFile> {
  assertReadyForExport(draft);
  const pptx = mk();
  pptx.author = 'Nycologic Ai';
  pptx.title = draft.lessonPlan.title || draft.nextLessonTitle;
  const footerText = `${courseOf(draft)} · ${draft.dayNumber ? `Day ${draft.dayNumber}` : 'Day'} · ${draft.nextLessonTitle} · ${draft.nextLessonDate}`;

  (draft.slides || []).forEach((slide, index) => {
    const kind = String(slide.kind);
    if (kind === 'title') {
      const s = pptx.addSlide();
      s.background = { color: INK };
      s.addText(slide.title || draft.nextLessonTitle, { x: 0.7, y: 1.15, w: 11.8, h: 1.1, fontSize: 46, bold: true, color: 'FFFFFF', fontFace: 'Georgia', margin: 0 });
      s.addShape(pptx.ShapeType.rect, { x: 0.7, y: 2.45, w: 2.5, h: 0.04, fill: { color: 'FFFFFF' } });
      s.addText(`${draft.className} · ${draft.dayNumber ? `Unit day ${draft.dayNumber}` : 'Unit day'} · ${draft.nextLessonDate} · Mr. Francois`, { x: 0.7, y: 2.72, w: 11.8, h: 0.35, fontSize: 14, color: LINE, fontFace: 'Arial', margin: 0 });
      if (slide.bullets?.length) T(s, slide.bullets.slice(0, 3), { x: 0.7, y: 3.35, w: 10.8, h: 1.5, fontSize: 22, color: 'FFFFFF' });
      foot(s, footerText);
      s.addNotes(speakerNoteWithFormat(slide, index));
      return;
    }
    const kickerByKind: Record<string, string> = { 'do-now': 'DO NOW', 'reteach-worked': 'REPAIR FROM YESTERDAY', teaching: `SIDE 1 · ${Math.min(4, index)}`, 'independent-work': 'SIDES 3–4', 'exit-ticket': 'EXIT TICKET', debrief: 'DEBRIEF' };
    const tagByKind: Record<string, string> = { 'do-now': 'DO NOW', 'independent-work': 'SIDES 3–4', 'exit-ticket': 'EXIT TICKET' };
    const s = base(pptx, slide.title || 'Lesson slide', kickerByKind[kind] || kind.toUpperCase(), tagByKind[kind]);
    const bullets = (slide.bullets || []).slice(0, 5);
    if (kind === 'reteach-worked') {
      s.addShape(pptx.ShapeType.rect, { x: 0.75, y: 1.72, w: 11.8, h: 2.3, fill: { color: SOFT }, line: { color: RED, width: 1.1 } });
      T(s, bullets, { x: 1.0, y: 1.95, w: 11.2, h: 1.9, fontSize: 23, color: INK });
    } else {
      T(s, bullets, { x: 0.85, y: 1.72, w: 7.2, h: 3.6, fontSize: kind === 'debrief' ? 20 : 24, color: INK });
      if (['do-now', 'teaching', 'debrief'].includes(kind)) {
        s.addShape(pptx.ShapeType.rect, { x: 8.45, y: 1.72, w: 3.45, h: 2.55, fill: { color: SOFT }, line: { color: SOFT } });
        T(s, ['Sentence starters', 'I notice that...', 'The number that helps is...', 'I can check by...'], { x: 8.68, y: 1.95, w: 3.0, h: 2.1, fontSize: 15, color: INK, bold: false });
      }
    }
    foot(s, footerText);
    s.addNotes(speakerNoteWithFormat(slide, index));
  });

  const coverage = formatCoverageRows(draft);
  [coverage.slice(0, 9), coverage.slice(9, 18)].forEach((rows, pageIndex) => {
    const s = base(pptx, `Format coverage — ${pageIndex + 1} of 2`, 'TEACHER REFERENCE · NOT FOR DISPLAY', 'DO NOT PROJECT');
    s.addTable(
      [['Required element', 'Where it is done'], ...rows.map((row) => [row.element, row.where.replace(/<[^>]*>/g, '')])],
      { x: 0.6, y: 1.68, w: 12.1, h: 4.9, colW: [4.6, 7.5], rowH: 0.5, fontSize: 14, valign: 'middle', border: { type: 'solid', color: '999999', pt: 1 }, color: INK, fontFace: 'Arial' } as any
    );
    foot(s, 'Teacher reference · keep these two slides out of presentation mode');
    s.addNotes('These two slides are for you and for an observer. Hide them before you present.');
  });

  const data = (await pptx.write({ outputType: 'blob' })) as Blob;
  return { name: `${slug(draft.className)}-presentation.pptx`, blob: data };
}

export function presentationPdf(draft: NextDayDraft): ExportFile {
  assertReadyForExport(draft);
  return { name: `${slug(draft.className)}-presentation.pdf`, blob: hillcrestHtmlBlob(lessonPlanHtml(draft)) };
}

// -------------------------------------------------------------------- worksheet

const courseOf = (draft: NextDayDraft) =>
  /stat/i.test(draft.className) ? 'Statistics' : /alg/i.test(draft.className) ? 'Algebra II' : draft.className;
const standardsOf = (draft: NextDayDraft) => (draft.lessonPlan?.standards || []).join(', ');
const studentBoardName = (student: { name: string; realName?: string }) => student.realName?.trim() || student.name;
const periodOf = (draft: NextDayDraft) => {
  const match = draft.className.match(/period\s*(\d+)/i) || draft.className.match(/\bp\s*(\d+)/i);
  return match ? `Period ${match[1]}` : draft.className;
};
const dayFooterOf = (draft: NextDayDraft) =>
  [courseOf(draft), draft.dayNumber ? `Day ${draft.dayNumber}` : '', draft.nextLessonTitle].filter(Boolean).join(' · ');

function worksheetHeader(w: PdfWriter, draft: NextDayDraft) {
  const doc = w.doc;
  const title = draft.worksheet.title || draft.nextLessonTitle;
  // running header, top right
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text(safe(`${courseOf(draft)} · ${title}`), PAGE_W - MARGIN, MARGIN - 14, { align: 'right' });
  w.y = MARGIN + 10;
  w.text(title, { size: 20, bold: true, gap: 2 });
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(11);
  doc.setTextColor(60);
  const stds = standardsOf(draft);
  doc.text(safe(`${courseOf(draft)} · Practice sheet${stds ? ` · NYS ${stds}` : ''}`), MARGIN, w.y + 4);
  w.y += 26;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(20);
  doc.text('Name: _______________________________   ID: __________   Date: ______________   Period: ______', MARGIN, w.y);
  w.y += 16;

  // Directions box
  const directions =
    (draft.worksheet.instructions ? draft.worksheet.instructions + ' ' : '') +
    `Everyone has the same sheet. Work only the ${draft.grouping.itemsPerStudent} items listed on your card (the item lists are also on the board). Write your final answers on the answer strip at the end and show your work under each item. When you finish, add your ${draft.grouping.itemsPerStudent} answers and compare with the CHECK total your teacher gives your set.`;
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(safe(directions), PAGE_W - MARGIN * 2 - 16);
  const h = 26 + lines.length * 13;
  doc.setDrawColor(40);
  doc.setLineWidth(0.8);
  doc.rect(MARGIN, w.y, PAGE_W - MARGIN * 2, h);
  doc.setFont('helvetica', 'bold');
  doc.text('Directions', MARGIN + 8, w.y + 15);
  doc.setFont('helvetica', 'normal');
  lines.forEach((l: string, i: number) => doc.text(l, MARGIN + 8, w.y + 29 + i * 13));
  doc.setLineWidth(0.2);
  w.y += h + 22;
}

function worksheetFooter(w: PdfWriter, draft: NextDayDraft) {
  const doc = w.doc;
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110);
    const stds = standardsOf(draft);
    if (stds) doc.text(safe(stds), MARGIN, PAGE_H - MARGIN / 2);
    doc.text(`${p} / ${pages}`, PAGE_W - MARGIN, PAGE_H - MARGIN / 2, { align: 'right' });
  }
}

export function worksheetPdf(draft: NextDayDraft): ExportFile {
  assertReadyForExport(draft);
  return { name: `${slug(draft.className)}-worksheet.pdf`, blob: hillcrestHtmlBlob(worksheetHtml(draft)) };
}

export async function worksheetDocx(draft: NextDayDraft): Promise<ExportFile> {
  assertReadyForExport(draft);
  const stds = standardsOf(draft);
  const children: any[] = [
    docHeading(draft.worksheet.title || draft.nextLessonTitle, HeadingLevel.HEADING_1),
    docText(`${courseOf(draft)} · Practice sheet${stds ? ` · NYS ${stds}` : ''}`, { italics: true }),
    docText('Name ______________________________   Period — write the digit ______   Date ____________'),
    docText('Everyone has the same sheet. Work only the 8 items on the list next to your name. Write answers on the strip and compare your check total.'),
  ];
  for (const item of draft.worksheet.items) {
    children.push(docText(`${item.itemNumber}.  ${item.prompt}`, { bold: true }), docText(' '), docText(' '));
  }
  return { name: `${slug(draft.className)}-worksheet.docx`, blob: await buildDocx(children) };
}

// ------------------------------------------------------------------- answer key

function keyRows(items: WorksheetItemDraft[]): string[][] {
  return [
    ['Item', 'Answer', 'Check', 'Skill', 'If wrong, record'],
    ...items.map((i) => [
      String(i.itemNumber),
      i.answer || String(i.answerNumeric ?? ''),
      i.verifyNote || i.verify || '',
      i.skillTag || '',
      i.errorTagIfWrong || '',
    ]),
  ];
}

export function answerKeyPdf(draft: NextDayDraft): ExportFile {
  assertReadyForExport(draft);
  return { name: `${slug(draft.className)}-answer-key.pdf`, blob: hillcrestHtmlBlob(answerKeyHtml(draft)) };
}

export async function answerKeyDocx(draft: NextDayDraft): Promise<ExportFile> {
  assertReadyForExport(draft);
  const children: any[] = [
    docHeading('Answer key — teacher only', HeadingLevel.HEADING_1),
    docText(`${draft.worksheet.title} · ${draft.className} · ${draft.nextLessonDate}`),
    docText(builtFromLine(draft), { italics: true }),
    docTable(keyRows(draft.worksheet.items), [700, 2400, 2400, 2200, 2160]),
    docHeading('Check totals'),
    ...draft.grouping.groups.map((g) =>
      docBullet(`${g.label} — items ${g.itemNumbers.join(', ')} — check total ${g.checkTotal} — first six ${firstSixTotal(draft, g.itemNumbers)}`)
    ),
  ];
  return { name: `${slug(draft.className)}-answer-key.docx`, blob: await buildDocx(children) };
}

// ------------------------------------------------------------------ exit ticket

function exitTicketHalf(w: PdfWriter, draft: NextDayDraft, top: number) {
  const doc = w.doc;
  const half = PAGE_H / 2;
  const boxTop = top === 0 ? MARGIN / 2 : half + 12;
  const boxH = half - MARGIN / 2 - 12;
  const inner = PAGE_W - MARGIN * 2;

  // cut line
  if (top === 1) {
    doc.setDrawColor(120);
    doc.setLineDashPattern([4, 3], 0);
    doc.line(MARGIN / 2, half, PAGE_W - MARGIN / 2, half);
    doc.setLineDashPattern([], 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text('cut here', MARGIN / 2, half - 3);
  }
  // outer border
  doc.setDrawColor(60);
  doc.setLineWidth(0.8);
  doc.rect(MARGIN - 10, boxTop, inner + 20, boxH);
  doc.setLineWidth(0.2);

  // dark banner label
  const banner = safe((draft.exitTicket.title || 'Exit ticket').toUpperCase());
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  const bw = doc.getTextWidth(banner) + 16;
  doc.setFillColor(50, 50, 50);
  doc.rect(MARGIN, boxTop + 12, bw, 16, 'F');
  doc.setTextColor(255);
  doc.text(banner, MARGIN + 8, boxTop + 23.5);

  // Name / Period / Date line
  let y = boxTop + 50;
  doc.setTextColor(20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Name', MARGIN, y);
  doc.text('Period — write the digit', MARGIN + inner * 0.52, y);
  doc.text('Date', MARGIN + inner * 0.84, y);
  doc.setDrawColor(40);
  doc.line(MARGIN, y + 3, MARGIN + inner * 0.48, y + 3);
  doc.line(MARGIN + inner * 0.52, y + 3, MARGIN + inner * 0.8, y + 3);
  doc.line(MARGIN + inner * 0.84, y + 3, MARGIN + inner, y + 3);
  y += 18;

  // intro line
  const n = draft.exitTicket.items.length;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  const lead = 'Exit ticket — ';
  doc.text(lead, MARGIN, y);
  doc.setFont('helvetica', 'normal');
  const intro = doc.splitTextToSize(
    `Put your class period in that box, not your grade. ${n} questions, ${Math.max(3, n + 1)} minutes. Answer what you can — a blank tells me something too.`,
    inner - doc.getTextWidth(lead)
  );
  intro.forEach((l: string, i: number) => doc.text(l, MARGIN + (i === 0 ? doc.getTextWidth(lead) : 0), y + i * 11));
  y += intro.length * 11 + 14;

  // questions with open space
  const space = Math.max(40, (boxTop + boxH - 14 - y) / n - 16);
  for (const item of draft.exitTicket.items) {
    doc.setFontSize(11);
    const body = doc.splitTextToSize(safe(item.prompt), inner - 20);
    doc.setFont('helvetica', 'bold');
    doc.text(`${item.itemNumber}.`, MARGIN, y);
    doc.setFont('helvetica', 'normal');
    body.forEach((l: string, i: number) => doc.text(l, MARGIN + 18, y + i * 14));
    y += body.length * 14 + space;
  }
}

export function exitTicketPdf(draft: NextDayDraft): ExportFile {
  assertReadyForExport(draft);
  return { name: `${slug(draft.className)}-exit-ticket.pdf`, blob: hillcrestHtmlBlob(exitTicketsHtml(draft)) };
}

export async function exitTicketDocx(draft: NextDayDraft): Promise<ExportFile> {
  assertReadyForExport(draft);
  const n = draft.exitTicket.items.length;
  const half = (): any[] => [
    docText((draft.exitTicket.title || 'Exit ticket').toUpperCase(), { bold: true }),
    docText('Name ______________________    Period — write the digit ______    Date __________'),
    docText(`Exit ticket — Put your class period in that box, not your grade. ${n} questions.`, { italics: true }),
    ...draft.exitTicket.items.flatMap((item) => [docText(`${item.itemNumber}.  ${item.prompt}`, { bold: true }), docText(' '), docText(' ')]),
  ];
  const children = [...half(), new Paragraph({ children: [new TextRun('— — — — — — — — — cut here — — — — — — — — —')] }), new Paragraph({ children: [new PageBreak()] }), ...half()];
  return { name: `${slug(draft.className)}-exit-ticket.docx`, blob: await buildDocx(children) };
}

export function exitTicketKeyPdf(draft: NextDayDraft): ExportFile {
  assertReadyForExport(draft);
  return { name: `${slug(draft.className)}-exit-ticket-key.pdf`, blob: hillcrestHtmlBlob(answerKeyHtml(draft)) };
}

// -------------------------------------------------------------- who does which

export async function whoDoesWhichPptx(draft: NextDayDraft): Promise<ExportFile> {
  assertReadyForExport(draft);
  const pptx = mk();
  pptx.title = `${draft.className} — who does which problems`;
  const fallback = draft.grouping.groups[1] || draft.grouping.groups[0];

  const firstSlide = pptx.addSlide();
  firstSlide.background = { color: 'FFFFFF' };
  firstSlide.addText('Find your name. Do the 8 items next to it.', { x: 0.75, y: 1.55, w: 11.7, h: 0.75, fontSize: 34, bold: true, color: INK, fontFace: 'Georgia', align: 'center' });
  firstSlide.addText('Everyone does 8. Everyone checks a total.', { x: 0.75, y: 2.55, w: 11.7, h: 0.45, fontSize: 20, color: MUTE, fontFace: 'Arial', align: 'center' });
  firstSlide.addNotes('[Format: the board version.] Put this on the board as students come in. Names, item numbers, and totals only.');

  const boardSlide = base(pptx, `${periodOf(draft)} · find your name`, 'WORKSHEET SIDES 3–4', periodOf(draft).toUpperCase());
  let y = 1.6;
  draft.grouping.groups.forEach((group) => {
    const names = group.students.map(hillcrestStudentBoardName);
    const boxH = 0.5 + 0.36 * Math.max(1, Math.ceil(names.length / 3));
    boardSlide.addShape(pptx.ShapeType.rect, { x: 0.75, y, w: 11.85, h: boxH, fill: { color: SOFT }, line: { color: INK, width: 1 } });
    boardSlide.addText(`Items ${group.itemNumbers.join(', ')} · check total ${group.checkTotal}`, { x: 1.0, y: y + 0.14, w: 11.35, h: 0.25, fontSize: 13, bold: true, color: GOLD, fontFace: 'Arial' });
    boardSlide.addText(names.join('    ·    ') || 'No names in this group', { x: 1.0, y: y + 0.48, w: 11.2, h: Math.max(0.3, boxH - 0.55), fontSize: 17, color: INK, fontFace: 'Arial', fit: 'shrink' });
    y += boxH + 0.12;
  });
  if (fallback) boardSlide.addText(`Name not here? Items ${fallback.itemNumbers.join(', ')} (check total ${fallback.checkTotal})`, { x: 0.75, y: 6.55, w: 11.6, h: 0.3, fontSize: 14, bold: true, color: INK, fontFace: 'Arial' });
  foot(boardSlide, dayFooterOf(draft));
  boardSlide.addNotes('[Format: the board version.] No set numbers, no reasons, no scores — only names, item numbers and the check total.');

  const done = base(pptx, 'Finished early?', 'BOARD DIRECTIONS');
  const items = draft.worksheet.items;
  const square = items[10]?.itemNumber || items[0]?.itemNumber || 1;
  const diamond = items[12]?.itemNumber || items[1]?.itemNumber || 2;
  T(done, [`■ Do item ${square} first.`, `◆ Then do item ${diamond}.`, 'Write one sentence explaining how you checked it.'], { x: 1.0, y: 1.85, w: 10.8, h: 2.3, fontSize: 30, color: INK });
  foot(done, dayFooterOf(draft));
  done.addNotes('[Format: the ■ → ◆ Set 4 pair.] The square task is first, then the diamond follow-up.');

  const data = (await pptx.write({ outputType: 'blob' })) as Blob;
  return { name: `${slug(draft.className)}-who-does-which.pptx`, blob: data };
}

export function whoDoesWhichPdf(draft: NextDayDraft): ExportFile {
  assertReadyForExport(draft);
  return { name: `${slug(draft.className)}-who-does-which.pdf`, blob: hillcrestHtmlBlob(whoDoesWhichHtml(draft)) };
}

// ------------------------------------------------------------- teacher-only list

function teacherRows(draft: NextDayDraft): string[][] {
  const rows: string[][] = [['Student', 'Set', 'Items', 'Check total', 'Evidence from their paper']];
  for (const group of draft.grouping.groups) {
    for (const student of group.students) {
      rows.push([
        studentBoardName(student),
        group.label,
        group.itemNumbers.join(', '),
        String(group.checkTotal),
        student.evidence,
      ]);
    }
  }
  for (const student of draft.grouping.noResultsYet) {
    rows.push([studentBoardName(student), 'not set', '—', '—', 'No results received yet']);
  }
  return rows;
}

export function teacherListPdf(draft: NextDayDraft): ExportFile {
  assertReadyForExport(draft);
  return { name: `${slug(draft.className)}-teacher-list.pdf`, blob: hillcrestHtmlBlob(teacherListHtml(draft)) };
}

export async function teacherListDocx(draft: NextDayDraft): Promise<ExportFile> {
  assertReadyForExport(draft);
  const children: any[] = [
    docHeading('Who does which — teacher list', HeadingLevel.HEADING_1),
    docText(`${draft.className} · ${draft.nextLessonDate}`),
    docText(builtFromLine(draft), { italics: true }),
    docTable(teacherRows(draft), [2400, 1100, 2200, 1400, 2560]),
  ];
  return { name: `${slug(draft.className)}-teacher-list.docx`, blob: await buildDocx(children) };
}

// ----------------------------------------------------------------- download all

export async function allFiles(draft: NextDayDraft): Promise<ExportFile[]> {
  return [
    lessonPlanPdf(draft),
    await lessonPlanDocx(draft),
    await presentationPptx(draft),
    presentationPdf(draft),
    worksheetPdf(draft),
    await worksheetDocx(draft),
    answerKeyPdf(draft),
    await answerKeyDocx(draft),
    exitTicketPdf(draft),
    await exitTicketDocx(draft),
    exitTicketKeyPdf(draft),
    await whoDoesWhichPptx(draft),
    whoDoesWhichPdf(draft),
    teacherListPdf(draft),
    await teacherListDocx(draft),
  ];
}

export async function zipAll(draft: NextDayDraft): Promise<ExportFile> {
  const zip = new JSZip();
  const folder = zip.folder(`${slug(draft.className)}-${slug(draft.nextLessonTitle)}`)!;
  for (const file of await allFiles(draft)) {
    folder.file(file.name, file.blob);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  return { name: `${slug(draft.className)}-next-day-lesson.zip`, blob };
}

export function download(file: ExportFile) {
  if (file.blob.type.includes('html') && file.name.endsWith('.pdf')) {
    file.blob.text().then((html) => openHillcrestHtml(html, file.name));
    return;
  }
  const url = URL.createObjectURL(file.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ------------------------------------------------- one combined print-ready PDF

/**
 * Everything the printer needs in one document, in the order it is handed out:
 * worksheet, exit ticket (two per page), then the teacher-only answer key.
 */
export function printPackPdf(draft: NextDayDraft): ExportFile {
  assertReadyForExport(draft);
  return { name: `${slug(draft.className)}-print-pack.pdf`, blob: hillcrestHtmlBlob(printPackHtml(draft)) };
}

// ------------------------------------------ plain calendar lesson (no results)

export interface CalendarLessonInput {
  className: string;
  dateLabel: string;
  dayNumber: number | null;
  title: string;
  unitLabel: string | null;
  standards: string[];
}

/**
 * For a class with no results received: the calendar lesson only. It carries no
 * percentages, no item calls and no student names, because there is no data —
 * it is a blank frame for the teacher to teach from.
 */
export function calendarLessonPdf(input: CalendarLessonInput): ExportFile {
  return { name: `${slug(input.className)}-calendar-lesson.pdf`, blob: hillcrestHtmlBlob(calendarLessonHtml(input)) };
}

/** Open a generated file in one new tab, ready for the printer. */
export function openInNewTab(file: ExportFile) {
  if (file.blob.type.includes('html')) {
    file.blob.text().then((html) => openHillcrestHtml(html, file.name));
    return true;
  }
  const url = URL.createObjectURL(file.blob);
  const tab = window.open(url, '_blank');
  if (!tab) URL.revokeObjectURL(url);
  else setTimeout(() => URL.revokeObjectURL(url), 60000);
  return !!tab;
}
