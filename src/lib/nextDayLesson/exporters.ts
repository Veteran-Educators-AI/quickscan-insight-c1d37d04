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
import pptxgen from 'pptxgenjs';
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

// ------------------------------------------------------------------ lesson plan

export function lessonPlanPdf(draft: NextDayDraft): ExportFile {
  const plan = draft.lessonPlan;
  const w = new PdfWriter();
  w.text(plan.title || draft.nextLessonTitle, { size: 20, bold: true });
  w.text(`${draft.className} · ${draft.nextLessonDate} · ${plan.durationMinutes || 45} minutes`, { size: 11, color: 90 });
  w.text(builtFromLine(draft), { size: 9, color: 110, gap: 8 });
  w.rule();

  w.text(`Aim: ${plan.aim}`, { bold: true });
  if (plan.objective) w.text(`Objective: ${plan.objective}`);
  if (plan.standards?.length) w.text(`Standards: ${plan.standards.join(', ')}`);

  w.heading('Period at a glance');
  for (const step of plan.timeline || []) {
    w.text(`${step.minutes} min — ${step.label}: ${step.detail}`, { indent: 10, gap: 2 });
  }

  w.heading('Reteach — what today showed');
  if (plan.reteach?.summary) w.text(plan.reteach.summary);
  for (const item of plan.reteach?.items || []) {
    w.text(
      `Item ${item.itemNumber} — ${item.percentCorrect ?? 0}% correct${item.skillTag ? ` (${item.skillTag})` : ''}`,
      { bold: true, gap: 2 }
    );
    if (item.wrongAnswersQuoted?.length) {
      w.text(`Students wrote: ${item.wrongAnswersQuoted.map((a) => `"${a}"`).join(', ')}`, { indent: 14, gap: 2 });
    }
    if (item.whatWentWrong) w.text(`What went wrong: ${item.whatWentWrong}`, { indent: 14, gap: 2 });
    if (item.howToRepair) w.text(`Repair: ${item.howToRepair}`, { indent: 14 });
  }
  for (const line of plan.reteach?.script || []) w.text(`• ${line}`, { indent: 10, gap: 2 });

  if (plan.materials?.length) {
    w.heading('Materials');
    for (const m of plan.materials) w.text(`• ${m}`, { indent: 10, gap: 2 });
  }
  if (plan.differentiationNotes?.length) {
    w.heading('Differentiation');
    for (const d of plan.differentiationNotes) w.text(`• ${d}`, { indent: 10, gap: 2 });
  }
  if (plan.assessmentNote) {
    w.heading('Assessment');
    w.text(plan.assessmentNote);
  }

  return { name: `${slug(draft.className)}-lesson-plan.pdf`, blob: w.blob() };
}

export async function lessonPlanDocx(draft: NextDayDraft): Promise<ExportFile> {
  const plan = draft.lessonPlan;
  const children: any[] = [
    docHeading(plan.title || draft.nextLessonTitle, HeadingLevel.HEADING_1),
    docText(`${draft.className} · ${draft.nextLessonDate} · ${plan.durationMinutes || 45} minutes`),
    docText(builtFromLine(draft), { italics: true }),
    docHeading('Aim and standards'),
    docText(`Aim: ${plan.aim}`),
    ...(plan.objective ? [docText(`Objective: ${plan.objective}`)] : []),
    ...(plan.standards?.length ? [docText(`Standards: ${plan.standards.join(', ')}`)] : []),
    docHeading('Period at a glance'),
    docTable(
      [['Minutes', 'Segment', 'What happens'], ...(plan.timeline || []).map((s) => [String(s.minutes), s.label, s.detail])],
      [1200, 2400, 5760]
    ),
    docHeading('Reteach — what today showed'),
    ...(plan.reteach?.summary ? [docText(plan.reteach.summary)] : []),
  ];

  for (const item of plan.reteach?.items || []) {
    children.push(
      docText(
        `Item ${item.itemNumber} — ${item.percentCorrect ?? 0}% correct${item.skillTag ? ` (${item.skillTag})` : ''}`,
        { bold: true }
      )
    );
    if (item.wrongAnswersQuoted?.length) {
      children.push(docText(`Students wrote: ${item.wrongAnswersQuoted.map((a) => `"${a}"`).join(', ')}`, { indent: 360 }));
    }
    if (item.whatWentWrong) children.push(docText(`What went wrong: ${item.whatWentWrong}`, { indent: 360 }));
    if (item.howToRepair) children.push(docText(`Repair: ${item.howToRepair}`, { indent: 360 }));
  }
  for (const line of plan.reteach?.script || []) children.push(docBullet(line));

  if (plan.materials?.length) {
    children.push(docHeading('Materials'), ...plan.materials.map(docBullet));
  }
  if (plan.differentiationNotes?.length) {
    children.push(docHeading('Differentiation'), ...plan.differentiationNotes.map(docBullet));
  }
  if (plan.assessmentNote) children.push(docHeading('Assessment'), docText(plan.assessmentNote));

  return { name: `${slug(draft.className)}-lesson-plan.docx`, blob: await buildDocx(children) };
}

