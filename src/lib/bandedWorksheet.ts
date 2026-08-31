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

/**
 * Selects banked questions per band.
 * De-duplication: at most one question per non-null `answer_group`, applied globally
 * across the whole sheet (a group claimed by one band is unavailable to the others).
 */
export async function selectBandedQuestions(
  teacherId: string,
  composition: BandComposition,
  topicIds?: string[],
): Promise<BandedSelectionResult> {
  let query = supabase
    .from('questions')
    .select('id, band, answer_group, prompt_text, answer_text, prompt_image_url, answer_image_url, difficulty, question_topics(topic_id)')
    .eq('teacher_id', teacherId)
    .not('answer_text', 'is', null)
    .neq('answer_text', '')
    .order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw error;

  const rows = ((data || []) as any[]).filter((r) => {
    if (!topicIds || topicIds.length === 0) return true;
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
