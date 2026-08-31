import { supabase } from '@/integrations/supabase/client';

export const BANDS = ['foundation', 'core', 'extension', 'depth'] as const;
export type QuestionBand = typeof BANDS[number];

/** Teacher-facing only. The student sheet carries no band marks at all. */
export const BAND_GLYPH: Record<QuestionBand, string> = {
  foundation: '\u25CF', // ●
  core: '\u25B2',       // ▲
  extension: '\u25A0',  // ■
  depth: '\u25C6',      // ◆
};

export const BAND_GLYPH_COLOR = '#B9BFC9';
export const BAND_GLYPH_RGB: [number, number, number] = [185, 191, 201];
export const BAND_GLYPH_FONT_SIZE = 8;

/** Nominal glyph size in mm for the vector-drawn PDF marks. */
export const BAND_GLYPH_SIZE_MM = 1.6;

/**
 * Draws the band mark as a filled vector shape in the PDF.
 * The standard-14 PDF fonts use WinAnsiEncoding and cannot encode the
 * geometric-shapes code points in BAND_GLYPH, so the PDF path never uses text.
 * (x, y) is the right-margin anchor and the vertical centre of the mark.
 * Used on the teacher answer keys only.
 */
export function drawBandGlyph(
  pdf: {
    setFillColor: (r: number, g: number, b: number) => void;
    circle: (x: number, y: number, r: number, style?: string) => void;
    triangle: (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, style?: string) => void;
    rect: (x: number, y: number, w: number, h: number, style?: string) => void;
    lines: (lines: number[][], x: number, y: number, scale?: number[], style?: string, closed?: boolean) => void;
  },
  band: QuestionBand,
  x: number,
  y: number,
  size: number = BAND_GLYPH_SIZE_MM,
  rgb: [number, number, number] = BAND_GLYPH_RGB,
): void {
  pdf.setFillColor(...rgb);
  const h = size / 2;
  // right-aligned: shapes occupy [x - size, x]
  const cx = x - h;

  switch (band) {
    case 'foundation':
      pdf.circle(cx, y, h * 0.92, 'F');
      break;
    case 'core': {
      const th = size * 1.05;
      pdf.triangle(cx, y - th / 2, cx - h * 1.08, y + th / 2, cx + h * 1.08, y + th / 2, 'F');
      break;
    }
    case 'extension':
      pdf.rect(cx - h * 0.9, y - h * 0.9, size * 0.9, size * 0.9, 'F');
      break;
    case 'depth': {
      const d = h * 1.15;
      pdf.lines([[d, d], [-d, d], [-d, -d]], cx, y - d, [1, 1], 'F', true);
      break;
    }
  }
}


export interface BankedQuestion {
  id: string;
  band: QuestionBand;
  answer_group: string | null;
  prompt_text: string | null;
  answer_text: string | null;
  prompt_image_url: string | null;
  answer_image_url: string | null;
  difficulty: number | null;
  /** Linked topic names, used to resolve NYS standards at render time. */
  topicNames?: string[];
}


export interface BandShortfall {
  band: QuestionBand;
  available: number;
  needed: number;
}

export interface BandedSelectionOptions {
  /** Topic ids to restrict selection to. */
  topicIds?: string[];
  /** Topic names to restrict selection to; resolved to ids for this teacher or the shared defaults. */
  topicNames?: string[];
}

export interface TopicResolution {
  ids: string[];
  matched: string[];
  unmatched: string[];
}

/** Thrown when topics were requested but could not be fully resolved. Generation must stop. */
export class TopicResolutionError extends Error {
  unmatched: string[];
  constructor(unmatched: string[]) {
    super(
      unmatched.length === 1
        ? `Topic "${unmatched[0]}" could not be matched to a topic in the question bank. Nothing was generated.`
        : `These topics could not be matched to topics in the question bank: ${unmatched.map((n) => `"${n}"`).join(', ')}. Nothing was generated.`,
    );
    this.name = 'TopicResolutionError';
    this.unmatched = unmatched;
  }
}

/**
 * Resolves topic names to topic ids. Matches topics owned by this teacher OR the shared
 * defaults (`teacher_id is null`, e.g. the seeded NYS Regents topic map), and reports
 * which requested names failed to match so callers can refuse to generate.
 */
