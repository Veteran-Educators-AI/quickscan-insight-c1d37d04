import {
  BANDS,
  ITEMS_PER_SHEET,
  answersMatch,
  parseNumericAnswer,
  type BandMix,
  type BankedQuestion,
  type BandShortfall,
  type QuestionBand,
} from './bandedWorksheet';


/**
 * THIRD BANDED MODE — one common sheet, four groups.
 *
 * Every student answers from the SAME ten questions in the SAME order; the sheet is
 * identical for everyone except the pre-printed name. Differentiation is which six of
 * the ten items each group is asked to complete, and that lives on the teacher-only
 * card, never on the sheet.
 */

export const GROUPS = [1, 2, 3, 4] as const;
export type GroupNumber = typeof GROUPS[number];

/** Items each group completes out of the ten on the sheet. */
export const GROUP_ITEM_COUNT = 6;

/** Default whole-sheet band composition: 3 foundation, 3 core, 2 extension, 2 depth. */
export const DEFAULT_SHEET_BANDS: BandMix = { foundation: 3, core: 3, extension: 2, depth: 2 };

/** Default per-group band mixes. Each totals GROUP_ITEM_COUNT. */
export const DEFAULT_GROUP_MIX: Record<GroupNumber, BandMix> = {
  1: { foundation: 3, core: 2, extension: 1, depth: 0 },
  2: { foundation: 2, core: 2, extension: 1, depth: 1 },
  3: { foundation: 1, core: 2, extension: 2, depth: 1 },
  4: { foundation: 1, core: 1, extension: 2, depth: 2 },
};

/** Placement mapping: highest band answered correctly → group for the next cycle. */
export const BAND_TO_GROUP: Record<QuestionBand, GroupNumber> = {
  foundation: 1,
  core: 2,
  extension: 3,
  depth: 4,
};

export class GroupSolveError extends Error {
  group: GroupNumber;
  constructor(group: GroupNumber, reason: string) {
    super(`Group ${group}: ${reason}`);
    this.name = 'GroupSolveError';
    this.group = group;
  }
}

// ===================== Band interleaving across positions =====================

/**
 * Distributes the band counts across the sheet positions so that position carries no
 * information about difficulty: no two adjacent positions hold the same band, and no
 * contiguous run of positions shares one. Generated, never hardcoded.
 *
 * Greedy largest-remaining-not-equal-to-previous placement, which succeeds whenever no
 * single band exceeds ceil(n / 2) of the sheet.
 */
export function interleaveBands(counts: BandMix, total: number = ITEMS_PER_SHEET): QuestionBand[] {
  const remaining: BandMix = { ...counts };
  const sum = BANDS.reduce((n, b) => n + (remaining[b] || 0), 0);
  if (sum !== total) {
    throw new Error(`Band counts total ${sum}, but the sheet has ${total} items.`);
  }
  if (BANDS.some((b) => (remaining[b] || 0) > Math.ceil(total / 2))) {
    throw new Error(
      'One band holds more than half the sheet, so the bands cannot be interleaved without two adjacent items sharing a band. Rebalance the sheet composition.',
    );
  }

  const layout: QuestionBand[] = [];
  let prev: QuestionBand | null = null;
  for (let i = 0; i < total; i++) {
    const candidates = BANDS.filter((b) => (remaining[b] || 0) > 0 && b !== prev);
    if (candidates.length === 0) throw new Error('Could not interleave the bands across the sheet positions.');
    let pick = candidates[0];
    candidates.forEach((b) => {
      if ((remaining[b] || 0) > (remaining[pick] || 0)) pick = b;
    });
    layout.push(pick);
    remaining[pick] -= 1;
    prev = pick;
  }

  assertNoAdjacentRepeat(layout);
  return layout;
}

/** Throws when any two adjacent positions share a band. */
export function assertNoAdjacentRepeat(layout: QuestionBand[]): void {
  for (let i = 1; i < layout.length; i++) {
    if (layout[i] === layout[i - 1]) {
      throw new Error(`Positions ${i} and ${i + 1} share the band "${layout[i]}".`);
    }
  }
}

/** Positions (1-indexed) holding each band. */
export function positionsByBand(layout: QuestionBand[]): Record<QuestionBand, number[]> {
  const map: Record<QuestionBand, number[]> = { foundation: [], core: [], extension: [], depth: [] };
  layout.forEach((b, i) => map[b].push(i + 1));
  return map;
}

