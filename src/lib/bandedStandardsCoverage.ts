import { BANDS, VARIANTS, type BankedQuestion, type QuestionBand, type VariantLetter, type VariantSheet } from './bandedWorksheet';
import { resolveStandards, UNTAGGED_LABEL, type ResolvedStandard } from './questionStandards';

/** Standards for one item, or a single "Untagged" pseudo-entry when nothing resolved. */
export function itemStandards(q: BankedQuestion | undefined): ResolvedStandard[] {
  const resolved = resolveStandards(q?.topicNames);
  return resolved.length > 0 ? resolved : [{ code: UNTAGGED_LABEL, topicName: UNTAGGED_LABEL }];
}

export interface VariantCoverageRow {
  code: string;
  topicName: string;
  /** Items on this variant hitting the standard. */
  count: number;
  /** Bands those items sit in, in ascending band order. */
  bands: QuestionBand[];
}

/** Distinct standards a single variant covers, with item counts and the bands involved. */
export function variantCoverage(sheet: VariantSheet): VariantCoverageRow[] {
  const map = new Map<string, { topicName: string; count: number; bands: Set<QuestionBand> }>();
  sheet.items.forEach((q) => {
    if (!q) return;
    const band = (q.band || 'core') as QuestionBand;
    itemStandards(q).forEach((s) => {
      const row = map.get(s.code) || { topicName: s.topicName, count: 0, bands: new Set<QuestionBand>() };
      row.count += 1;
      row.bands.add(band);
      map.set(s.code, row);
    });
  });
  return Array.from(map.entries())
    .map(([code, r]) => ({
      code,
      topicName: r.topicName,
      count: r.count,
      bands: BANDS.filter((b) => r.bands.has(b)),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export interface CrossVariantRow {
  code: string;
  topicName: string;
  /** Item count per variant. */
  perVariant: Record<VariantLetter, number>;
  /** True when a shared anchor item carries this standard. */
  onAnchor: boolean;
  /** Every band this standard is assessed at, across all four variants. */
  bands: QuestionBand[];
}

export interface CrossVariantCoverage {
  rows: CrossVariantRow[];
  distinctStandards: number;
  /** Standards assessed at all four bands somewhere across the variants. */
  atEveryBand: number;
  /** Standards assessed at exactly one band. */
  atOneBandOnly: number;
}

/** The administrator-facing summary: every standard against every variant. */
export function crossVariantCoverage(
  variants: VariantSheet[],
  anchors: BankedQuestion[],
): CrossVariantCoverage {
  const anchorCodes = new Set<string>();
  anchors.forEach((q) => itemStandards(q).forEach((s) => anchorCodes.add(s.code)));

  const map = new Map<
    string,
    { topicName: string; perVariant: Record<VariantLetter, number>; bands: Set<QuestionBand> }
  >();

  variants.forEach((sheet) => {
    sheet.items.forEach((q) => {
      if (!q) return;
      const band = (q.band || 'core') as QuestionBand;
      itemStandards(q).forEach((s) => {
        const row =
          map.get(s.code) ||
          {
            topicName: s.topicName,
            perVariant: { A: 0, B: 0, C: 0, D: 0 } as Record<VariantLetter, number>,
            bands: new Set<QuestionBand>(),
          };
        row.perVariant[sheet.variant] += 1;
        row.bands.add(band);
        map.set(s.code, row);
      });
    });
  });

  const rows: CrossVariantRow[] = Array.from(map.entries())
    .map(([code, r]) => ({
      code,
      topicName: r.topicName,
      perVariant: { ...r.perVariant },
      onAnchor: anchorCodes.has(code),
      bands: BANDS.filter((b) => r.bands.has(b)),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  return {
    rows,
    distinctStandards: rows.length,
    atEveryBand: rows.filter((r) => r.bands.length === BANDS.length).length,
    atOneBandOnly: rows.filter((r) => r.bands.length === 1).length,
  };
}

/** Flat, sheet-wide list of codes for the optional student-sheet footer. */
export function sheetStandardCodes(items: BankedQuestion[]): string[] {
  const codes = new Set<string>();
  items.forEach((q) => {
    if (!q) return;
    resolveStandards(q.topicNames).forEach((s) => codes.add(s.code));
  });
  // Sorted, so the printed order can never be read back against item order.
  return Array.from(codes).sort((a, b) => a.localeCompare(b));
}

export const VARIANT_ORDER = VARIANTS;

// ===================== Common-sheet (one sheet, four groups) coverage =====================

export interface GroupCoverageRow {
  code: string;
  topicName: string;
  /** Item count per group number 1-4. */
  perGroup: Record<number, number>;
  /** True when every group's item list hits this standard — every student, whatever group. */
  allGroups: boolean;
  /** Every band this standard is assessed at on the sheet. */
  bands: QuestionBand[];
}

export interface GroupCoverage {
  rows: GroupCoverageRow[];
  distinctStandards: number;
  /** Standards every student hits regardless of group. */
  universal: string[];
}

/**
 * Standards coverage for the common-sheet mode: which standards each GROUP is assessed
 * on, and which standards every student hits regardless of group.
 */
export function groupCoverage(
  items: BankedQuestion[],
  groups: { group: number; items: number[] }[],
): GroupCoverage {
  const map = new Map<
    string,
    { topicName: string; perGroup: Record<number, number>; bands: Set<QuestionBand> }
  >();

  groups.forEach((g) => {
    g.items.forEach((n) => {
      const q = items[n - 1];
      if (!q) return;
      const band = (q.band || 'core') as QuestionBand;
      itemStandards(q).forEach((s) => {
        const row =
          map.get(s.code) || { topicName: s.topicName, perGroup: {} as Record<number, number>, bands: new Set<QuestionBand>() };
        row.perGroup[g.group] = (row.perGroup[g.group] || 0) + 1;
        row.bands.add(band);
        map.set(s.code, row);
      });
    });
  });

  const rows: GroupCoverageRow[] = Array.from(map.entries())
    .map(([code, r]) => ({
      code,
      topicName: r.topicName,
      perGroup: { ...r.perGroup },
      allGroups: groups.every((g) => (r.perGroup[g.group] || 0) > 0),
      bands: BANDS.filter((b) => r.bands.has(b)),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  return {
    rows,
    distinctStandards: rows.length,
    universal: rows.filter((r) => r.allGroups).map((r) => r.code),
  };
}
