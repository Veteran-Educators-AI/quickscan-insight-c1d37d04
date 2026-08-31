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

  return pdf;
}