// ----------------------------------------------------------------- presentation

const DECK_BG = '10213A';
const DECK_ACCENT = 'F2B237';

export async function presentationPptx(draft: NextDayDraft): Promise<ExportFile> {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'Nycologic Ai';
  pptx.title = draft.lessonPlan.title || draft.nextLessonTitle;

  // Classroom deck style (matches the teacher's Lesson slides): light page,
  // small teal kicker, teal title, pale content card, cream "sentence starters"
  // side card, orange timer, footer with lesson/unit left and standards right.
  const TEAL = '2F6F73';
  const ORANGE = 'C9782B';
  const CARD = 'E9EEF3';
  const CREAM = 'F7F0DC';
  const kickerFor: Record<string, string> = {
    title: 'TODAY',
    'do-now': '5 MINUTES · INDIVIDUALLY, THEN PARTNER',
    reteach: 'REPAIR · FROM YESTERDAY\'S PAPERS',
    teaching: 'NEW LEARNING · WE DO',
    'independent-work': 'INDEPENDENT PRACTICE · YOUR ITEMS ONLY',
    'exit-ticket': '4 MINUTES · ON YOUR OWN',
    debrief: 'DEBRIEF · WHOLE CLASS',
  };
  const timerFor: Record<string, string> = { 'do-now': '5:00', 'independent-work': '15:00', 'exit-ticket': '4:00' };
  const starters = ['"I notice that..."', '"I wonder whether..."', '"The number that would help me is... because..."', '"I disagree because..."'];
  const withStarters = new Set(['do-now', 'debrief', 'teaching']);
  const stds = standardsOf(draft);
  const footerLeft = `${draft.nextLessonTitle}${draft.lessonPlan?.title && draft.lessonPlan.title !== draft.nextLessonTitle ? ' · ' + draft.lessonPlan.title : ''} · ${courseOf(draft)}`;

  for (const slide of draft.slides || []) {
    const s = pptx.addSlide();
    s.background = { color: 'FFFFFF' };
    const kind = String(slide.kind);

    s.addText((kickerFor[kind] || kind.toUpperCase()).toUpperCase(), {
      x: 0.6, y: 0.3, w: 8.8, h: 0.3, fontSize: 10, bold: true, color: TEAL, fontFace: 'Calibri', charSpacing: 1,
    });
    s.addText(slide.title || '', {
      x: 0.6, y: 0.55, w: 8.8, h: kind === 'title' ? 1.2 : 0.7,
      fontSize: kind === 'title' ? 40 : 30, bold: true, color: TEAL, fontFace: 'Calibri', valign: 'top',
    });

    const side = withStarters.has(kind);
    const cardW = side ? 6.1 : 8.8;
    const cardY = kind === 'title' ? 1.9 : 1.45;
    s.addShape('rect' as any, { x: 0.6, y: cardY, w: cardW, h: 3.0, fill: { color: CARD }, line: { color: CARD } });
    const body = kind === 'title'
      ? [`${draft.className} · ${draft.nextLessonDate}`, ...(slide.bullets || [])]
      : slide.bullets || [];
    s.addText(
      body.map((b) => ({ text: b, options: { bullet: body.length > 1, breakLine: true } })),
      { x: 0.8, y: cardY + 0.15, w: cardW - 0.4, h: 2.7, fontSize: 18, color: '4A5560', fontFace: 'Calibri', valign: 'top', paraSpaceAfter: 6 }
    );

    if (side) {
      s.addShape('rect' as any, { x: 6.9, y: cardY, w: 2.5, h: 3.0, fill: { color: CREAM }, line: { color: CREAM } });
      s.addText('Sentence starters', { x: 7.05, y: cardY + 0.1, w: 2.2, h: 0.35, fontSize: 12, bold: true, color: ORANGE, fontFace: 'Calibri' });
      s.addText(
        starters.map((t) => ({ text: t, options: { bullet: true, breakLine: true } })),
        { x: 7.05, y: cardY + 0.5, w: 2.25, h: 2.4, fontSize: 11, color: '4A5560', fontFace: 'Calibri', valign: 'top' }
      );
    }

    if (timerFor[kind]) {
      s.addText(`⏱ ${timerFor[kind]}`, { x: 0.6, y: 4.6, w: 2, h: 0.35, fontSize: 14, bold: true, color: ORANGE, fontFace: 'Calibri' });
    }

    s.addText(footerLeft, { x: 0.6, y: 5.1, w: 6, h: 0.3, fontSize: 8, color: '8A949E', fontFace: 'Calibri' });
    if (stds) s.addText(`NYS ${stds}`, { x: 6.6, y: 5.1, w: 2.8, h: 0.3, fontSize: 8, color: '8A949E', fontFace: 'Calibri', align: 'right' });
    s.addNotes(slide.speakerNotes || '');
  }

  const data = (await pptx.write({ outputType: 'blob' })) as Blob;
  return { name: `${slug(draft.className)}-presentation.pptx`, blob: data };
}

