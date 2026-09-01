import jsPDF from 'jspdf';
import { BANDS, drawBandGlyph, formatCheckValue, type BankedQuestion } from './bandedWorksheet';
import type { GroupPlan } from './bandedCommonSheet';
import { groupCoverage, itemStandards, sheetStandardCodes } from './bandedStandardsCoverage';

export interface CommonSheetOptions {
  title: string;
  marginSize?: 'small' | 'medium' | 'large';
  formatText?: (text: string) => string;
  /** Flat sheet-wide list of standard codes above the answer strip. Default OFF. */
  showStandardsFooter?: boolean;
}

const marginFor = (size: CommonSheetOptions['marginSize']) =>
  size === 'small' ? 15 : size === 'large' ? 25 : 19;

const bandName = (b: string) => b.charAt(0).toUpperCase() + b.slice(1);

/**
 * One page of the common sheet. Identical for every student except the pre-printed name:
 * same ten questions, same order, no group number, no item list, no CHECK value, no band
 * mark, name or colour.
 */
function renderCommonSheet(
  pdf: jsPDF,
  studentName: string,
  items: BankedQuestion[],
  opts: CommonSheetOptions,
): void {
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
  pdf.text(fmt(`Name: ${studentName}`), margin, y);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Date: ______________', margin + contentWidth * 0.52, y);
  y += 12;

  pdf.setDrawColor(0);
  pdf.setLineWidth(0.5);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 10;

  const footerCodes = opts.showStandardsFooter ? sheetStandardCodes(items) : [];
  pdf.setFontSize(8);
  const footerLines =
    footerCodes.length > 0
      ? (pdf.splitTextToSize(`Standards: ${footerCodes.join(', ')}`, contentWidth) as string[])
      : [];
  const footerHeight = footerLines.length > 0 ? footerLines.length * 4 + 3 : 0;
  const stripTop = pageHeight - margin - 26;
  const footerTop = stripTop - footerHeight;

  const allPromptLines = items.map(
    (q) => pdf.splitTextToSize(fmt(q?.prompt_text || ''), textWidth) as string[],
  );
  const perPage = Math.ceil(items.length / 2) || 1;
  const pages = [items.slice(0, perPage), items.slice(perPage)].filter((p) => p.length > 0);

  pages.forEach((pageItems, pageIdx) => {
    const isLast = pageIdx === pages.length - 1;
    const bottom = isLast ? footerTop - 4 : pageHeight - margin;

    if (pageIdx > 0) {
      pdf.addPage();
      y = margin;
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0);
      pdf.text(fmt(studentName), margin, y);
      pdf.setFont('helvetica', 'normal');
      y += 8;
    }

    const offset = pageIdx * perPage;
    const promptHeight = pageItems.reduce((t, _q, i) => t + allPromptLines[offset + i].length * 5 + 4, 0);
    const gaps = pageItems.length * 7;
    const room = bottom - y - promptHeight - gaps;
    const workSpace = Math.max(12, Math.min(30, room / Math.max(1, pageItems.length)));

    pageItems.forEach((q, i) => {
      const idx = offset + i;
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(0);
      pdf.text(`${idx + 1}.`, margin, y);
      pdf.text(allPromptLines[idx], margin + 8, y);
      y += allPromptLines[idx].length * 5 + 4;

      pdf.setDrawColor(200);
      pdf.setLineWidth(0.3);
      pdf.rect(margin + 8, y, textWidth - 8, workSpace);
      y += workSpace + 7;
    });
  });

  if (footerLines.length > 0) {
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(90);
    footerLines.forEach((line, i) => pdf.text(line, margin, footerTop + 4 + i * 4));
    pdf.setTextColor(0);
  }

  // ---- Detachable answer strip: plain numbers only. No CHECK in this mode: a
  // group-specific total printed here would leak group membership between pages.
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
  pdf.text(fmt(studentName), margin + 38, sy);
  sy += 7;

  const perRow = 5;
  const colWidth = contentWidth / perRow;
  items.forEach((_q, idx) => {
    const row = Math.floor(idx / perRow);
    const col = idx % perRow;
    const x = margin + col * colWidth;
    const ry = sy + row * 7;
    pdf.text(`${idx + 1}`, x, ry);
    const numW = pdf.getTextWidth(`${idx + 1}`);
    pdf.text('______', x + numW + 3, ry);
  });
}

/** Single student copy of the common sheet. */
export function buildCommonSheetPdf(
  studentName: string,
  items: BankedQuestion[],
  opts: CommonSheetOptions,
): jsPDF {
  const pdf = new jsPDF('p', 'mm', 'letter');
  renderCommonSheet(pdf, studentName, items, opts);
  return pdf;
}

/**
 * The class set: ONE PDF, a page per student, ordered by surname, name pre-printed.
 * Content is identical on every page apart from the name.
 */
export function buildCommonClassSetPdf(
  students: { studentName: string; sortKey: string }[],
  items: BankedQuestion[],
  opts: CommonSheetOptions,
): jsPDF {
  const ordered = [...students].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const pdf = new jsPDF('p', 'mm', 'letter');
  ordered.forEach((s, i) => {
    if (i > 0) pdf.addPage();
    renderCommonSheet(pdf, s.studentName, items, opts);
  });
  return pdf;
}

