// =============================================================================
// RESULTS DIGEST
// =============================================================================
// Turns the paper/practice results Scholar sends us (paper_scan_results rows,
// item_marks jsonb) into a per-assignment teaching picture:
//   - per item: correct / half / wrong / blank counts and a teaching call
//   - error tags ranked by how many students they hit
//   - which papers the teacher should read himself
//   - per student: items, error tags, strengths
// A blank is NEVER merged with a wrong answer: blanks are "not attempted" and
// an item with fewer than 3 attempts is never reported as a class weakness.
// Pure functions only — no queries, no React.
// =============================================================================

export type Mark = 'correct' | 'half' | 'wrong' | 'blank';

export type ItemCall = 'reteach' | 'shaky' | 'secure' | 'unattempted';

export interface ScanRow {
  id: string;
  student_id: string;
  class_id: string | null;
  topic_name: string;
  standard_code: string | null;
  activity_name: string | null;
  score: number | null;
  items_correct: number | null;
  items_attempted: number | null;
  item_marks: any;
  evidence: any;
  strengths: any;
  weak_skill_tags: string[] | null;
  summary: string | null;
  scanned_at: string | null;
  created_at: string;
  raw_payload?: any;
  students?: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null;
}

export interface StudentMark {
  studentId: string;
  name: string;
  mark: Mark;
  verbatim: string | null;
  errorTag: string | null;
}

export interface ItemDigest {
  itemNumber: number;
  skillTag: string | null;
  correct: number;
  half: number;
  wrong: number;
  blank: number;
  attempts: number;
  percentCorrect: number | null;
  call: ItemCall;
  marks: StudentMark[];
  /** distinct wrong/half answers students actually wrote, most common first */
  wrongAnswers: { text: string; count: number }[];
  topErrorTags: string[];
}

export interface TagDigest {
  tag: string;
  studentCount: number;
  studentIds: string[];
  studentNames: string[];
  items: number[];
}

export interface StudentDigest {
  studentId: string;
  name: string;
  isPaperRecord: boolean;
  score: number | null;
  correct: number;
  half: number;
  wrong: number;
  blank: number;
  marks: StudentMark[];
  errorTags: string[];
  strengths: string[];
  summary: string | null;
}

export interface AssignmentDigest {
  worksheetCode: string;
  worksheetTitle: string;
  worksheetDate: string | null;
  standard: string | null;
  papers: number;
  studentCount: number;
  itemCount: number;
  items: ItemDigest[];
  tags: TagDigest[];
  students: StudentDigest[];
  readTheseYourself: { studentId: string; name: string; reason: string }[];
  averageScore: number | null;
}

const asList = (value: any): any[] => (Array.isArray(value) ? value : value ? [value] : []);

const asText = (value: any): string =>
  typeof value === 'string'
    ? value
    : value?.text || value?.note || value?.skill || value?.tag || value?.name || '';

export function normalizeMark(item: any): Mark {
  const raw = String(item?.mark ?? '').trim().toLowerCase();
  if (raw === 'correct' || raw === 'right' || raw === 'full') return 'correct';
  if (raw === 'half' || raw === 'partial' || raw === 'partial_credit') return 'half';
  if (raw === 'wrong' || raw === 'incorrect') return 'wrong';
  if (raw === 'blank' || raw === 'empty' || raw === 'not_attempted' || raw === 'skipped') return 'blank';

  if (item?.isCorrect === true || item?.correct === true) return 'correct';
  if (item?.isCorrect === false || item?.correct === false) return 'wrong';

  const earned = Number(item?.points_earned);
  const possible = Number(item?.points_possible);
  if (Number.isFinite(earned) && Number.isFinite(possible) && possible > 0) {
    if (earned >= possible) return 'correct';
    if (earned <= 0) return 'wrong';
    return 'half';
  }

  const verbatim = String(item?.verbatim ?? item?.answer ?? '').trim();
  if (!verbatim) return 'blank';
  return 'wrong';
}

export function callForItem(attempts: number, percentCorrect: number | null): ItemCall {
  if (attempts < 3 || percentCorrect === null) return 'unattempted';
  if (percentCorrect < 40) return 'reteach';
  if (percentCorrect < 80) return 'shaky';
  return 'secure';
}

export const CALL_LABEL: Record<ItemCall, string> = {
  reteach: 'RETEACH',
  shaky: 'Shaky',
  secure: 'Secure',
  unattempted: 'Mostly unattempted',
};