export function presentationPdf(draft: NextDayDraft): ExportFile {
  const doc = new jsPDF({ unit: 'pt', orientation: 'landscape', format: [960, 540] });
  (draft.slides || []).forEach((slide, index) => {
    if (index > 0) doc.addPage([960, 540], 'landscape');
    const dark = slide.kind === 'title' || slide.kind === 'debrief';
    doc.setFillColor(dark ? '#10213A' : '#FFFFFF');
    doc.rect(0, 0, 960, 540, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(slide.kind === 'title' ? 40 : 28);
    doc.setTextColor(dark ? 255 : 16);
    const title = doc.splitTextToSize(safe(slide.title || ''), 860);
    title.forEach((line: string, i: number) => doc.text(line, 50, 80 + i * 34));

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(18);
    doc.setTextColor(dark ? 230 : 40);
    let y = 90 + title.length * 34;
    for (const bullet of slide.bullets || []) {
      const lines = doc.splitTextToSize(`• ${safe(bullet)}`, 840);
      for (const line of lines) {
        if (y > 440) break;
        doc.text(line, 60, y);
        y += 26;
      }
    }

    doc.setFontSize(9);
    doc.setTextColor(dark ? 150 : 130);
    const notes = doc.splitTextToSize(`Speaker notes: ${safe(slide.speakerNotes || '')}`, 860);
    doc.text(notes.slice(0, 3), 50, 490);
  });
  return { name: `${slug(draft.className)}-presentation.pdf`, blob: doc.output('blob') };
}

// -------------------------------------------------------------------- worksheet

const courseOf = (draft: NextDayDraft) =>
  /stat/i.test(draft.className) ? 'Statistics' : /alg/i.test(draft.className) ? 'Algebra II' : draft.className;
const standardsOf = (draft: NextDayDraft) => (draft.lessonPlan?.standards || []).join(', ');

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
  const w = new PdfWriter();
  worksheetHeader(w, draft);
  const doc = w.doc;
  const WORK = 120; // open work space under each item, like the printed sheets
  for (const item of draft.worksheet.items) {
    doc.setFontSize(12);
    const body = doc.splitTextToSize(safe(item.prompt), PAGE_W - MARGIN * 2 - 24);
    w.room(body.length * 15 + WORK);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20);
    doc.text(`${item.itemNumber}.`, MARGIN + 4, w.y);
    doc.setFont('helvetica', 'normal');
    body.forEach((l: string, i: number) => doc.text(l, MARGIN + 24, w.y + i * 15));
    w.y += body.length * 15 + WORK;
  }

  // Answer strip
  const n = draft.worksheet.items.length;
  const cols = 7;
  const rows = Math.ceil(n / cols);
  const cellW = (PAGE_W - MARGIN * 2) / cols;
  w.room(40 + rows * 34 + 30);
  doc.setFillColor(55, 55, 55);
  doc.rect(MARGIN, w.y, PAGE_W - MARGIN * 2, 20, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255);
  doc.text('Answer strip', MARGIN + 8, w.y + 14);
  w.y += 20;
  doc.setTextColor(20);
  doc.setDrawColor(40);
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const x = MARGIN + c * cellW, y = w.y + r * 34;
    doc.rect(x, y, cellW, 34);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(String(draft.worksheet.items[i].itemNumber), x + 4, y + 11);
  }
  w.y += rows * 34 + 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('My CHECK total: ____________', MARGIN, w.y);
  w.y += 16;
  worksheetFooter(w, draft);
  return { name: `${slug(draft.className)}-worksheet.pdf`, blob: w.blob() };
}


