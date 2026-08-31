import { getAllTopics } from '@/data/nysTopics';

/**
 * A NYS/JMAP standard resolved for a question.
 * `code` is taken verbatim from the static NYS topic map — never inferred, never
 * generated. A topic with no entry in the map produces no standard at all.
 */
export interface ResolvedStandard {
  code: string;
  topicName: string;
}

/** Plain-words label used wherever a question has no resolvable standard. */
export const UNTAGGED_LABEL = 'Untagged';

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

let cache: Map<string, ResolvedStandard> | null = null;

/** topic name (normalised) → standard, built once from the static NYS topic map. */
export function standardsByTopicName(): Map<string, ResolvedStandard> {
  if (cache) return cache;
  const map = new Map<string, ResolvedStandard>();
  getAllTopics().forEach(({ topic }) => {
    if (!topic?.name || !topic?.standard) return;
    const key = norm(topic.name);
    if (!map.has(key)) map.set(key, { code: topic.standard, topicName: topic.name });
  });
  cache = map;
  return map;
}

/**
 * Resolves every distinct standard for a question from its linked topic names.
 * A question with no topic link, or whose topics have no entry in the static map,
 * resolves to an empty list — the caller renders "Untagged", never a guessed code.
 */
export function resolveStandards(topicNames: string[] | null | undefined): ResolvedStandard[] {
  if (!topicNames || topicNames.length === 0) return [];
  const map = standardsByTopicName();
  const out: ResolvedStandard[] = [];
  const seen = new Set<string>();
  topicNames.forEach((name) => {
    const hit = map.get(norm(name || ''));
    if (!hit || seen.has(hit.code)) return;
    seen.add(hit.code);
    out.push(hit);
  });
  return out;
}

/** Comma-separated codes for print, or "Untagged" when nothing resolved. */
export function formatStandardCodes(standards: ResolvedStandard[]): string {
  return standards.length === 0 ? UNTAGGED_LABEL : standards.map((s) => s.code).join(', ');
}
