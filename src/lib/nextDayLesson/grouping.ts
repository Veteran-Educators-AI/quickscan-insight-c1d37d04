// =============================================================================
// DIFFERENTIATED GROUPING
// =============================================================================
// One pooled worksheet of 14 items; every student works 8 of them.
// The repair items (the ones the class failed) go to the students who need them.
// Nothing here produces a label that reveals which set is the easier one — the
// board deck only ever shows a neutral "Group 1 / 2 / 3" plus item numbers.
// =============================================================================

import type { AssignmentDigest, StudentDigest } from '@/lib/resultsDigest';
import type { GroupingPlan, StudentGroup, WorksheetItemDraft } from './types';

const ITEMS_PER_STUDENT = 8;

function scoreOf(student: StudentDigest): number {
  if (student.score !== null) return student.score;
  const total = student.correct + student.half + student.wrong + student.blank;
  if (total === 0) return 0;
  return ((student.correct + student.half * 0.5) / total) * 100;
}

function evidenceLine(student: StudentDigest): string {
  if (student.summary) return student.summary;
  const wrong = student.marks.filter((m) => m.mark === 'wrong' && m.verbatim);
  if (wrong.length > 0) {
    return `wrote "${wrong[0].verbatim}" on item ${student.marks.indexOf(wrong[0]) + 1}`;
  }
  if (student.blank > 0) return `left ${student.blank} item(s) blank`;
  if (student.errorTags.length > 0) return `error tag: ${student.errorTags.join(', ')}`;
  if (student.strengths.length > 0) return `secure on: ${student.strengths[0]}`;
  return `${student.correct} of ${student.correct + student.half + student.wrong + student.blank} items correct`;
}

function pick(pool: number[], count: number, offset: number): number[] {
  if (pool.length === 0) return [];
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(pool[(offset + i) % pool.length]);
  }
  return Array.from(new Set(out));
}

/** Choose the item numbers for each of the three groups from the pooled sheet. */
function itemSets(items: WorksheetItemDraft[]): number[][] {
  const repair = items.filter((i) => i.isRepair).map((i) => i.itemNumber);
  const rest = items.filter((i) => !i.isRepair).map((i) => i.itemNumber);
  const all = items.map((i) => i.itemNumber);

  const heaviestRepair = repair.length ? repair : all.slice(0, ITEMS_PER_STUDENT);
  // Group 1: mostly repair items. Group 2: a mix. Group 3: least repair, most new work.
  const setOne = Array.from(
    new Set([...pick(heaviestRepair, Math.min(5, ITEMS_PER_STUDENT), 0), ...pick(rest, ITEMS_PER_STUDENT, 0)])
  ).slice(0, ITEMS_PER_STUDENT);
  const setTwo = Array.from(
    new Set([...pick(heaviestRepair, 3, 1), ...pick(rest, ITEMS_PER_STUDENT, 2)])
  ).slice(0, ITEMS_PER_STUDENT);
  const setThree = Array.from(
    new Set([...pick(heaviestRepair, 1, 2), ...pick(rest.slice().reverse(), ITEMS_PER_STUDENT, 0)])
  ).slice(0, ITEMS_PER_STUDENT);

  const fill = (set: number[]) => {
    const out = set.slice();
    for (const n of all) {
      if (out.length >= ITEMS_PER_STUDENT) break;
      if (!out.includes(n)) out.push(n);
    }
    return out.sort((a, b) => a - b);
  };

  return [fill(setOne), fill(setTwo), fill(setThree)];
}

export function checkTotalFor(items: WorksheetItemDraft[], itemNumbers: number[]): number {
  const sum = itemNumbers.reduce((total, n) => {
    const item = items.find((i) => i.itemNumber === n);
    return total + (typeof item?.answerNumeric === 'number' ? item.answerNumeric : 0);
  }, 0);
  return Math.round(sum * 1000) / 1000;
}

export function buildGrouping(
  digest: AssignmentDigest,
  items: WorksheetItemDraft[],
  rosterStudents: { id: string; name: string }[]
): GroupingPlan {
  const [setOne, setTwo, setThree] = itemSets(items);
  const sets = [setOne, setTwo, setThree];

  const ranked = digest.students.slice().sort((a, b) => scoreOf(a) - scoreOf(b));
  const groups: StudentGroup[] = sets.map((itemNumbers, index) => ({
    id: `set-${index + 1}`,
    label: `Group ${index + 1}`,
    itemNumbers,
    checkTotal: checkTotalFor(items, itemNumbers),
    students: [],
  }));

  // Lowest scores get the repair-heavy set. Thirds, remainder to the lower sets.
  const perGroup = Math.ceil(ranked.length / 3) || 1;
  ranked.forEach((student, index) => {
    const groupIndex = Math.min(2, Math.floor(index / perGroup));
    groups[groupIndex].students.push({
      studentId: student.studentId,
      name: student.name,
      evidence: evidenceLine(student),
      score: student.score,
    });
  });

  const withResults = new Set(digest.students.map((s) => s.studentId));
  const noResultsYet = rosterStudents
    .filter((s) => !withResults.has(s.id))
    .map((s) => ({ studentId: s.id, name: s.name }));

  return { groups, noResultsYet, itemsPerStudent: ITEMS_PER_STUDENT };
}
