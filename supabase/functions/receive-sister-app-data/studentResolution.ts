// =============================================================================
// STUDENT RESOLUTION (shared by every inbound Scholar action)
// =============================================================================
// Resolution order (never fuzzy):
//   1. data.student_email (case-insensitive) against students.email —
//      first inside the class whose join_code = data.class_join_code,
//      otherwise any class belonging to this teacher.
//   2. body.student_id against students.id, then students.student_id.
//   3. Paper scans only (data.submission_type = 'paper_scan' + class_join_code):
//      EXACT case-insensitive trimmed match of data.student_name against
//      "first_name last_name" in that class; if absent, create the student
//      with source = 'paper_scan' and email null.
// Merge: when a later payload carries an email and a distinct email-backed
// student exists in that class, the paper record's work is moved onto the
// email student and the paper row is archived (never deleted).
// =============================================================================

export interface ResolutionOutcome {
  studentId: string | null;
  classId: string | null;
  resolution: 'email' | 'id' | 'student_number' | 'paper_name' | 'paper_created' | 'missing';
  createdStudent: boolean;
  merged: boolean;
  mergedFromStudentId: string | null;
  externalStudentId: string | null;
}

interface StudentRow {
  id: string;
  class_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  student_id: string | null;
  source: string | null;
  archived_at: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const norm = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '';

const fullName = (row: StudentRow): string => norm(`${row.first_name || ''} ${row.last_name || ''}`);

function splitName(raw: string): { first: string; last: string } {
  const parts = raw.trim().replace(/\s+/g, ' ').split(' ');
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

// Tables that carry student-owned work and must follow a merge.
const MERGE_TABLES = [
  'grade_history',
  'attempts',
  'diagnostic_results',
  'student_assignment_submissions',
  'worksheet_submissions',
  'paper_scan_results',
  'analysis_misconceptions',
  'student_activity_feed',
  'student_xp_ledger',
  'student_rewards',
  'assignment_attendance',
  'banded_set_assignments',
  'pending_scans',
] as const;

export async function mergePaperStudent(
  supabaseAdmin: any,
  paperStudentId: string,
  targetStudentId: string
): Promise<boolean> {
  if (paperStudentId === targetStudentId) return false;

  for (const table of MERGE_TABLES) {
    const { error } = await supabaseAdmin
      .from(table)
      .update({ student_id: targetStudentId })
      .eq('student_id', paperStudentId);
    if (error) {
      console.error(`Merge: failed moving ${table} rows`, error.message);
    }
  }

  const { error: archiveError } = await supabaseAdmin
    .from('students')
    .update({
      archived_at: new Date().toISOString(),
      merged_into_student_id: targetStudentId,
      source: 'paper_scan_merged',
    })
    .eq('id', paperStudentId);

  if (archiveError) {
    console.error('Merge: failed archiving paper student', archiveError.message);
    return false;
  }

  return true;
}

export async function resolveStudent(
  supabaseAdmin: any,
  teacherId: string,
  incomingStudentId: string | undefined,
  data: Record<string, any>
): Promise<ResolutionOutcome> {
  const outcome: ResolutionOutcome = {
    studentId: null,
    classId: null,
    resolution: 'missing',
    createdStudent: false,
    merged: false,
    mergedFromStudentId: null,
    externalStudentId: incomingStudentId || null,
  };

  const email = norm(data?.student_email);
  const joinCode = typeof data?.class_join_code === 'string' ? data.class_join_code.trim() : '';
  const studentName = typeof data?.student_name === 'string' ? data.student_name.trim() : '';
  const isPaperScan = norm(data?.submission_type) === 'paper_scan';

  // Teacher's classes
  const { data: classes, error: classError } = await supabaseAdmin
    .from('classes')
    .select('id, join_code')
    .eq('teacher_id', teacherId);

  if (classError) {
    console.error('Resolution: failed loading teacher classes', classError.message);
    return outcome;
  }

  const classRows = (classes || []) as { id: string; join_code: string | null }[];
  const classIds = classRows.map((c) => c.id);
  if (classIds.length === 0) return outcome;

  const targetClass = joinCode
    ? classRows.find((c) => (c.join_code || '').trim().toUpperCase() === joinCode.toUpperCase())
    : undefined;
  const targetClassId = targetClass?.id || null;

  // All (non-archived) students across this teacher's classes
  const { data: studentRows, error: studentError } = await supabaseAdmin
    .from('students')
    .select('id, class_id, first_name, last_name, email, student_id, source, archived_at')
    .in('class_id', classIds);

  if (studentError) {
    console.error('Resolution: failed loading students', studentError.message);
    return outcome;
  }

  const allStudents = ((studentRows || []) as StudentRow[]).filter((s) => !s.archived_at);

  // --- 1. Email match -------------------------------------------------------
  let emailMatch: StudentRow | undefined;
  if (email) {
    const emailCandidates = allStudents.filter((s) => norm(s.email) === email);
    emailMatch =
      (targetClassId ? emailCandidates.find((s) => s.class_id === targetClassId) : undefined) ||
      emailCandidates[0];
  }

  if (emailMatch) {
    outcome.studentId = emailMatch.id;
    outcome.classId = emailMatch.class_id;
    outcome.resolution = 'email';

    // Merge an earlier paper record for the same person in the same class.
    if (studentName) {
      const paperTwin = allStudents.find(
        (s) =>
          s.id !== emailMatch!.id &&
          s.class_id === emailMatch!.class_id &&
          s.source === 'paper_scan' &&
          !s.email &&
          fullName(s) === norm(studentName)
      );
      if (paperTwin) {
        const merged = await mergePaperStudent(supabaseAdmin, paperTwin.id, emailMatch.id);
        outcome.merged = merged;
        outcome.mergedFromStudentId = merged ? paperTwin.id : null;
      }
    }
    return outcome;
  }

  // --- 2. Incoming id match -------------------------------------------------
  if (incomingStudentId) {
    if (UUID_RE.test(incomingStudentId)) {
      const byId = allStudents.find((s) => s.id === incomingStudentId);
      if (byId) {
        outcome.studentId = byId.id;
        outcome.classId = byId.class_id;
        outcome.resolution = 'id';
        return outcome;
      }
    }
    const byNumber = allStudents.find(
      (s) => s.student_id && norm(s.student_id) === norm(incomingStudentId)
    );
    if (byNumber) {
      outcome.studentId = byNumber.id;
      outcome.classId = byNumber.class_id;
      outcome.resolution = 'student_number';
      return outcome;
    }
  }

  // --- 3. Paper scan exact-name match, else create ---------------------------
  if (isPaperScan && targetClassId && studentName) {
    const exact = allStudents.filter(
      (s) => s.class_id === targetClassId && fullName(s) === norm(studentName)
    );

    if (exact.length === 1) {
      outcome.studentId = exact[0].id;
      outcome.classId = targetClassId;
      outcome.resolution = 'paper_name';
      return outcome;
    }

    if (exact.length === 0) {
      const { first, last } = splitName(studentName);
      const { data: created, error: createError } = await supabaseAdmin
        .from('students')
        .insert({
          class_id: targetClassId,
          first_name: first,
          last_name: last,
          email: null,
          source: 'paper_scan',
        })
        .select('id')
        .single();

      if (createError) {
        console.error('Resolution: failed creating paper student', createError.message);
        return outcome;
      }

      outcome.studentId = created.id;
      outcome.classId = targetClassId;
      outcome.resolution = 'paper_created';
      outcome.createdStudent = true;
      return outcome;
    }

    // Ambiguous exact duplicates — never guess.
    console.warn(`Resolution: ${exact.length} students share the name "${studentName}" in class ${targetClassId}`);
  }

  return outcome;
}
