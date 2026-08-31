import jsPDF from 'jspdf';
import {
  BANDS,
  drawBandGlyph,
  formatCheckValue,
  ITEMS_PER_SHEET,
  VARIANTS,
  type BankedQuestion,
  type VariantSheet,
} from './bandedWorksheet';
import {
  crossVariantCoverage,
  itemStandards,
  sheetStandardCodes,
  variantCoverage,
} from './bandedStandardsCoverage';

export interface StudentSheet {
  /** Pre-printed on the sheet header. */
  studentName: string;
  /** Variant letter A-D. */
  variant: string;
  items: BankedQuestion[];
  /** Sum of the variant's ten numeric answers, or null for a dash. */
  check: number | null;
}

export interface SheetRenderOptions {
  title: string;
  marginSize?: 'small' | 'medium' | 'large';
  formatText?: (text: string) => string;
  /**
   * Prints a single flat, sheet-wide line of NYS standard codes above the answer
   * strip. Default OFF. Codes only — never per item, so their order cannot be read
   * back against the item order to infer which items are harder.
   */
  showStandardsFooter?: boolean;
}

const marginFor = (size: SheetRenderOptions['marginSize']) =>
  size === 'small' ? 15 : size === 'large' ? 25 : 19;


/**
 * Renders one student sheet onto the current page of `pdf`.
 * The student copy carries NO band marks, names, level letters, descriptions or colours —
 * plain numbered questions, a pre-printed name, the date rule and the variant letter.
 */
function renderStudentSheet(pdf: jsPDF, sheet: StudentSheet, opts: SheetRenderOptions): void {
  const fmt = opts.formatText || ((t: string) => t);
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = marginFor(opts.marginSize);
  const contentWidth = pageWidth - margin * 2;
  const textWidth = contentWidth - 10;

  let y = margin;

  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0);
  const title = opts.title.length > 60 ? `${opts.title.substring(0, 57)}...` : opts.title;
  pdf.text(fmt(title), pageWidth / 2, y, { align: 'center' });
  y += 10;

  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.text(fmt(`Name: ${sheet.studentName}`), margin, y);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Date: ______________', margin + contentWidth * 0.52, y);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`Variant ${sheet.variant}`, pageWidth - margin, y + 8, { align: 'right' });
  pdf.setFont('helvetica', 'normal');
  y += 14;

  pdf.setDrawColor(0);
  pdf.setLineWidth(0.5);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 10;

  const footerCodes = opts.showStandardsFooter ? sheetStandardCodes(sheet.items) : [];
  pdf.setFontSize(8);
  const footerLines =
    footerCodes.length > 0
      ? (pdf.splitTextToSize(`Standards: ${footerCodes.join(', ')}`, contentWidth) as string[])
      : [];
  const footerHeight = footerLines.length > 0 ? footerLines.length * 4 + 3 : 0;
  const stripTop = pageHeight - margin - 30;
  const footerTop = stripTop - footerHeight;




  // Ten items with usable working space do not fit on one side of letter paper, so a
  // sheet is a deterministic two-page (duplex) handout: items 1-5, then 6-10 plus the
  // detachable strip. Work boxes auto-fit whatever room the prompts leave on each page.
  const allPromptLines = sheet.items.map(
    (q) => pdf.splitTextToSize(fmt(q?.prompt_text || ''), textWidth) as string[],
  );
  const perPage = Math.ceil(sheet.items.length / 2) || 1;
  const pages = [sheet.items.slice(0, perPage), sheet.items.slice(perPage)].filter((p) => p.length > 0);

  pages.forEach((pageItems, pageIdx) => {
    const isLast = pageIdx === pages.length - 1;
    const bottom = isLast ? footerTop - 4 : pageHeight - margin;


    if (pageIdx > 0) {
      pdf.addPage();
      y = margin;
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0);
      pdf.text(fmt(sheet.studentName), margin, y);
      pdf.text(`Variant ${sheet.variant}`, pageWidth - margin, y, { align: 'right' });
      pdf.setFont('helvetica', 'normal');
      y += 8;
    }

    const offset = pageIdx * perPage;
    const promptHeight = pageItems.reduce(
      (t, _q, i) => t + allPromptLines[offset + i].length * 5 + 4,
      0,
    );
    const gaps = pageItems.length * 7;
    const room = bottom - y - promptHeight - gaps;
    const workSpace = Math.max(12, Math.min(30, room / Math.max(1, pageItems.length)));

    pageItems.forEach((q, i) => {
      const idx = offset + i;
      const promptLines = allPromptLines[idx];

      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(0);
      pdf.text(`${idx + 1}.`, margin, y);
      pdf.text(promptLines, margin + 8, y);
      y += promptLines.length * 5 + 4;

      pdf.setDrawColor(200);
      pdf.setLineWidth(0.3);
      pdf.rect(margin + 8, y, textWidth - 8, workSpace);
      y += workSpace + 7;
    });
  });

  // ---- Optional standards footer: one flat sheet-wide list of codes, never per item ----
  if (footerCodes.length > 0) {
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(90);
    const line = pdf.splitTextToSize(
      `Standards: ${footerCodes.join(', ')}`,
      contentWidth,
    ) as string[];
    pdf.text(line[0], margin, footerTop + 4);
    pdf.setTextColor(0);
  }


  // ---- Detachable answer strip: plain numbers, one CHECK total ----
  pdf.setDrawColor(120);
  pdf.setLineWidth(0.3);
  pdf.setLineDashPattern([2, 1.6], 0);
  pdf.line(margin, stripTop, pageWidth - margin, stripTop);
  pdf.setLineDashPattern([], 0);

  let sy = stripTop + 8;
  pdf.setTextColor(0);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text('ANSWER STRIP', margin, sy);
  pdf.setFont('helvetica', 'normal');
  pdf.text(fmt(sheet.studentName), margin + 38, sy);
  pdf.text(`Variant ${sheet.variant}`, pageWidth - margin, sy, { align: 'right' });
  sy += 7;

  const perRow = 5;
  const colWidth = contentWidth / perRow;
  sheet.items.forEach((_q, idx) => {
    const row = Math.floor(idx / perRow);
    const col = idx % perRow;
    const x = margin + col * colWidth;
    const ry = sy + row * 7;
    pdf.text(`${idx + 1}`, x, ry);
    const numW = pdf.getTextWidth(`${idx + 1}`);
    pdf.text('______', x + numW + 3, ry);
  });
  sy += Math.ceil(sheet.items.length / perRow) * 7 + 3;

  pdf.setFontSize(10);
  pdf.text(
    `CHECK: your completed answers should total  ${formatCheckValue(sheet.check)}`,
    margin,
    sy,
  );
}