// ===================== Group item lists =====================

/** A list is contiguous when its sorted positions form an unbroken run. */
export function isContiguous(items: number[]): boolean {
  if (items.length < 2) return true;
  const sorted = [...items].sort((a, b) => a - b);
  return sorted[sorted.length - 1] - sorted[0] === sorted.length - 1;
}

/** Both required span constraints: at least one early item AND at least one late item. */
export function spansSheet(items: number[], total: number = ITEMS_PER_SHEET): boolean {
  const early = items.some((n) => n <= 3);
  const late = items.some((n) => n >= total - 2);
  return early && late;
}

function combinations(pool: number[], k: number): number[][] {
  if (k === 0) return [[]];
  if (pool.length < k) return [];
  const out: number[][] = [];
  const walk = (start: number, acc: number[]) => {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < pool.length; i++) {
      acc.push(pool[i]);
      walk(i + 1, acc);
      acc.pop();
    }
  };
  walk(0, []);
  return out;
}

/**
 * Picks the six item numbers for one group: exactly the requested band mix, never a
 * contiguous run, and always spanning both ends of the sheet. Throws rather than
 * silently relaxing a constraint.
 */
export function solveGroupItems(
  layout: QuestionBand[],
  mix: BandMix,
  group: GroupNumber,
): number[] {
  const byBand = positionsByBand(layout);
  const total = layout.length;
  const want = BANDS.map((b) => ({ band: b, k: mix[b] || 0 }));
  const asked = want.reduce((n, w) => n + w.k, 0);
  if (asked !== GROUP_ITEM_COUNT) {
    throw new GroupSolveError(group, `the mix totals ${asked} items, but a group completes ${GROUP_ITEM_COUNT}.`);
  }
  for (const w of want) {
    if (w.k > byBand[w.band].length) {
      throw new GroupSolveError(
        group,
        `asks for ${w.k} ${w.band} item(s) but the sheet only holds ${byBand[w.band].length}.`,
      );
    }
  }

  const perBand = want.map((w) => combinations(byBand[w.band], w.k));

  // Collect the valid lists, then keep the most evenly spread one so a group's list never
  // reads as "the early ones" or "the late ones".
  const valid: number[][] = [];
  const LIMIT = 20000;
  const walk = (i: number, acc: number[]) => {
    if (valid.length >= LIMIT) return;
    if (i === perBand.length) {
      const items = [...acc].sort((a, b) => a - b);
      if (isContiguous(items)) return;
      if (!spansSheet(items, total)) return;
      valid.push(items);
      return;
    }
    for (const combo of perBand[i]) {
      walk(i + 1, acc.concat(combo));
      if (valid.length >= LIMIT) return;
    }
  };
  walk(0, []);

  if (valid.length === 0) {
    throw new GroupSolveError(
      group,
      'no set of items satisfies this mix while staying non-contiguous and spanning both ends of the sheet. Adjust the mix or the sheet composition.',
    );
  }

  const midpoint = (total + 1) / 2;
  const score = (items: number[]) => {
    const mean = items.reduce((n, v) => n + v, 0) / items.length;
    const adjacent = items.filter((v, i) => i > 0 && v === items[i - 1] + 1).length;
    return Math.abs(mean - midpoint) * 10 + adjacent;
  };
  return valid.reduce((best, cur) => (score(cur) < score(best) ? cur : best), valid[0]);
}


export interface GroupPlan {
  group: GroupNumber;
  mix: BandMix;
  items: number[];
  /** Sum of the group's six numeric answers, or null (prints as a dash). */
  check: number | null;
}

/** Solves all four groups against a layout. Any unsatisfiable group throws. */
export function solveGroups(
  layout: QuestionBand[],
  sheetItems: BankedQuestion[],
  mixes: Record<GroupNumber, BandMix> = DEFAULT_GROUP_MIX,
): GroupPlan[] {
  return GROUPS.map((g) => {
    const items = solveGroupItems(layout, mixes[g], g);
    return { group: g, mix: { ...mixes[g] }, items, check: computeGroupCheck(sheetItems, items) };
  });
}

/** CHECK total for a group: the sum of its six numeric answers, else null. */
export function computeGroupCheck(
  sheetItems: Pick<BankedQuestion, 'answer_text'>[],
  itemNumbers: number[],
): number | null {
  let total = 0;
  for (const n of itemNumbers) {
    const item = sheetItems[n - 1];
    if (!item) return null;
    const value = parseNumericAnswer(item.answer_text);
    if (value === null) return null;
    total += value;
  }
  return Math.round(total * 1e6) / 1e6;
}