export async function resolveTopicIds(teacherId: string, topicNames: string[]): Promise<TopicResolution> {
  if (!topicNames || topicNames.length === 0) return { ids: [], matched: [], unmatched: [] };
  const { data, error } = await supabase
    .from('topics')
    .select('id, name, teacher_id')
    .or(`teacher_id.eq.${teacherId},teacher_id.is.null`)
    .in('name', topicNames);
  if (error) throw error;

  const rows = (data || []) as { id: string; name: string }[];
  const norm = (s: string) => s.trim().toLowerCase();
  const matchedNames = new Set(rows.map((r) => norm(r.name)));
  return {
    ids: Array.from(new Set(rows.map((r) => r.id))),
    matched: topicNames.filter((n) => matchedNames.has(norm(n))),
    unmatched: topicNames.filter((n) => !matchedNames.has(norm(n))),
  };
}

/**
 * Loads the banked questions for this teacher, optionally restricted to topics, and
 * groups them per band. Throws `TopicResolutionError` when topic names were supplied
 * and any of them failed to resolve — a failed filter must never degrade to
 * "use everything".
 */
export async function fetchBandPools(
  teacherId: string,
  options?: BandedSelectionOptions,
): Promise<Record<QuestionBand, BankedQuestion[]>> {
  const opts = options || {};
  const askedForNames = Boolean(opts.topicNames && opts.topicNames.length > 0);
  const askedForIds = Boolean(opts.topicIds && opts.topicIds.length > 0);

  let resolvedIds: string[] = [...(opts.topicIds || [])];
  if (askedForNames) {
    const resolution = await resolveTopicIds(teacherId, opts.topicNames as string[]);
    if (resolution.unmatched.length > 0) throw new TopicResolutionError(resolution.unmatched);
    resolvedIds = [...resolvedIds, ...resolution.ids];
  }

  const topicIds = askedForNames || askedForIds ? Array.from(new Set(resolvedIds)) : null;
  if (topicIds && topicIds.length === 0) throw new TopicResolutionError(opts.topicNames || []);

  const { data, error } = await supabase
    .from('questions')
    .select('id, band, answer_group, prompt_text, answer_text, prompt_image_url, answer_image_url, difficulty, question_topics(topic_id, topics(name))')
    .eq('teacher_id', teacherId)
    .not('answer_text', 'is', null)
    .neq('answer_text', '')
    .order('created_at', { ascending: false });
  if (error) throw error;

  return groupByBand((data || []) as unknown[], topicIds);
}

/** Pure: topic filtering plus band grouping. Exposed so selection can be tested without a session. */
export function groupByBand(
  allRows: unknown[],
  topicIds: string[] | null = null,
): Record<QuestionBand, BankedQuestion[]> {
  if (topicIds && topicIds.length === 0) throw new TopicResolutionError([]);
  const pools: Record<QuestionBand, BankedQuestion[]> = { foundation: [], core: [], extension: [], depth: [] };

  (allRows as Record<string, unknown>[]).forEach((r) => {
    const links = (r.question_topics as { topic_id: string; topics?: { name?: string } | null }[]) || [];
    if (topicIds) {
      if (!links.some((l) => topicIds.includes(l.topic_id))) return;
    }
    const band = ((r.band as QuestionBand) || 'core') as QuestionBand;
    if (!BANDS.includes(band)) return;
    pools[band].push({
      id: r.id as string,
      band,
      answer_group: (r.answer_group as string) ?? null,
      prompt_text: (r.prompt_text as string) ?? null,
      answer_text: (r.answer_text as string) ?? null,
      prompt_image_url: (r.prompt_image_url as string) ?? null,
      answer_image_url: (r.answer_image_url as string) ?? null,
      difficulty: (r.difficulty as number) ?? null,
      topicNames: Array.from(
        new Set(links.map((l) => l.topics?.name).filter((n): n is string => Boolean(n))),
      ),
    });

  });

  return pools;
}