/** Builds a single student sheet as its own PDF. */
export function buildStudentSheetPdf(sheet: StudentSheet, opts: SheetRenderOptions): jsPDF {
  const pdf = new jsPDF('p', 'mm', 'letter');
  renderStudentSheet(pdf, sheet, opts);
  return pdf;
}

/**
 * The class set: ONE PDF, one sheet per student, each with that student's name
 * pre-printed and their assigned variant's items. Pages are ordered by surname.
 */
export function buildClassSetPdf(
  sheets: (StudentSheet & { sortKey: string })[],
  opts: SheetRenderOptions,
): jsPDF {
  const ordered = [...sheets].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const pdf = new jsPDF('p', 'mm', 'letter');
  ordered.forEach((sheet, i) => {
    if (i > 0) pdf.addPage();
    renderStudentSheet(pdf, sheet, opts);
  });
  return pdf;
}

const bandName = (b: string) => b.charAt(0).toUpperCase() + b.slice(1);

/**
 * The teacher-facing answer keys: one key per variant. Each item shows its number,
 * the band shape AND the band name in words, the answer, and an ANCHOR mark on the
 * four items common to every variant. Whole-sheet band totals and the variant's
 * CHECK total sit at the top of each key.
 */
export function buildAnswerKeysPdf(variants: VariantSheet[], opts: SheetRenderOptions): jsPDF {
  const fmt = opts.formatText || ((t: string) => t);
  const pdf = new jsPDF('p', 'mm', 'letter');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = marginFor(opts.marginSize);
  const contentWidth = pageWidth - margin * 2;

  variants.forEach((v, vi) => {
    if (vi > 0) pdf.addPage();
    let y = margin;

    pdf.setFontSize(15);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0);
    pdf.text(fmt(`Answer Key — Variant ${v.variant}`), margin, y);
    y += 7;

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(fmt(opts.title), margin, y);
    y += 6;

    const totals = BANDS.map((b) => `${bandName(b)} ${v.totals[b]}`).join('   ·   ');
    pdf.text(`Band totals: ${totals}`, margin, y);
    y += 5.5;
    pdf.text(`CHECK total (sum of the ten answers): ${formatCheckValue(v.check)}`, margin, y);
    y += 5.5;
    pdf.text(
      `Anchor items (common to all four variants): ${v.anchorPositions.join(', ')}`,
      margin,
      y,
    );
    y += 8;

    pdf.setDrawColor(0);
    pdf.setLineWidth(0.4);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 7;

    v.items.forEach((q, idx) => {
      const number = idx + 1;
      const isAnchor = v.anchorPositions.includes(number);
      const promptLines = pdf.splitTextToSize(fmt(q?.prompt_text || ''), contentWidth - 46) as string[];
      const answerLines = pdf.splitTextToSize(fmt(q?.answer_text || ''), contentWidth - 46) as string[];
      const blockHeight = (promptLines.length + answerLines.length) * 4.6 + 8;

      if (y + blockHeight > pageHeight - margin) {
        pdf.addPage();
        y = margin;
      }

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${number}.`, margin, y);

      // Band shape (teacher copy) followed by the band name in words.
      drawBandGlyph(pdf as never, q.band, margin + 12, y - 1.2, 2, [90, 96, 106]);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text(bandName(q.band), margin + 14, y);
      if (isAnchor) {
        pdf.setFont('helvetica', 'bold');
        pdf.text('[ANCHOR]', margin + 36, y);
        pdf.setFont('helvetica', 'normal');
      }
      y += 5;

      pdf.setFontSize(10);
      pdf.setTextColor(60);
      promptLines.slice(0, 6).forEach((line) => {
        pdf.text(line, margin + 8, y);
        y += 4.6;
      });

      pdf.setTextColor(0, 110, 0);
      pdf.setFont('helvetica', 'bold');
      answerLines.slice(0, 4).forEach((line, i) => {
        pdf.text(i === 0 ? `Answer: ${line}` : line, margin + 8, y);
        y += 4.6;
      });
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(0);
      y += 3.5;
    });

    pdf.setFontSize(8);
    pdf.setTextColor(150);
    pdf.text(
      `Teacher copy · Variant ${v.variant} · ${ITEMS_PER_SHEET} items`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' },
    );
    pdf.setTextColor(0);
  });

  return pdf;
}