export function worksheetCodeOf(row: ScanRow): string {
  return (
    row.raw_payload?.worksheet_code ||
    row.raw_payload?.worksheetCode ||
    row.topic_name ||
    'Unlabelled'
  );
}

function worksheetTitleOf(row: ScanRow): string {
  return (
    row.raw_payload?.worksheet_title ||
    row.raw_payload?.worksheetTitle ||
    row.activity_name ||
    row.topic_name ||
    'Assignment'
  );
}

function worksheetDateOf(row: ScanRow): string | null {
  return (
    row.raw_payload?.worksheet_date ||
    row.raw_payload?.completed_at ||
    row.scanned_at ||
    row.created_at ||
    null
  );
}

type NameFn = (studentId: string, first: string, last: string) => string;

function nameOf(row: ScanRow, getDisplayName: NameFn): string {
  if (row.students) {
    return getDisplayName(
      row.students.id,
      row.students.first_name || '',
      row.students.last_name || ''
    );
  }
  return 'Unclaimed paper';
}

/** Build one digest per (worksheet code) from the scan rows of a single class. */
export function buildAssignmentDigests(
  rows: ScanRow[],
  getDisplayName: NameFn
): AssignmentDigest[] {
  const groups = new Map<string, ScanRow[]>();
  for (const row of rows) {
    const code = worksheetCodeOf(row);
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code)!.push(row);
  }

  const digests: AssignmentDigest[] = [];

  for (const [code, groupRows] of groups) {
    const newest = groupRows[0];
    const itemMap = new Map<number, ItemDigest>();
    const tagMap = new Map<string, TagDigest>();
    const students: StudentDigest[] = [];

    for (const row of groupRows) {
      const name = nameOf(row, getDisplayName);
      const items = asList(row.item_marks);
      const studentMarks: StudentMark[] = [];
      const studentTags = new Set<string>();

      items.forEach((item, index) => {
        const itemNumber = Number(item?.item_number ?? item?.questionNumber ?? item?.number ?? index + 1);
        const mark = normalizeMark(item);
        const verbatim = asText(item?.verbatim ?? item?.answer ?? item?.response) || null;
        const errorTag = item?.error_tag ? String(item.error_tag) : null;

        const studentMark: StudentMark = {
          studentId: row.student_id,
          name,
          mark,
          verbatim,
          errorTag,
        };
        studentMarks.push(studentMark);

        if (!itemMap.has(itemNumber)) {
          itemMap.set(itemNumber, {
            itemNumber,
            skillTag: item?.skill_tag ? String(item.skill_tag) : null,
            correct: 0,
            half: 0,
            wrong: 0,
            blank: 0,
            attempts: 0,
            percentCorrect: null,
            call: 'unattempted',
            marks: [],
            wrongAnswers: [],
            topErrorTags: [],
          });
        }
        const bucket = itemMap.get(itemNumber)!;
        if (!bucket.skillTag && item?.skill_tag) bucket.skillTag = String(item.skill_tag);
        bucket[mark] += 1;
        bucket.marks.push(studentMark);

        if (errorTag) studentTags.add(errorTag);

        if (errorTag) {
          if (!tagMap.has(errorTag)) {
            tagMap.set(errorTag, { tag: errorTag, studentCount: 0, studentIds: [], studentNames: [], items: [] });
          }
          const tag = tagMap.get(errorTag)!;
          if (!tag.studentIds.includes(row.student_id)) {
            tag.studentIds.push(row.student_id);
            tag.studentNames.push(name);
          }
          if (!tag.items.includes(itemNumber)) tag.items.push(itemNumber);
        }
      });

      for (const tagName of row.weak_skill_tags || []) {
        if (!tagName) continue;
        studentTags.add(tagName);
        if (!tagMap.has(tagName)) {
          tagMap.set(tagName, { tag: tagName, studentCount: 0, studentIds: [], studentNames: [], items: [] });
        }
        const tag = tagMap.get(tagName)!;
        if (!tag.studentIds.includes(row.student_id)) {
          tag.studentIds.push(row.student_id);
          tag.studentNames.push(name);
        }
      }

      students.push({
        studentId: row.student_id,
        name,
        isPaperRecord: !row.students?.email,
        score: row.score === null || row.score === undefined ? null : Number(row.score),
        correct: studentMarks.filter((m) => m.mark === 'correct').length,
        half: studentMarks.filter((m) => m.mark === 'half').length,
        wrong: studentMarks.filter((m) => m.mark === 'wrong').length,
        blank: studentMarks.filter((m) => m.mark === 'blank').length,
        marks: studentMarks,
        errorTags: Array.from(studentTags),
        strengths: asList(row.strengths).map(asText).filter(Boolean),
        summary: row.summary,
      });
    }

    const items = Array.from(itemMap.values()).sort((a, b) => a.itemNumber - b.itemNumber);
    for (const item of items) {
      item.attempts = item.correct + item.half + item.wrong;
      item.percentCorrect =
        item.attempts > 0 ? Math.round(((item.correct + item.half * 0.5) / item.attempts) * 100) : null;
      item.call = callForItem(item.attempts, item.percentCorrect);

      const wrongCounts = new Map<string, number>();
      const tagCounts = new Map<string, number>();
      for (const mark of item.marks) {
        if (mark.mark === 'wrong' || mark.mark === 'half') {
          const text = (mark.verbatim || '').trim();
          if (text) wrongCounts.set(text, (wrongCounts.get(text) || 0) + 1);
          if (mark.errorTag) tagCounts.set(mark.errorTag, (tagCounts.get(mark.errorTag) || 0) + 1);
        }
      }
      item.wrongAnswers = Array.from(wrongCounts.entries())
        .map(([text, count]) => ({ text, count }))
        .sort((a, b) => b.count - a.count);
      item.topErrorTags = Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([tag]) => tag);
    }

    const tags = Array.from(tagMap.values())
      .map((t) => ({ ...t, studentCount: t.studentIds.length }))
      .sort((a, b) => b.studentCount - a.studentCount || a.tag.localeCompare(b.tag));

    const reteachItems = items.filter((i) => i.call === 'reteach').map((i) => i.itemNumber);
    const readThese = students
      .map((s) => {
        const reasons: string[] = [];
        const failedReteach = s.marks.filter(
          (m, idx) => reteachItems.includes(items[idx]?.itemNumber ?? -1) && m.mark === 'wrong'
        );
        if (s.blank > 0 && s.blank >= s.correct) reasons.push(`${s.blank} item(s) left blank`);
        if (s.score !== null && s.score < 50) reasons.push(`scored ${Math.round(s.score)}%`);
        if (s.half > 0) reasons.push(`${s.half} partly-right answer(s) to judge`);
        if (failedReteach.length > 0) reasons.push('missed the reteach items');
        if (s.isPaperRecord) reasons.push('paper record not yet claimed');
        return { studentId: s.studentId, name: s.name, reason: reasons.join('; ') };
      })
      .filter((s) => !!s.reason);

    const scored = students.map((s) => s.score).filter((v): v is number => v !== null);

    digests.push({
      worksheetCode: code,
      worksheetTitle: worksheetTitleOf(newest),
      worksheetDate: worksheetDateOf(newest),
      standard: newest.standard_code || null,
      papers: groupRows.length,
      studentCount: new Set(groupRows.map((r) => r.student_id)).size,
      itemCount: items.length,
      items,
      tags,
      students: students.sort((a, b) => (a.score ?? 0) - (b.score ?? 0)),
      readTheseYourself: readThese,
      averageScore: scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null,
    });
  }

  return digests.sort((a, b) => (b.worksheetDate || '').localeCompare(a.worksheetDate || ''));
}

/** Compact, name-free shape handed to the lesson generator. */
export function digestForGenerator(digest: AssignmentDigest) {
  return {
    worksheetCode: digest.worksheetCode,
    worksheetTitle: digest.worksheetTitle,
    worksheetDate: digest.worksheetDate,
    standard: digest.standard,
    papers: digest.papers,
    averageScore: digest.averageScore,
    items: digest.items.map((i) => ({
      itemNumber: i.itemNumber,
      skillTag: i.skillTag,
      correct: i.correct,
      half: i.half,
      wrong: i.wrong,
      blank: i.blank,
      attempts: i.attempts,
      percentCorrect: i.percentCorrect,
      call: i.call,
      wrongAnswers: i.wrongAnswers.slice(0, 8),
      errorTags: i.topErrorTags,
    })),
    errorTags: digest.tags.map((t) => ({ tag: t.tag, studentCount: t.studentCount, items: t.items })),
    strengths: Array.from(new Set(digest.students.flatMap((s) => s.strengths))).slice(0, 12),
  };
}