export function formatShortfallMessage(shortfalls: BandShortfall[]): string {
  const label = (b: QuestionBand) => b.charAt(0).toUpperCase() + b.slice(1);
  return shortfalls
    .map((s) => `${label(s.band)}: ${s.available} available, ${s.needed} needed.`)
    .join(' ');
}

// ===================== The four sheet variants =====================

export const VARIANTS = ['A', 'B', 'C', 'D'] as const;
export type VariantLetter = typeof VARIANTS[number];

export const ITEMS_PER_SHEET = 10;

/** Positions (1-indexed) the shared anchor items occupy on every variant. */
export const ANCHOR_POSITIONS = [1, 4, 7, 10] as const;

/** Default anchor bands: 1 foundation, 2 core, 1 extension — in anchor-position order. */
export const DEFAULT_ANCHOR_BANDS: QuestionBand[] = ['foundation', 'core', 'core', 'extension'];

export type BandMix = Record<QuestionBand, number>;

/** Band mix for the 6 varying items of each variant. Ascending gradient A → D. */
export const DEFAULT_VARIANT_MIX: Record<VariantLetter, BandMix> = {
  A: { foundation: 4, core: 2, extension: 0, depth: 0 },
  B: { foundation: 2, core: 3, extension: 1, depth: 0 },
  C: { foundation: 1, core: 2, extension: 2, depth: 1 },
  D: { foundation: 0, core: 1, extension: 2, depth: 3 },
};

export const VARYING_ITEM_COUNT = 6;

export const emptyMix = (): BandMix => ({ foundation: 0, core: 0, extension: 0, depth: 0 });

export const mixTotal = (mix: BandMix): number => BANDS.reduce((n, b) => n + (mix[b] || 0), 0);

/** Whole-sheet band totals = anchor bands + the variant's varying mix. */
export function wholeSheetTotals(anchorBands: QuestionBand[], mix: BandMix): BandMix {
  const totals = emptyMix();
  anchorBands.forEach((b) => { totals[b] += 1; });
  BANDS.forEach((b) => { totals[b] += mix[b] || 0; });
  return totals;
}

export interface VariantSheet {
  variant: VariantLetter;
  /** Ten items in sheet order. Anchor items sit at ANCHOR_POSITIONS. */
  items: BankedQuestion[];
  /** Positions of the shared anchors on this sheet. */
  anchorPositions: number[];
  /** Whole-sheet band totals. */
  totals: BandMix;
  /** Sum of the ten numeric answers, or null when any answer is non-numeric. */
  check: number | null;
}

export interface VariantBuildResult {
  variants: VariantSheet[];
  /** The four shared anchor items, in anchor-position order. */
  anchors: BankedQuestion[];
  shortfalls: BandShortfall[];
}

/**
 * Peak per-band demand for a single sheet: the anchors plus the largest varying
 * requirement of any one variant. Items may be reused across variants, so the bank
 * only has to satisfy the worst single sheet.
 */
export function requiredByBand(
  anchorBands: QuestionBand[] = DEFAULT_ANCHOR_BANDS,
  mixes: Record<VariantLetter, BandMix> = DEFAULT_VARIANT_MIX,
): BandMix {
  const req = emptyMix();
  anchorBands.forEach((b) => { req[b] += 1; });
  BANDS.forEach((b) => {
    req[b] += Math.max(...VARIANTS.map((v) => mixes[v][b] || 0));
  });
  return req;
}

/**
 * Builds the four variants: one shared set of anchor items in fixed positions, plus
 * six varying items per variant. `answer_group` de-duplication is applied within each
 * variant (anchors included) so no sheet ever carries the same answer twice; across
 * variants repetition is allowed and irrelevant.
 */
