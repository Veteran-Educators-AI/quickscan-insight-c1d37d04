/**
 * Blank page detection utility.
 *
 * Normalizes extracted OCR text by stripping whitespace, common
 * headers/footers, worksheet boilerplate, printed question text,
 * and short isolated fragments (likely printed labels or student names).
 * If the remaining meaningful content is fewer than `threshold`
 * characters the page is considered blank.
 */

/** Patterns that are considered boilerplate / not student work */
const BOILERPLATE_PATTERNS = [
  // Student info headers (with or without line-start anchor)
  /^name\s*[:.]?\s*/gim,
  /^date\s*[:.]?\s*/gim,
  /^period\s*[:.]?\s*/gim,
  /^class\s*[:.]?\s*/gim,
  /^student\s*[:.]?\s*/gim,
  /^teacher\s*[:.]?\s*/gim,
  /^grade\s*[:.]?\s*/gim,
  /^score\s*[:.]?\s*/gim,
  // Page/section markers
  /^page\s*\d*/gim,
  /^side\s*[ab]/gim,
  /^#?\s*\d+\s*$/gm,
  // Question labels
  /^question\s*\d*\s*[:.]?\s*$/gim,
  /^q\d+\s*[:.]?\s*$/gim,
  /^problem\s*\d*\s*[:.]?\s*$/gim,
  // Instructions / boilerplate
  /^directions?\s*[:.]?\s*/gim,
  /^instructions?\s*[:.]?\s*/gim,
  /^show\s+your\s+work/gim,
  /^answer\s*[:.]?\s*$/gim,
  /^work\s*[:.]?\s*$/gim,
  /^\s*[-–—_]{3,}\s*$/gm,
  // Worksheet metadata
  /level\s*[a-z]\s*[|,]?/gim,
  /form\s*[a-z]\s*[|,]?/gim,
  /diagnostic\s*worksheet/gim,
  /diagnostic/gim,
  /worksheet/gim,
  /generated\s+by\s+.*/gim,
  /nyclogic\.?\s*ai/gim,
  /warm[\s-]?up/gim,
  /practice/gim,
  /work\s*area/gim,
  // Common printed question/instruction lines (not student work) — line-anchored
  /^(solve|find|calculate|determine|simplify|evaluate|explain|describe|compare|identify)\b.*$/gim,
  /^.*\bbefore\s+adding\b.*$/gim,
  /^.*\badding\s+them\s+together\b.*$/gim,
  /^.*\btotal\s+(fees?|charge|balance|interest|payment)\b.*$/gim,
  // QR code JSON artifacts
  /\{[^}]*"[svqpt]"\s*:/gim,
  /\{[^}]*\}/gm,  // Any JSON-like braces
  // Standalone pipe/separator characters
  /[|]+/g,
];

/**
 * Additional line-level filter: after pattern removal, strip any remaining lines
 * that look like a student/person name (2-4 capitalized words, no math symbols).
 * Real student work has math expressions, sentences, or explanations.
 */
function stripNameLikeLines(text: string): string {
  return text
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      // A "name-like" line: 1-4 words, each starting with uppercase, no digits or math symbols
      if (/^([A-Z][a-z]+\s*){1,4}$/.test(trimmed) && !/[0-9+\-=×÷\/*()]/.test(trimmed)) {
        return false; // Likely a student name — strip it
      }
      return true;
    })
    .join('\n');
}

export interface BlankPageResult {
  isBlank: boolean;
  /** Length of text after normalization */
  normalizedLength: number;
  /** Why the page was flagged */
  detectionReason: 'TEXT_LENGTH' | 'NOT_BLANK';
  /** The cleaned text (useful for debugging) */
  normalizedText: string;
}

/**
 * Detect whether extracted text represents a blank / no-response page.
 *
 * @param rawText  – The OCR-extracted text for a single page.
 * @param threshold – Minimum meaningful character count (default 20).
 */
export function detectBlankPage(rawText: string | null | undefined, threshold = 20): BlankPageResult {
  if (!rawText) {
    return { isBlank: true, normalizedLength: 0, detectionReason: 'TEXT_LENGTH', normalizedText: '' };
  }

  let text = rawText;

  // Phase 1: Strip each boilerplate pattern
  for (const pattern of BOILERPLATE_PATTERNS) {
    pattern.lastIndex = 0;
    text = text.replace(pattern, '');
  }

  // Phase 2: Strip lines that look like student names
  text = stripNameLikeLines(text);

  // Phase 3: Collapse all whitespace and trim
  text = text.replace(/\s+/g, ' ').trim();

  const isBlank = text.length < threshold;

  return {
    isBlank,
    normalizedLength: text.length,
    detectionReason: isBlank ? 'TEXT_LENGTH' : 'NOT_BLANK',
    normalizedText: text,
  };
}
