import { supabase } from '@/integrations/supabase/client';

export const BANDS = ['foundation', 'core', 'extension', 'depth'] as const;
export type QuestionBand = typeof BANDS[number];

/** Right-margin glyphs. Never accompanied by a band name on the student sheet. */
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
): void {
  pdf.setFillColor(...BAND_GLYPH_RGB);
  const h = size / 2;
  // right-aligned: shapes occupy [x - size, x]
  const cx = x - h;

  switch (band) {
    case 'foundation':
      // Filled circle. Radius trimmed so its area matches the square roughly.
      pdf.circle(cx, y, h * 0.92, 'F');
      break;
    case 'core': {
      // Filled triangle, apex up. Slightly taller to match visual weight.
      const th = size * 1.05;
      pdf.triangle(cx, y - th / 2, cx - h * 1.08, y + th / 2, cx + h * 1.08, y + th / 2, 'F');
      break;
    }
    case 'extension':
      pdf.rect(cx - h * 0.9, y - h * 0.9, size * 0.9, size * 0.9, 'F');
      break;
    case 'depth': {
      // Square rotated 45 degrees (diamond).
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
}

export interface BandComposition {
  foundation: number;
  core: number;
  extension: number;
  depth: number;
}

/** Default composition: a 10-item sheet is 3 foundation / 3 core / 2 extension / 2 depth. */
export function defaultComposition(total: number): BandComposition {
  const foundation = Math.max(1, Math.round(total * 0.3));
  const core = Math.max(1, Math.round(total * 0.3));
  const remaining = Math.max(0, total - foundation - core);
  const extension = Math.ceil(remaining / 2);
  const depth = remaining - extension;
  return { foundation, core, extension, depth };
}

export interface BandShortfall {
  band: QuestionBand;
  available: number;
  needed: number;
}

export interface BandedSelectionResult {
  items: BankedQuestion[];
  shortfalls: BandShortfall[];
  availableByBand: Record<QuestionBand, number>;
}

export interface BandedSelectionOptions {
  /** Topic ids to restrict selection to. */
  topicIds?: string[];
  /** Topic names to restrict selection to; resolved to ids for this teacher or the shared defaults. */
  topicNames?: string[];
}

export interface TopicResolution {
  /** Ids matched, in no particular order. */
  ids: string[];
  /** Names that matched a topic row. */
  matched: string[];
  /** Names that could not be matched to any topic. */
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
 * Selects banked questions per band, optionally restricted to selected topics.
 * De-duplication: at most one question per non-null `answer_group`, applied globally
 * across the whole sheet (a group claimed by one band is unavailable to the others).
 * Shortfall counts are computed after topic filtering, so "needed vs available"
 * always means available *within the selected topics*.
 *
 * Throws `TopicResolutionError` when topic names were supplied and any of them failed
 * to resolve — a partially or fully failed filter must never degrade to "use everything".
 */
export async function selectBandedQuestions(
  teacherId: string,
  composition: BandComposition,
  options?: string[] | BandedSelectionOptions,
): Promise<BandedSelectionResult> {
  const opts: BandedSelectionOptions = Array.isArray(options) ? { topicIds: options } : (options || {});
  const askedForNames = Boolean(opts.topicNames && opts.topicNames.length > 0);
  const askedForIds = Boolean(opts.topicIds && opts.topicIds.length > 0);

  let resolvedIds: string[] = [...(opts.topicIds || [])];
  if (askedForNames) {
    const resolution = await resolveTopicIds(teacherId, opts.topicNames as string[]);
    if (resolution.unmatched.length > 0) throw new TopicResolutionError(resolution.unmatched);
    resolvedIds = [...resolvedIds, ...resolution.ids];
  }

  // null => filtering not requested. [] can never reach the picker.
  const topicIds = askedForNames || askedForIds ? Array.from(new Set(resolvedIds)) : null;
  if (topicIds && topicIds.length === 0) throw new TopicResolutionError(opts.topicNames || []);

  const query = supabase
    .from('questions')
    .select('id, band, answer_group, prompt_text, answer_text, prompt_image_url, answer_image_url, difficulty, question_topics(topic_id)')
    .eq('teacher_id', teacherId)
    .not('answer_text', 'is', null)
    .neq('answer_text', '')
    .order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw error;

  return pickBandedQuestions((data || []) as any[], composition, topicIds);
}


/**
 * Pure selection: topic filtering, banding, answer_group dedup and shortfall counts.
 * Exposed separately so the selection can be exercised against real rows without a session.
 */
export function pickBandedQuestions(
  allRows: any[],
  composition: BandComposition,
  /** `null`/omitted = filtering not requested. A non-null array is always applied, even if empty. */
  topicIds: string[] | null = null,
): BandedSelectionResult {
  if (topicIds && topicIds.length === 0) {
    // "Filter to nothing" is a caller bug, not a licence to use the whole bank.
    throw new TopicResolutionError([]);
  }
  const rows = allRows.filter((r) => {
    if (!topicIds) return true;
    const links: { topic_id: string }[] = r.question_topics || [];
    return links.some((l) => topicIds.includes(l.topic_id));
  });

  const availableByBand = { foundation: 0, core: 0, extension: 0, depth: 0 } as Record<QuestionBand, number>;
  const byBand: Record<QuestionBand, BankedQuestion[]> = {
    foundation: [], core: [], extension: [], depth: [],
  };

  for (const r of rows) {
    const band = (r.band || 'core') as QuestionBand;
    if (!BANDS.includes(band)) continue;
    byBand[band].push({
      id: r.id,
      band,
      answer_group: r.answer_group ?? null,
      prompt_text: r.prompt_text ?? null,
      answer_text: r.answer_text ?? null,
      prompt_image_url: r.prompt_image_url ?? null,
      answer_image_url: r.answer_image_url ?? null,
      difficulty: r.difficulty ?? null,
    });
  }

  // Available count after answer_group dedup, computed per band.
  for (const band of BANDS) {
    const seen = new Set<string>();
    let count = 0;
    for (const q of byBand[band]) {
      if (q.answer_group) {
        if (seen.has(q.answer_group)) continue;
        seen.add(q.answer_group);
      }
      count++;
    }
    availableByBand[band] = count;
  }

  const usedGroups = new Set<string>();
  const items: BankedQuestion[] = [];
  const shortfalls: BandShortfall[] = [];

  for (const band of BANDS) {
    const needed = composition[band];
    if (needed <= 0) continue;
    const picked: BankedQuestion[] = [];
    for (const q of byBand[band]) {
      if (picked.length >= needed) break;
      if (q.answer_group) {
        if (usedGroups.has(q.answer_group)) continue;
        usedGroups.add(q.answer_group);
      }
      picked.push(q);
    }
    if (picked.length < needed) {
      shortfalls.push({ band, available: picked.length, needed });
    }
    items.push(...picked);
  }

  return { items, shortfalls, availableByBand };
}

export function formatShortfallMessage(shortfalls: BandShortfall[]): string {
  const label = (b: QuestionBand) => b.charAt(0).toUpperCase() + b.slice(1);
  return shortfalls
    .map((s) => `${label(s.band)}: ${s.available} available, ${s.needed} needed.`)
    .join(' ');
}

// ===================== Detachable answer strip =====================

export type SetRangeMap = Record<number, [number, number]>;

export const SET_NUMBERS = [1, 2, 3, 4] as const;

/**
 * Derives the four set ranges (1-indexed, inclusive) for a sheet of `total` items.
 *
 * Properties preserved for every count:
 *  - the four ranges are the same length and ascend across the sheet,
 *  - set 1 starts at item 1 and set 4 ends at the last item, so the sheet is spanned,
 *  - the intersection of all four is non-empty (window length >= half the sheet + 1).
 *
 * The 10-item case derives to exactly 1-6 / 2-8 / 4-9 / 5-10.
 */
export function deriveSetRanges(total: number): SetRangeMap {
  const n = Math.max(4, Math.floor(total));
  // 60% window, but never so short that the four sets stop sharing a common item.
  const len = Math.max(Math.round(n * 0.6), Math.floor(n / 2) + 1);
  const span = n - len; // total drift from set 1 to set 4
  const map: SetRangeMap = {} as SetRangeMap;
  SET_NUMBERS.forEach((set, i) => {
    // Starts drift forward, ends drift forward slightly faster, so set 1 begins at
    // item 1, set 4 ends at the last item, and the middle sets straddle the centre.
    const start = 1 + Math.round((i * span) / 3);
    const end = Math.min(n, len + Math.ceil((i * span) / 3));
    map[set] = [start, Math.max(start, end)];
  });
  return map;
}

/** The item range every set contains, or null if the sets share nothing. */
export function setCommonOverlap(ranges: SetRangeMap): [number, number] | null {
  const from = Math.max(...SET_NUMBERS.map((s) => ranges[s][0]));
  const to = Math.min(...SET_NUMBERS.map((s) => ranges[s][1]));
  return from <= to ? [from, to] : null;
}

/** Back-compatible constant: the documented 10-item ranges. */
export const SET_RANGES: SetRangeMap = deriveSetRanges(10);


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


export interface SetCheckValue {
  set: number;
  /** Sum of the numeric answers in the set's range, or null when any answer is non-numeric. */
  total: number | null;
}

/** Rounds away float noise from summing decimal answers. */
function tidy(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Computes the CHECK total for all four sets. Ranges default to the ones derived
 * from the sheet's own item count. A set whose range contains any non-numeric
 * (or missing) answer yields `null`, which prints as a dash.
 */
export function computeSetChecks(
  items: Pick<BankedQuestion, 'answer_text'>[],
  ranges: SetRangeMap = deriveSetRanges(items.length),
): SetCheckValue[] {
  return SET_NUMBERS.map((set) => {
    const [from, to] = ranges[set];
    let total = 0;
    for (let i = from; i <= to; i++) {
      const item = items[i - 1];
      if (!item) return { set, total: null }; // range extends past the sheet
      const n = parseNumericAnswer(item.answer_text);
      if (n === null) return { set, total: null };
      total += n;
    }
    return { set, total: tidy(total) };
  });
}


/** Formats a CHECK total for print. Non-numeric sets print an em dash. */
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
  /** Highest band answered correctly within the student's own range, or null if none. */
  bandReached: QuestionBand | null;
  /** Suggested set for the next cycle. Null when nothing in range was correct. */
  suggestedSet: number | null;
  /** Items inside the student's range that were answered correctly. */
  correctItemNumbers: number[];
  /** Bands the student's range actually contained — a band never seen is never "failed". */
  bandsInRange: QuestionBand[];
}

export const BAND_TO_SET: Record<QuestionBand, number> = {
  foundation: 1,
  core: 2,
  extension: 3,
  depth: 4,
};

/**
 * Computes the highest band answered correctly, considering ONLY the items inside
 * the student's assigned range. `answers` is keyed by 1-indexed item number.
 */
export function computeBandStop(
  items: Pick<BankedQuestion, 'band' | 'answer_text'>[],
  range: [number, number],
  answers: Record<string, string>,
): BandStopResult {
  const [from, to] = range;
  const correctItemNumbers: number[] = [];
  const bandsInRange = new Set<QuestionBand>();
  let highestIdx = -1;

  for (let i = from; i <= to; i++) {
    const item = items[i - 1];
    if (!item) continue;
    const band = (item.band || 'core') as QuestionBand;
    bandsInRange.add(band);
    if (answersMatch(answers[String(i)], item.answer_text)) {
      correctItemNumbers.push(i);
      highestIdx = Math.max(highestIdx, BANDS.indexOf(band));
    }
  }

  const bandReached = highestIdx >= 0 ? BANDS[highestIdx] : null;
  return {
    bandReached,
    suggestedSet: bandReached ? BAND_TO_SET[bandReached] : null,
    correctItemNumbers,
    bandsInRange: BANDS.filter((b) => bandsInRange.has(b)),
  };
}