export function buildVariants(
  pools: Record<QuestionBand, BankedQuestion[]>,
  anchorBands: QuestionBand[] = DEFAULT_ANCHOR_BANDS,
  mixes: Record<VariantLetter, BandMix> = DEFAULT_VARIANT_MIX,
): VariantBuildResult {
  const req = requiredByBand(anchorBands, mixes);
  const shortfalls: BandShortfall[] = [];
  BANDS.forEach((b) => {
    const available = countDistinctAnswers(pools[b] || []);
    if (available < req[b]) shortfalls.push({ band: b, available, needed: req[b] });
  });
  if (shortfalls.length > 0) return { variants: [], anchors: [], shortfalls };

  // ---- Anchors: drawn once, reused on all four variants ----
  const anchorGroups = new Set<string>();
  const anchorIds = new Set<string>();
  const anchors: BankedQuestion[] = anchorBands.map((band) => {
    const pick = (pools[band] || []).find(
      (q) => !anchorIds.has(q.id) && !(q.answer_group && anchorGroups.has(q.answer_group)),
    );
    if (!pick) throw new Error(`Not enough ${band} items to draw the shared anchors.`);
    anchorIds.add(pick.id);
    if (pick.answer_group) anchorGroups.add(pick.answer_group);
    return pick;
  });

  // Rotating cursor per band so the variants do not all reuse the same varying items.
  const cursor: BandMix = emptyMix();

  const variants: VariantSheet[] = VARIANTS.map((letter) => {
    const mix = mixes[letter];
    const usedIds = new Set(anchorIds);
    const usedGroups = new Set(anchorGroups);
    const varying: BankedQuestion[] = [];

    BANDS.forEach((band) => {
      const need = mix[band] || 0;
      const pool = pools[band] || [];
      for (let taken = 0; taken < need; ) {
        let found: BankedQuestion | null = null;
        for (let i = 0; i < pool.length; i++) {
          const q = pool[(cursor[band] + i) % pool.length];
          if (usedIds.has(q.id)) continue;
          if (q.answer_group && usedGroups.has(q.answer_group)) continue;
          found = q;
          cursor[band] = (cursor[band] + i + 1) % pool.length;
          break;
        }
        if (!found) throw new Error(`Not enough distinct ${band} items for variant ${letter}.`);
        usedIds.add(found.id);
        if (found.answer_group) usedGroups.add(found.answer_group);
        varying.push(found);
        taken++;
      }
    });

    // Lay out the sheet: anchors at their fixed positions, varying items filling the rest
    // in ascending band order.
    const items: BankedQuestion[] = new Array(ITEMS_PER_SHEET);
    ANCHOR_POSITIONS.forEach((pos, i) => { items[pos - 1] = anchors[i]; });
    let vi = 0;
    for (let pos = 1; pos <= ITEMS_PER_SHEET; pos++) {
      if (items[pos - 1]) continue;
      items[pos - 1] = varying[vi++];
    }

    return {
      variant: letter,
      items,
      anchorPositions: [...ANCHOR_POSITIONS],
      totals: wholeSheetTotals(anchorBands, mix),
      check: computeVariantCheck(items),
    };
  });

  return { variants, anchors, shortfalls: [] };
}

/** Distinct-answer count: at most one question per non-null answer_group. */
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

/**
 * Tolerant numeric parse of a stored answer.
 * Strips surrounding whitespace, a leading label ("x =", "Area ="), thousands
 * separators, a leading currency symbol and a trailing unit ("cm", "cm²", "units").
 * Anything still ambiguous (ranges, multiple values, fractions, prose, "5 or 6")
 * returns null so the CHECK line degrades to a dash rather than printing a wrong total.
 * A wrong total is worse than none: a student who sums correctly would think they are wrong.
 */
