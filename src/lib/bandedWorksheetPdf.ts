import jsPDF from 'jspdf';
import {
  drawBandGlyph,
  formatCheckValue,
  type BankedQuestion,
  type SetCheckValue,
} from './bandedWorksheet';

export interface BandedSheetOptions {
  items: BankedQuestion[];
  /** Sheet title. Must never claim a topic scope the items do not have. */
  title: string;
  marginSize?: 'small' | 'medium' | 'large';
  /** Text sanitizer for the PDF's WinAnsi fonts. */
  formatText?: (text: string) => string;
  /** All four CHECK totals. Only the assigned set's value is ever printed. */
  setChecks?: SetCheckValue[];
  /**
   * The set assigned to this copy. Null/undefined (set assignment does not exist yet)
   * leaves the Set field and the CHECK line blank.
   */
  assignedSet?: number | null;
}

/**
 * Builds the student-facing banded single sheet.
 * Band identity is conveyed ONLY by a light-grey vector mark in the right margin —
 * no band name, level letter, level description or level colour appears anywhere.
 */
export function buildBandedSheetPdf({
  items,
  title,
  marginSize = 'medium',
  formatText,
  setChecks,
  assignedSet,
}: BandedSheetOptions): jsPDF {

  const fmt = formatText || ((t: string) => t);
  const pdf = new jsPDF('p', 'mm', 'letter');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = marginSize === 'small' ? 15 : marginSize === 'large' ? 25 : 19;
  const contentWidth = pageWidth - margin * 2;
  const glyphX = pageWidth - margin - 1;
  const textWidth = contentWidth - 14;

  let y = margin;

  // Sheet header: title, then Name / Date / Set. No band or level info.
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0);
  pdf.text(fmt(title.length > 60 ? `${title.substring(0, 57)}...` : title), pageWidth / 2, y, { align: 'center' });
  y += 10;

  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Name: ______________________________', margin, y);
  pdf.text('Date: ______________', margin + contentWidth * 0.52, y);
  pdf.text(assignedSet ? `Set: ${assignedSet}` : 'Set: ______', pageWidth - margin - 24, y + 8);
  y += 14;


  pdf.setLineWidth(0.5);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 10;

  const workSpace = 26;

  items.forEach((q, idx) => {
    const promptLines = pdf.splitTextToSize(fmt(q.prompt_text || ''), textWidth) as string[];
    const blockHeight = promptLines.length * 5 + workSpace + 6;

    if (y + blockHeight > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }

    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(0);
    pdf.text(`${idx + 1}.`, margin, y);
    pdf.text(promptLines, margin + 8, y);

    // Right-margin band mark: filled vector shape in light grey, vertically
    // centred on the item's first line. Never text — the standard-14 PDF fonts
    // use WinAnsiEncoding and cannot encode the geometric-shapes code points.
    drawBandGlyph(pdf as never, q.band, glyphX, y - 1.2);

    y += promptLines.length * 5 + 4;

    // Answer work area
    pdf.setDrawColor(200);
    pdf.setLineWidth(0.3);
    pdf.rect(margin + 8, y, textWidth, workSpace);
    y += workSpace + 8;
  });

  // ---- Detachable answer strip, foot of the sheet ----
  const stripHeight = 34;
  const stripTop = pageHeight - margin - stripHeight;
  if (y > stripTop - 4) {
    pdf.addPage();
  }

  // Dashed cut line separating the strip from the body.
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
  pdf.text('ID ______', margin + 38, sy);
  pdf.text('SET  1   2   3   4', margin + 70, sy);
  sy += 7;

  // Two rows of five: number, the item's band mark, then the answer rule.
  // The mark is the same vector shape as the item, scaled down for the strip.
  const stripGlyphSize = 1.5;
  const perRow = 5;
  const colWidth = contentWidth / perRow;
  pdf.setFontSize(10);
  items.forEach((q, idx) => {
    const row = Math.floor(idx / perRow);
    const col = idx % perRow;
    const x = margin + col * colWidth;
    const ry = sy + row * 7;
    pdf.setTextColor(0);
    pdf.text(`${idx + 1}`, x, ry);
    const numW = pdf.getTextWidth(`${idx + 1}`);
    drawBandGlyph(pdf as never, q.band, x + numW + 3.4, ry - 1.1, stripGlyphSize);
    pdf.setTextColor(0);
    pdf.text('____', x + numW + 4.4, ry);
  });
  sy += Math.ceil(items.length / perRow) * 7 + 3;

  // CHECK: only the assigned set's total prints. Never all four — a student must
  // not be able to compare them and infer which item range each set covers.
  const assignedCheck = assignedSet
    ? setChecks?.find((c) => c.set === assignedSet)
    : undefined;
  const checkValue = assignedCheck ? formatCheckValue(assignedCheck.total) : '';
  pdf.setTextColor(0);
  pdf.setFontSize(10);
  pdf.text(`CHECK: your completed answers should total  ${checkValue || '______'}`, margin, sy);

  return pdf;

}