/**
 * The teacher-facing key: the ten items with band shape, band name, NYS standard and
 * answer, a block listing the four groups (item numbers, band mix, CHECK total), and a
 * standards coverage page by group.
 */
export function buildCommonAnswerKeyPdf(
  items: BankedQuestion[],
  groups: GroupPlan[],
  opts: CommonSheetOptions,
): jsPDF {
  const fmt = opts.formatText || ((t: string) => t);
  const pdf = new jsPDF('p', 'mm', 'letter');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = marginFor(opts.marginSize);
  const contentWidth = pageWidth - margin * 2;

  let y = margin;
  pdf.setFontSize(15);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0);
  pdf.text('Answer Key — Common Sheet', margin, y);
  y += 7;
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(fmt(opts.title), margin, y);
  y += 6;
  const totals = BANDS.map(
    (b) => `${bandName(b)} ${items.filter((q) => (q?.band || 'core') === b).length}`,
  ).join('   ·   ');
  pdf.text(`Band totals: ${totals}`, margin, y);
  y += 8;

  pdf.setDrawColor(0);
  pdf.setLineWidth(0.4);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 7;

  items.forEach((q, idx) => {
    const promptLines = pdf.splitTextToSize(fmt(q?.prompt_text || ''), contentWidth - 46) as string[];
    const answerLines = pdf.splitTextToSize(fmt(q?.answer_text || ''), contentWidth - 46) as string[];
    if (y + (promptLines.length + answerLines.length) * 4.6 + 8 > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${idx + 1}.`, margin, y);
    drawBandGlyph(pdf as never, q.band, margin + 12, y - 1.2, 2, [90, 96, 106]);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(bandName(q.band), margin + 14, y);
    pdf.text(`Standard: ${itemStandards(q).map((s) => s.code).join(', ')}`, margin + 60, y);
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

  // ---- The four groups ----
  if (y + 20 + groups.length * 10 > pageHeight - margin) {
    pdf.addPage();
    y = margin;
  }
  pdf.setDrawColor(0);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 6;
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Groups — which six items each group completes', margin, y);
  y += 6;
  pdf.setFontSize(9);
  groups.forEach((g) => {
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Group ${g.group}`, margin, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Items ${g.items.join(', ')}`, margin + 20, y);
    pdf.text(
      `Mix: ${BANDS.map((b) => `${bandName(b)} ${g.mix[b] || 0}`).join(' · ')}`,
      margin + 62,
      y,
    );
    y += 4.8;
    pdf.text(`CHECK (sum of their six answers): ${formatCheckValue(g.check)}`, margin + 20, y);
    y += 6;
  });

  // ---- Standards coverage by group ----
  const coverage = groupCoverage(items, groups.map((g) => ({ group: g.group, items: g.items })));
  pdf.addPage();
  let cy = margin;
  pdf.setFontSize(15);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Standards Coverage — Common Sheet, Four Groups', margin, cy);
  cy += 7;
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(fmt(opts.title), margin, cy);
  cy += 5.5;
  pdf.setFontSize(9);
  pdf.text(
    'Item counts per standard for each group. "All" marks standards every student is assessed on regardless of group.',
    margin,
    cy,
    { maxWidth: contentWidth },
  );
  cy += 10;

  const colStd = margin;
  const colTopic = margin + 30;
  const colGroupStart = margin + contentWidth - 62;
  const colStep = 10;
  const colAll = margin + contentWidth - 20;

  pdf.setFontSize(8.5);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Standard', colStd, cy);
  pdf.text('Topic', colTopic, cy);
  groups.forEach((g, i) => pdf.text(`G${g.group}`, colGroupStart + i * colStep, cy));
  pdf.text('All', colAll, cy);
  cy += 3;
  pdf.setLineWidth(0.3);
  pdf.line(margin, cy, pageWidth - margin, cy);
  cy += 4.5;

  pdf.setFont('helvetica', 'normal');
  coverage.rows.forEach((row) => {
    if (cy > pageHeight - margin - 24) {
      pdf.addPage();
      cy = margin;
    }
    pdf.text(row.code, colStd, cy);
    const topic = pdf.splitTextToSize(fmt(row.topicName), colGroupStart - colTopic - 4) as string[];
    pdf.text(topic[0] || '', colTopic, cy);
    groups.forEach((g, i) => pdf.text(`${row.perGroup[g.group] || 0}`, colGroupStart + i * colStep, cy));
    pdf.text(row.allGroups ? 'Yes' : '—', colAll, cy);
    cy += 4.6;
  });

  cy += 4;
  pdf.line(margin, cy, pageWidth - margin, cy);
  cy += 6;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.text(`Distinct standards covered: ${coverage.distinctStandards}`, margin, cy);
  cy += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.text(
    `Assessed for every student regardless of group: ${coverage.universal.length > 0 ? coverage.universal.join(', ') : 'none'}`,
    margin,
    cy,
    { maxWidth: contentWidth },
  );

  pdf.setFontSize(8);
  pdf.setTextColor(150);
  pdf.text('Teacher / administrator copy', pageWidth / 2, pageHeight - 10, { align: 'center' });
  pdf.setTextColor(0);

  return pdf;
}