/** Plain-words item list for the teacher-only card. */
export function formatItemList(itemNumbers: number[]): string {
  return `Do items ${itemNumbers.join(', ')}`;
}

// ===================== Building the common sheet from the bank =====================

export interface CommonSheetBuild {
  /** Ten questions in sheet order — identical for every student. */
  items: BankedQuestion[];
  /** The band of each position, in position order. Teacher-facing only. */
  layout: QuestionBand[];
  groups: GroupPlan[];
  shortfalls: BandShortfall[];
}

/**
 * Draws the ten common items from the band pools, interleaves their bands across the
 * positions, and solves the four group lists. `answer_group` de-duplication applies to
 * the sheet as a whole: it must never carry the same answer twice.
 */
export function buildCommonSheet(
  pools: Record<QuestionBand, BankedQuestion[]>,
  counts: BandMix = DEFAULT_SHEET_BANDS,
  mixes: Record<GroupNumber, BandMix> = DEFAULT_GROUP_MIX,
): CommonSheetBuild {
  const shortfalls: BandShortfall[] = [];
  BANDS.forEach((b) => {
    const available = countDistinctAnswers(pools[b] || []);
    const needed = counts[b] || 0;
    if (available < needed) shortfalls.push({ band: b, available, needed });
  });
  if (shortfalls.length > 0) return { items: [], layout: [], groups: [], shortfalls };

  const layout = interleaveBands(counts, BANDS.reduce((n, b) => n + (counts[b] || 0), 0));

  const usedIds = new Set<string>();
  const usedGroups = new Set<string>();
  const cursor: Record<QuestionBand, number> = { foundation: 0, core: 0, extension: 0, depth: 0 };

  const items: BankedQuestion[] = layout.map((band) => {
    const pool = pools[band] || [];
    const pick = pool
      .slice(cursor[band])
      .concat(pool.slice(0, cursor[band]))
      .find((q) => !usedIds.has(q.id) && !(q.answer_group && usedGroups.has(q.answer_group)));
    if (!pick) throw new Error(`Not enough distinct ${band} items for the common sheet.`);
    usedIds.add(pick.id);
    if (pick.answer_group) usedGroups.add(pick.answer_group);
    cursor[band] = (pool.indexOf(pick) + 1) % Math.max(1, pool.length);
    return pick;
  });

  return { items, layout, groups: solveGroups(layout, items, mixes), shortfalls: [] };
}

function countDistinctAnswers(list: BankedQuestion[]): number {
  const seen = new Set<string>();
  let n = 0;
  for (const q of list) {
    if (q.answer_group) {
      if (seen.has(q.answer_group)) continue;
      seen.add(q.answer_group);
    }
    n++;
  }
  return n;
}

// ===================== Band-stop over a group's own six items =====================


export interface GroupBandStopResult {
  bandReached: QuestionBand | null;
  suggestedGroup: GroupNumber | null;
  correctItemNumbers: number[];
  bandsSeen: QuestionBand[];
}

/**
 * Highest band answered correctly, computed ONLY over the six items in that student's
 * group. Deterministic comparison against the stored answer key — nothing here judges a
 * student's method, working or justification.
 */
export function computeGroupBandStop(
  sheetItems: Pick<BankedQuestion, 'band' | 'answer_text'>[],
  itemNumbers: number[],
  answers: Record<string, string>,
): GroupBandStopResult {
  const correctItemNumbers: number[] = [];
  const seen = new Set<QuestionBand>();
  let highestIdx = -1;

  itemNumbers.forEach((n) => {
    const item = sheetItems[n - 1];
    if (!item) return;
    const band = (item.band || 'core') as QuestionBand;
    seen.add(band);
    if (answersMatch(answers[String(n)], item.answer_text)) {
      correctItemNumbers.push(n);
      highestIdx = Math.max(highestIdx, BANDS.indexOf(band));
    }
  });

  const bandReached = highestIdx >= 0 ? BANDS[highestIdx] : null;
  return {
    bandReached,
    suggestedGroup: bandReached ? BAND_TO_GROUP[bandReached] : null,
    correctItemNumbers,
    bandsSeen: BANDS.filter((b) => seen.has(b)),
  };
}