export async function worksheetDocx(draft: NextDayDraft): Promise<ExportFile> {
  const stds = standardsOf(draft);
  const children: any[] = [
    docHeading(draft.worksheet.title || draft.nextLessonTitle, HeadingLevel.HEADING_1),
    docText(`${courseOf(draft)} · Practice sheet${stds ? ` · NYS ${stds}` : ''}`, { italics: true }),
    docText('Name: ______________________________   ID: ________   Date: ____________   Period: ______'),
    docText('Directions', { bold: true }),
    docText(
      `${draft.worksheet.instructions ? draft.worksheet.instructions + ' ' : ''}Everyone has the same sheet. Work only the ${draft.grouping.itemsPerStudent} items listed on your card (the item lists are also on the board). Write your final answers on the answer strip at the end and show your work under each item. When you finish, add your ${draft.grouping.itemsPerStudent} answers and compare with the CHECK total your teacher gives your set.`
    ),
  ];
  for (const item of draft.worksheet.items) {
    children.push(docText(`${item.itemNumber}.  ${item.prompt}`, { bold: false }));
    children.push(docText(' '));
    children.push(docText(' '));
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
  const w = new PdfWriter();
  w.text('Answer key — teacher only', { size: 18, bold: true });
  w.text(`${draft.worksheet.title} · ${draft.className} · ${draft.nextLessonDate}`, { size: 10, color: 90, gap: 6 });
  w.text(builtFromLine(draft), { size: 9, color: 110 });
  w.rule();
  for (const item of draft.worksheet.items) {
    w.text(`${item.itemNumber}.  ${item.prompt}`, { size: 11, bold: true, gap: 2 });
    w.text(`Answer: ${item.answer || item.answerNumeric}`, { indent: 12, gap: 2 });
    if (item.workedSolution) w.text(`Working: ${item.workedSolution}`, { indent: 12, gap: 2 });
    w.text(`Checked: ${item.verifyNote || item.verify}`, { indent: 12, size: 9, color: 100, gap: 2 });
    w.text(`If wrong, record error tag: ${item.errorTagIfWrong || '(none given)'}`, { indent: 12, size: 10, gap: 2 });
    if (item.skillTag) w.text(`Skill: ${item.skillTag}`, { indent: 12, size: 9, color: 100 });
  }
  w.rule();
  w.heading('Check totals');
  for (const group of draft.grouping.groups) {
    w.text(`${group.label} — items ${group.itemNumbers.join(', ')} — check total ${group.checkTotal}`, { indent: 10, gap: 2 });
  }
  return { name: `${slug(draft.className)}-answer-key.pdf`, blob: w.blob() };
}

export async function answerKeyDocx(draft: NextDayDraft): Promise<ExportFile> {
  const children: any[] = [
    docHeading('Answer key — teacher only', HeadingLevel.HEADING_1),
    docText(`${draft.worksheet.title} · ${draft.className} · ${draft.nextLessonDate}`),
    docText(builtFromLine(draft), { italics: true }),
    docTable(keyRows(draft.worksheet.items), [700, 2400, 2400, 2200, 2160]),
    docHeading('Check totals'),
    ...draft.grouping.groups.map((g) =>
      docBullet(`${g.label} — items ${g.itemNumbers.join(', ')} — check total ${g.checkTotal}`)
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
  const w = new PdfWriter();
  exitTicketHalf(w, draft, 0);
  exitTicketHalf(w, draft, 1);
  return { name: `${slug(draft.className)}-exit-ticket.pdf`, blob: w.blob() };
}

export async function exitTicketDocx(draft: NextDayDraft): Promise<ExportFile> {
  const n = draft.exitTicket.items.length;
  const half = (): any[] => [
    docText((draft.exitTicket.title || 'Exit ticket').toUpperCase(), { bold: true }),
    docText('Name ______________________    Period — write the digit ______    Date __________'),
    docText(
      `Exit ticket — Put your class period in that box, not your grade. ${n} questions, ${Math.max(3, n + 1)} minutes. Answer what you can — a blank tells me something too.`,
      { italics: true }
    ),
    ...draft.exitTicket.items.flatMap((item) => [
      docText(`${item.itemNumber}.  ${item.prompt}`, { bold: true }),
      docText(' '),
      docText(' '),
      docText(' '),
    ]),
  ];
  const children = [
    ...half(),
    new Paragraph({ children: [new TextRun('— — — — — — — — — cut here — — — — — — — — —')] }),
    new Paragraph({ children: [new PageBreak()] }),
    ...half(),
  ];
  return { name: `${slug(draft.className)}-exit-ticket.docx`, blob: await buildDocx(children) };
}

export function exitTicketKeyPdf(draft: NextDayDraft): ExportFile {
  const w = new PdfWriter();
  w.text('Exit ticket key — teacher only', { size: 16, bold: true });
  w.text(`${draft.className} · ${draft.nextLessonDate}`, { size: 10, color: 90, gap: 6 });
  for (const item of draft.exitTicket.items) {
    w.text(`${item.itemNumber}. ${item.prompt}`, { bold: true, gap: 2 });
    w.text(`Answer: ${item.answer || item.answerNumeric}`, { indent: 12, gap: 2 });
    w.text(`Checked: ${item.verifyNote || item.verify}`, { indent: 12, size: 9, color: 100, gap: 2 });
    w.text(`Skill isolated: ${item.skillTag || '—'} · if wrong record: ${item.errorTagIfWrong || '—'}`, {
      indent: 12,
      size: 10,
    });
  }
  return { name: `${slug(draft.className)}-exit-ticket-key.pdf`, blob: w.blob() };
}

// -------------------------------------------------------------- who does which

export async function whoDoesWhichPptx(draft: NextDayDraft): Promise<ExportFile> {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = `${draft.className} — who does which problems`;

  const cover = pptx.addSlide();
  cover.background = { color: DECK_BG };
  cover.addText('Today you work these problems', {
    x: 0.6, y: 1.9, w: 8.8, h: 1.2, fontSize: 40, bold: true, color: 'FFFFFF', fontFace: 'Arial',
  });
  cover.addText(`${draft.className} · ${draft.nextLessonDate}`, {
    x: 0.6, y: 3.2, w: 8.8, h: 0.5, fontSize: 20, color: DECK_ACCENT, fontFace: 'Arial',
  });
  cover.addNotes('Put this on the board as students come in. Read the group names, then the item numbers.');

  for (const group of draft.grouping.groups) {
    const s = pptx.addSlide();
    s.background = { color: 'FFFFFF' };
    s.addText(group.label, {
      x: 0.6, y: 0.4, w: 5.6, h: 0.8, fontSize: 34, bold: true, color: '10213A', fontFace: 'Arial',
    });
    s.addShape('roundRect' as pptxgen.ShapeType, {
      x: 6.3, y: 0.4, w: 3.1, h: 1.5, fill: { color: 'EDF2F7' }, line: { color: 'CBD5E0', width: 1 },
    });
    s.addText(`Problems\n${group.itemNumbers.join(', ')}`, {
      x: 6.4, y: 0.5, w: 2.9, h: 0.9, fontSize: 18, bold: true, color: '10213A', fontFace: 'Arial', align: 'center',
    });
    s.addText(`Check total: ${group.checkTotal}`, {
      x: 6.4, y: 1.45, w: 2.9, h: 0.35, fontSize: 14, color: '444444', fontFace: 'Arial', align: 'center',
    });
    s.addText(
      group.students.map((st) => ({ text: st.name, options: { breakLine: true } })),
      { x: 0.7, y: 1.5, w: 5.4, h: 3.4, fontSize: 20, color: '222222', fontFace: 'Arial', valign: 'top' }
    );
    s.addNotes(
      `${group.label}: ${group.students.length} student(s), problems ${group.itemNumbers.join(', ')}, check total ${group.checkTotal}. Reasons stay off the board — see the teacher list.`
    );
  }

  const last = pptx.addSlide();
  last.background = { color: 'FFFFFF' };
  last.addText('See me for your problems', {
    x: 0.6, y: 0.4, w: 8.8, h: 0.8, fontSize: 32, bold: true, color: '10213A', fontFace: 'Arial',
  });
  last.addText(
    draft.grouping.noResultsYet.length
      ? draft.grouping.noResultsYet.map((s) => ({ text: s.name, options: { breakLine: true } }))
      : [{ text: 'Everyone has results — no one is waiting.', options: {} }],
    { x: 0.7, y: 1.5, w: 8.6, h: 3.2, fontSize: 20, color: '222222', fontFace: 'Arial', valign: 'top' }
  );
  last.addNotes('These students have no scanned results yet, or their paper is still unclaimed. Give them a set by hand and make sure their paper gets named.');

  const data = (await pptx.write({ outputType: 'blob' })) as Blob;
  return { name: `${slug(draft.className)}-who-does-which.pptx`, blob: data };
}

export function whoDoesWhichPdf(draft: NextDayDraft): ExportFile {
  const doc = new jsPDF({ unit: 'pt', orientation: 'landscape', format: [960, 540] });
  const page = (title: string, names: string[], right?: string[]) => {
    doc.setFillColor('#FFFFFF');
    doc.rect(0, 0, 960, 540, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(34);
    doc.setTextColor(16, 33, 58);
    doc.text(safe(title), 50, 80);
    if (right?.length) {
      doc.setFontSize(18);
      doc.setTextColor(30);
      right.forEach((line, i) => doc.text(safe(line), 640, 80 + i * 26));
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(20);
    doc.setTextColor(30);
    names.slice(0, 14).forEach((name, i) => doc.text(safe(name), 60, 140 + i * 28));
  };

  page('Today you work these problems', [`${draft.className} · ${draft.nextLessonDate}`]);
  for (const group of draft.grouping.groups) {
    doc.addPage([960, 540], 'landscape');
    page(group.label, group.students.map((s) => s.name), [
      `Problems ${group.itemNumbers.join(', ')}`,
      `Check total: ${group.checkTotal}`,
    ]);
  }
  doc.addPage([960, 540], 'landscape');
  page(
    'See me for your problems',
    draft.grouping.noResultsYet.length
      ? draft.grouping.noResultsYet.map((s) => s.name)
      : ['Everyone has results — no one is waiting.']
  );
  return { name: `${slug(draft.className)}-who-does-which.pdf`, blob: doc.output('blob') };
}

// ------------------------------------------------------------- teacher-only list

function teacherRows(draft: NextDayDraft): string[][] {
  const rows: string[][] = [['Student', 'Set', 'Items', 'Check total', 'Evidence from their paper']];
  for (const group of draft.grouping.groups) {
    for (const student of group.students) {
      rows.push([
        student.name,
        group.label,
        group.itemNumbers.join(', '),
        String(group.checkTotal),
        student.evidence,
      ]);
    }
  }
  for (const student of draft.grouping.noResultsYet) {
    rows.push([student.name, 'not set', '—', '—', 'No results received yet']);
  }
  return rows;
}

export function teacherListPdf(draft: NextDayDraft): ExportFile {
  const w = new PdfWriter();
  w.text('Who does which — teacher list', { size: 18, bold: true });
  w.text(`${draft.className} · ${draft.nextLessonDate}`, { size: 10, color: 90, gap: 4 });
  w.text(builtFromLine(draft), { size: 9, color: 110 });
  w.rule();
  for (const group of draft.grouping.groups) {
    w.heading(`${group.label} — items ${group.itemNumbers.join(', ')} — check total ${group.checkTotal}`);
    for (const student of group.students) {
      w.text(`${student.name}${student.score !== null ? ` (${Math.round(student.score)}%)` : ''} — ${student.evidence}`, {
        indent: 10,
        gap: 2,
        size: 10,
      });
    }
  }
  if (draft.grouping.noResultsYet.length) {
    w.heading('No results received yet');
    for (const student of draft.grouping.noResultsYet) {
      w.text(`${student.name} — set by hand; paper still to be claimed`, { indent: 10, gap: 2, size: 10 });
    }
  }
  return { name: `${slug(draft.className)}-teacher-list.pdf`, blob: w.blob() };
}

export async function teacherListDocx(draft: NextDayDraft): Promise<ExportFile> {
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
  const w = new PdfWriter();

  worksheetHeader(w, draft);
  for (const item of draft.worksheet.items) {
    const promptLines = w.doc.splitTextToSize(`${item.itemNumber}.  ${item.prompt}`, PAGE_W - MARGIN * 2).length;
    w.room(promptLines * 15 + 54 + 20);
    w.text(`${item.itemNumber}.  ${item.prompt}`, { size: 12, gap: 2 });
    w.box(54, 'show your work');
  }

  w.doc.addPage([PAGE_W, PAGE_H]);
  w.y = MARGIN;
  exitTicketHalf(w, draft, 0);
  exitTicketHalf(w, draft, 1);

  w.doc.addPage([PAGE_W, PAGE_H]);
  w.y = MARGIN;
  w.text('Answer key — teacher only', { size: 16, bold: true });
  w.text(`${draft.worksheet.title} · ${draft.className} · ${draft.nextLessonDate}`, { size: 10, color: 90 });
  w.text(builtFromLine(draft), { size: 9, color: 110 });
  w.rule();
  for (const item of draft.worksheet.items) {
    w.text(`${item.itemNumber}.  ${item.prompt}`, { size: 11, bold: true, gap: 2 });
    w.text(`Answer: ${item.answer || item.answerNumeric}`, { indent: 12, gap: 2 });
    w.text(`If wrong, record error tag: ${item.errorTagIfWrong || '(none given)'}`, { indent: 12, size: 10 });
  }
  w.rule();
  w.heading('Check totals');
  for (const group of draft.grouping.groups) {
    w.text(`${group.label} — items ${group.itemNumbers.join(', ')} — check total ${group.checkTotal}`, { indent: 10, gap: 2 });
  }
  w.heading('Exit ticket answers');
  for (const item of draft.exitTicket.items) {
    w.text(`${item.itemNumber}. ${item.prompt}`, { size: 10, bold: true, gap: 2 });
    w.text(`Answer: ${item.answer || item.answerNumeric}`, { indent: 12, size: 10 });
  }

  return { name: `${slug(draft.className)}-print-pack.pdf`, blob: w.blob() };
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
  const w = new PdfWriter();
  w.text(input.title, { size: 18, bold: true });
  w.text(
    `${input.className} · ${input.dateLabel}${input.dayNumber ? ` · Day ${input.dayNumber}` : ''}${
      input.unitLabel ? ` · ${input.unitLabel}` : ''
    }`,
    { size: 10, color: 90 }
  );
  if (input.standards.length > 0) w.text(`Standards: ${input.standards.join(', ')}`, { size: 10, color: 90 });
  w.text('No scored results have been received for this class, so this plan contains no class data — only the calendar lesson.', {
    size: 10,
    color: 110,
  });
  w.rule();
  const timeline: [number, string][] = [
    [5, 'Do now'],
    [10, 'Launch — the new idea'],
    [15, 'Worked examples together'],
    [10, 'Independent practice'],
    [5, 'Exit ticket'],
  ];
  w.heading('Period at a glance (45 minutes)');
  for (const [minutes, label] of timeline) {
    w.text(`${minutes} min — ${label}`, { indent: 10, gap: 2 });
    w.box(28);
  }
  w.heading('Notes');
  w.box(120);
  return { name: `${slug(input.className)}-calendar-lesson.pdf`, blob: w.blob() };
}

/** Open a generated file in one new tab, ready for the printer. */
export function openInNewTab(file: ExportFile) {
  const url = URL.createObjectURL(file.blob);
  const tab = window.open(url, '_blank');
  if (!tab) URL.revokeObjectURL(url);
  else setTimeout(() => URL.revokeObjectURL(url), 60000);
  return !!tab;
}