export function parseNumericAnswer(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // Normalise canonical thousands grouping first, so "1,200.50" is not mistaken
  // for the list "1, 200.50" by the multiple-value guards below.
  s = s.replace(/(?<=\d)(,)(?=\d{3}(\D|$))/g, '');

  // Reject anything that reads as more than one value, a range, or an expression.
  if (/\b(or|and|to)\b/i.test(s)) return null;
  if (/[,;]/.test(s)) return null;              // "3, 5" — a real separator is now gone
  if (/\d\s*[-–]\s*\d/.test(s)) return null;    // "3-5" is a range
  if (/[/÷]/.test(s)) return null;              // fractions / ratios are not unambiguous
  if (/[<>≤≥±~≈]/.test(s)) return null;
  if (/\d\s*[+*^]|[√π]/.test(s)) return null;   // unevaluated expressions ("2 + 3", "2√3")

  // Leading label: "x =", "Area =", "AB ="
  s = s.replace(/^[^=]{0,24}=\s*/, '').trim();
  if (!s) return null;

  // Leading currency
  s = s.replace(/^[$£€]\s*/, '').trim();

  // Trailing unit words / symbols, incl. squared and cubed marks written as
  // ² ³ or as a trailing 2 / 3 ("cm2", "m3"), plus a trailing full stop.
  s = s.replace(
    /\s*(%|°|degrees?|deg|cm|mm|m|km|in(?:ches)?|ft|feet|yd|units?|sq|square)\s*(?:[²³]|[23])?\s*\.?$/i,
    '',
  ).trim();
  s = s.replace(/\s*[²³]\s*$/, '').trim();
  s = s.replace(/\s*\.$/, '').trim();

  if (!/^[-+]?(\d+(\.\d+)?|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Rounds away float noise from summing decimal answers. */
function tidy(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * The single CHECK total for a variant: the sum of its ten numeric answers.
 * Any non-numeric (or missing) answer yields null, which prints as a dash.
 */
export function computeVariantCheck(items: Pick<BankedQuestion, 'answer_text'>[]): number | null {
  let total = 0;
  for (const item of items) {
    if (!item) return null;
    const n = parseNumericAnswer(item.answer_text);
    if (n === null) return null;
    total += n;
  }
  return tidy(total);
}

/** Formats a CHECK total for print. A non-numeric variant prints an em dash. */
export function formatCheckValue(total: number | null): string {
  if (total === null) return '\u2014';
  return String(tidy(total));
}

// ===================== Band-stop placement =====================

/**
 * Deterministic answer comparison against the stored key. Numeric answers compare
 * numerically (so "12.5 cm" matches "12.5"); anything else compares as case- and
 * whitespace-insensitive text. This never judges a student's method, working or
 * justification — only whether the entered answer equals the stored one.
 */
export function answersMatch(entered: string | null | undefined, stored: string | null | undefined): boolean {
  if (entered == null || stored == null) return false;
  const a = String(entered).trim();
  const b = String(stored).trim();
  if (!a || !b) return false;
  const na = parseNumericAnswer(a);
  const nb = parseNumericAnswer(b);
  if (na !== null && nb !== null) return Math.abs(na - nb) < 1e-9;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[.,;]+$/, '');
  return norm(a) === norm(b);
}

export interface BandStopResult {
  /** Highest band answered correctly on the student's own variant, or null if none. */
  bandReached: QuestionBand | null;
  /** Suggested variant for the next cycle. Null when nothing was correct. */
  suggestedVariant: VariantLetter | null;
  correctItemNumbers: number[];
  /** Bands the student's own variant actually contained — a band never seen is never "failed". */
  bandsSeen: QuestionBand[];
}

export const BAND_TO_VARIANT: Record<QuestionBand, VariantLetter> = {
  foundation: 'A',
  core: 'B',
  extension: 'C',
  depth: 'D',
};

export const variantIndex = (letter: VariantLetter): number => VARIANTS.indexOf(letter) + 1;
export const variantFromIndex = (index: number): VariantLetter => VARIANTS[Math.min(3, Math.max(0, index - 1))];

/**
 * Computes the highest band answered correctly over the items on the student's own
 * variant. `answers` is keyed by 1-indexed item number on that variant.
 */
export function computeBandStop(
  variantItems: Pick<BankedQuestion, 'band' | 'answer_text'>[],
  answers: Record<string, string>,
): BandStopResult {
  const correctItemNumbers: number[] = [];
  const seen = new Set<QuestionBand>();
  let highestIdx = -1;

  variantItems.forEach((item, i) => {
    if (!item) return;
    const band = (item.band || 'core') as QuestionBand;
    seen.add(band);
    if (answersMatch(answers[String(i + 1)], item.answer_text)) {
      correctItemNumbers.push(i + 1);
      highestIdx = Math.max(highestIdx, BANDS.indexOf(band));
    }
  });

  const bandReached = highestIdx >= 0 ? BANDS[highestIdx] : null;
  return {
    bandReached,
    suggestedVariant: bandReached ? BAND_TO_VARIANT[bandReached] : null,
    correctItemNumbers,
    bandsSeen: BANDS.filter((b) => seen.has(b)),
  };
}
