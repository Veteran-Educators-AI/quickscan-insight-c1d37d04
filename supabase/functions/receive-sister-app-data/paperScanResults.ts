// =============================================================================
// PAPER SCAN RESULTS
// =============================================================================
// Saves a Scholar paper-scan result: one grade_history row (so it shows up in
// every existing grade view) plus the full item-level detail in
// paper_scan_results (item marks, evidence, strengths, weak skill tags).
// Idempotent on data.source_ref (the Scholar worksheet_result id): a repeat
// send updates the same rows instead of creating duplicates.
// =============================================================================

export interface PaperScanSaveOutcome {
  gradeSaved: boolean;
  updated: boolean;
  resultId: string | null;
  gradeHistoryId: string | null;
  error?: string;
}

const asArray = (value: unknown): any[] => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return [value];
  return [];
};

const asStringArray = (value: unknown): string[] =>
  asArray(value)
    .map((v) => (typeof v === 'string' ? v : v?.tag || v?.skill || v?.name || ''))
    .filter((v: string) => !!v);

export function buildJustification(data: Record<string, any>): string {
  const correct = data.items_correct ?? data.questions_correct;
  const attempted = data.items_attempted ?? data.questions_attempted;
  const weak = asStringArray(data.weak_skill_tags ?? data.weak_skills);
  const parts: string[] = [];
  parts.push(`Scholar paper scan: ${data.activity_name || data.topic_name || 'Worksheet'}`);
  if (correct !== undefined && attempted !== undefined) {
    parts.push(`${correct ?? 0}/${attempted ?? 0} items correct`);
  }
  if (weak.length > 0) parts.push(`Weak skills: ${weak.slice(0, 6).join(', ')}`);
  if (data.summary) parts.push(String(data.summary).slice(0, 300));
  return parts.join(' — ');
}

/**
 * Source reference used for idempotency. Checked in order:
 * data.source_ref -> bodySourceRef (top-level body.source_ref) -> data.worksheet_result_id -> data.session_id
 */
export function resolveSourceRef(
  data: Record<string, any>,
  bodySourceRef?: unknown
): string | null {
  const candidates = [
    data?.source_ref,
    bodySourceRef,
    data?.worksheet_result_id,
    data?.worksheetResultId,
    data?.session_id,
    data?.sessionId,
  ];
  for (const c of candidates) {
    if (c === null || c === undefined) continue;
    const s = String(c).trim();
    if (s) return s;
  }
  return null;
}

/** Event timestamp from the payload, falling back to now. */
export function resolveEventTimestamp(data: Record<string, any>): string {
  const raw = data?.completed_at || data?.scanned_at || data?.timestamp;
  if (raw) {
    const d = new Date(String(raw));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

export async function savePaperScanResult(
  supabaseAdmin: any,
  teacherId: string,
  studentId: string,
  classId: string | null,
  data: Record<string, any>,
  bodySourceRef?: unknown
): Promise<PaperScanSaveOutcome> {
  const outcome: PaperScanSaveOutcome = {
    gradeSaved: false,
    updated: false,
    resultId: null,
    gradeHistoryId: null,
  };

  const sourceRef: string | null = resolveSourceRef(data, bodySourceRef);
  const eventAt = resolveEventTimestamp(data);
  const topicName: string =
    data.topic_name || data.activity_name || data.assignment_title || 'Scholar Paper Scan';
  const score = data.score === null || data.score === undefined ? null : Number(data.score);
  const itemsCorrect = data.items_correct ?? data.questions_correct ?? null;
  const itemsAttempted = data.items_attempted ?? data.questions_attempted ?? null;
  const justification = buildJustification(data);


  // Existing result for this source_ref?
  let existing: { id: string; grade_history_id: string | null } | null = null;
  if (sourceRef) {
    const { data: found } = await supabaseAdmin
      .from('paper_scan_results')
      .select('id, grade_history_id')
      .eq('teacher_id', teacherId)
      .eq('source_ref', sourceRef)
      .maybeSingle();
    existing = found || null;
  }

  // ---- grade_history ---------------------------------------------------------
  let gradeHistoryId: string | null = existing?.grade_history_id || null;
  if (score !== null && !Number.isNaN(score)) {
    const gradeRow = {
      student_id: studentId,
      teacher_id: teacherId,
      topic_name: topicName,
      grade: Math.round(score),
      nys_standard: data.standard_code || null,
      raw_score_earned: itemsCorrect,
      raw_score_possible: itemsAttempted,
      grade_justification: justification,
    };

    if (gradeHistoryId) {
      const { error } = await supabaseAdmin
        .from('grade_history')
        .update(gradeRow)
        .eq('id', gradeHistoryId);
      if (error) {
        console.error('Paper scan: grade update failed', error.message);
        outcome.error = error.message;
      } else {
        outcome.gradeSaved = true;
      }
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from('grade_history')
        .insert(gradeRow)
        .select('id')
        .single();
      if (error) {
        console.error('Paper scan: grade insert failed', error.message);
        outcome.error = error.message;
      } else {
        gradeHistoryId = inserted.id;
        outcome.gradeSaved = true;
      }
    }
  }

  outcome.gradeHistoryId = gradeHistoryId;

  // ---- paper_scan_results ----------------------------------------------------
  const resultRow = {
    teacher_id: teacherId,
    student_id: studentId,
    class_id: classId,
    source_ref: sourceRef,
    submission_type: data.submission_type || 'paper_scan',
    topic_name: topicName,
    standard_code: data.standard_code || null,
    activity_name: data.activity_name || data.assignment_title || null,
    score: score,
    items_correct: itemsCorrect,
    items_attempted: itemsAttempted,
    item_marks: asArray(data.item_marks ?? data.items ?? data.answers),
    evidence: asArray(data.evidence),
    strengths: asArray(data.strengths),
    weak_skill_tags: asStringArray(data.weak_skill_tags ?? data.weak_skills),
    summary: data.summary || justification,
    grade_history_id: gradeHistoryId,
    raw_payload: data,
    scanned_at: data.completed_at || data.scanned_at || new Date().toISOString(),
  };

  if (existing) {
    const { error } = await supabaseAdmin
      .from('paper_scan_results')
      .update({ ...resultRow, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) {
      console.error('Paper scan: detail update failed', error.message);
      outcome.error = outcome.error || error.message;
    } else {
      outcome.resultId = existing.id;
      outcome.updated = true;
    }
  } else {
    const { data: inserted, error } = await supabaseAdmin
      .from('paper_scan_results')
      .insert(resultRow)
      .select('id')
      .single();
    if (error) {
      console.error('Paper scan: detail insert failed', error.message);
      outcome.error = outcome.error || error.message;
    } else {
      outcome.resultId = inserted.id;
    }
  }

  return outcome;
}
