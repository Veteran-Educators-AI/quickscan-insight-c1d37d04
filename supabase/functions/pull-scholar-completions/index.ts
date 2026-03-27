import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface GradeRow {
  student_id: string;
  topic_name: string;
  grade: number;
  justification: string;
  created_at: string;
  nys_standard?: string | null;
  raw_score_earned?: number | null;
  raw_score_possible?: number | null;
}

interface SyncLogRow {
  id: string;
  action: string;
  student_id: string | null;
  created_at: string;
  data: Record<string, any> | null;
}

const decodeBase64Url = (value: string): string => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return atob(padded);
};

const deriveSupabaseUrl = (serviceRoleKey: string): string => {
  const payload = JSON.parse(decodeBase64Url(serviceRoleKey.split('.')[1]));
  const ref = payload?.ref;
  if (!ref || typeof ref !== 'string') {
    throw new Error('Invalid Scholar service role key');
  }
  return `https://${ref}.supabase.co`;
};

const isUuid = (value: string | null | undefined) =>
  !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const normalize = (value: string | null | undefined) =>
  (value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const buildNameKey = (firstName: string | null | undefined, lastName: string | null | undefined) =>
  `${normalize(firstName)}|${normalize(lastName)}`;

const toFiniteNumber = (value: unknown): number | null => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const toIsoString = (value: unknown, fallback: string): string => {
  const parsed = new Date(typeof value === 'string' ? value : fallback);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
};

function buildGradeRowsFromSyncLogs(
  syncLogs: SyncLogRow[],
  localById: Map<string, { id: string; class_id: string }>,
): GradeRow[] {
  const rows: GradeRow[] = [];

  for (const log of syncLogs) {
    if (!log.student_id) continue;

    const localStudent = localById.get(log.student_id);
    if (!localStudent) continue;

    const data = (log.data || {}) as Record<string, any>;
    const createdAt = toIsoString(data.completed_at ?? data.timestamp ?? log.created_at, log.created_at);

    if (log.action === 'sync_practice_session' && Array.isArray(data.topic_details) && data.topic_details.length > 0) {
      for (const topicDetail of data.topic_details) {
        const topicScore = toFiniteNumber(topicDetail?.score ?? data.score);
        if (topicScore === null) continue;

        const correct = toFiniteNumber(topicDetail?.correct ?? data.questions_correct);
        const attempted = toFiniteNumber(topicDetail?.attempted ?? data.questions_attempted);
        const topicName = String(topicDetail?.topic || data.topic_name || data.activity_name || 'Scholar Practice');
        const scoreBits = correct !== null && attempted !== null ? ` (${correct}/${attempted} correct)` : '';
        const streakBits = toFiniteNumber(data.max_streak) !== null ? ` | Max streak: ${data.max_streak}` : '';

        rows.push({
          student_id: localStudent.id,
          topic_name: topicName,
          grade: Math.round(topicScore),
          justification: `Scholar practice session: ${topicName}${scoreBits}${streakBits}`,
          created_at: createdAt,
          nys_standard: typeof topicDetail?.standard === 'string' ? topicDetail.standard : null,
          raw_score_earned: correct,
          raw_score_possible: attempted,
        });
      }

      continue;
    }

    const score = toFiniteNumber(data.score);
    if (score === null) continue;

    const correct = toFiniteNumber(data.questions_correct);
    const attempted = toFiniteNumber(data.questions_attempted);
    const topicName = String(data.topic_name || data.activity_name || data.assignment_title || 'Scholar Grade');
    const scoreBits = correct !== null && attempted !== null ? ` (${correct}/${attempted} correct)` : '';
    const actionLabel = log.action.replace(/_/g, ' ');

    rows.push({
      student_id: localStudent.id,
      topic_name: topicName,
      grade: Math.round(score),
      justification: `Scholar ${actionLabel}: ${topicName}${scoreBits}`,
      created_at: createdAt,
      nys_standard: typeof data.standard_code === 'string' ? data.standard_code : null,
      raw_score_earned: correct,
      raw_score_possible: attempted,
    });
  }

  return rows;
}

async function safeQuery(client: any, table: string, select: string, filters?: (q: any) => any, limit = 1000): Promise<any[]> {
  try {
    let q = client.from(table).select(select).limit(limit);
    if (filters) q = filters(q);
    const { data, error } = await q;
    if (error) {
      console.warn(`Scholar table '${table}' query failed: ${error.message}`);
      return [];
    }
    return data || [];
  } catch (error) {
    console.warn(`Scholar table '${table}' threw: ${error}`);
    return [];
  }
}

function jsonResp(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResp({ success: false, error: 'Unauthorized' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return jsonResp({ success: false, error: 'Invalid token' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const { class_id, since_days = 30 } = body;

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - since_days);
    const sinceISO = sinceDate.toISOString();

    let studentsQuery = supabase
      .from('students')
      .select('id, first_name, last_name, email, class_id, classes!inner(id, teacher_id)')
      .eq('classes.teacher_id', user.id);

    if (class_id && class_id !== 'all') {
      studentsQuery = studentsQuery.eq('class_id', class_id);
    }

    const { data: localStudents, error: studentsError } = await studentsQuery;
    if (studentsError) {
      return jsonResp({ success: false, error: studentsError.message }, 500);
    }

    if (!localStudents?.length) {
      return jsonResp({ success: true, grades_imported: 0, message: 'No students found in this class.' });
    }

    const localById = new Map<string, { id: string; class_id: string }>();
    const localByEmail = new Map<string, { id: string; class_id: string }>();
    const localByName = new Map<string, { id: string; class_id: string }>();

    for (const student of localStudents) {
      const entry = { id: student.id, class_id: student.class_id };
      localById.set(student.id, entry);
      const emailKey = normalize(student.email);
      if (emailKey && !localByEmail.has(emailKey)) localByEmail.set(emailKey, entry);
      const nameKey = buildNameKey(student.first_name, student.last_name);
      if (nameKey !== '|' && !localByName.has(nameKey)) localByName.set(nameKey, entry);
    }

    console.log(`Local students: ${localStudents.length}, unique names: ${localByName.size}`);

    const { data: syncLogs, error: syncLogsError } = await supabase
      .from('sister_app_sync_log')
      .select('id, action, student_id, created_at, data')
      .eq('teacher_id', user.id)
      .in('action', ['grade_completed', 'activity_completed', 'sync_practice_session', 'work_submitted'])
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: false })
      .limit(2000);

    if (syncLogsError) {
      console.warn(`Local sync log query failed: ${syncLogsError.message}`);
    }

    const localGradeRows = buildGradeRowsFromSyncLogs((syncLogs || []) as SyncLogRow[], localById);
    console.log(`Local Scholar sync events found: ${syncLogs?.length || 0}, grade rows built: ${localGradeRows.length}`);

    const scholarKey = Deno.env.get('SCHOLAR_SUPABASE_SERVICE_ROLE_KEY');
    let scholarGrades: any[] = [];
    let remoteGradeRows: GradeRow[] = [];
    let matchedById = 0;
    let matchedByEmail = 0;
    let matchedByName = 0;

    if (scholarKey) {
      const scholarUrl = deriveSupabaseUrl(scholarKey);
      const scholar = createClient(scholarUrl, scholarKey);

      scholarGrades = await safeQuery(
        scholar,
        'grade_history',
        'id, student_id, topic_name, grade, grade_justification, created_at',
        (q: any) => q.gte('created_at', sinceISO).order('created_at', { ascending: false }),
        1000,
      );

      console.log(`Scholar grade_history entries found: ${scholarGrades.length}`);

      const scholarStudentIds = [...new Set(scholarGrades.map((grade: any) => grade.student_id).filter((id: string) => isUuid(id)))];
      const scholarStudentMap = new Map<string, { first_name: string; last_name: string; email: string }>();

      for (let i = 0; i < scholarStudentIds.length; i += 50) {
        const batch = scholarStudentIds.slice(i, i + 50);
        const scholarStudents = await safeQuery(
          scholar,
          'students',
          'id, first_name, last_name, email',
          (q: any) => q.in('id', batch),
          100,
        );

        for (const student of scholarStudents) {
          scholarStudentMap.set(student.id, {
            first_name: student.first_name || '',
            last_name: student.last_name || '',
            email: student.email || '',
          });
        }
      }

      console.log(`Scholar students resolved: ${scholarStudentMap.size}`);

      for (const scholarGrade of scholarGrades) {
        if (scholarGrade.grade === null || scholarGrade.grade === undefined) continue;

        let localStudent = localById.get(scholarGrade.student_id) || null;
        if (localStudent) matchedById += 1;

        const scholarStudent = scholarStudentMap.get(scholarGrade.student_id);

        if (!localStudent && scholarStudent?.email) {
          localStudent = localByEmail.get(normalize(scholarStudent.email)) || null;
          if (localStudent) matchedByEmail += 1;
        }

        if (!localStudent && scholarStudent) {
          localStudent = localByName.get(buildNameKey(scholarStudent.first_name, scholarStudent.last_name)) || null;
          if (localStudent) matchedByName += 1;
        }

        if (!localStudent) continue;

        remoteGradeRows.push({
          student_id: localStudent.id,
          topic_name: scholarGrade.topic_name || 'Scholar Grade',
          grade: Math.round(Number(scholarGrade.grade)),
          justification: scholarGrade.grade_justification || `Scholar: ${scholarGrade.topic_name || 'Grade'}`,
          created_at: scholarGrade.created_at,
        });
      }

      console.log(`Remote Scholar grades matched to local students: ${remoteGradeRows.length}`);
      console.log(`Match breakdown — id: ${matchedById}, email: ${matchedByEmail}, name: ${matchedByName}`);
    } else {
      console.warn('SCHOLAR_SUPABASE_SERVICE_ROLE_KEY is missing; pull will rely on local sync logs only.');
    }

    const combinedRows = [...localGradeRows, ...remoteGradeRows];
    const dedupedSourceRows = Array.from(
      new Map(combinedRows.map((grade) => [`${grade.student_id}|${grade.topic_name}|${grade.created_at}|${grade.grade}`, grade])).values(),
    );

    const matchedStudentIds = new Set(dedupedSourceRows.map((row) => row.student_id));

    if (!dedupedSourceRows.length) {
      await logSync(supabase, user.id, {
        source_method: 'scholar_shared_data',
        class_id: class_id || 'all',
        since_date: sinceISO,
        grades_found: 0,
        students_matched: 0,
        grades_imported: 0,
        source_breakdown: {
          sync_log_events: syncLogs?.length || 0,
          sync_log_rows: localGradeRows.length,
          remote_grade_history_records: scholarGrades.length,
          remote_grade_history_rows: remoteGradeRows.length,
        },
      });

      return jsonResp({
        success: true,
        grades_imported: 0,
        grades_created: 0,
        students_matched: 0,
        completions_found: 0,
        duplicates_skipped: 0,
        message: 'No grades found in Scholar for the selected time period.',
      });
    }

    const result = await deduplicateAndInsert(supabase, dedupedSourceRows, user.id, sinceISO);

    await logSync(supabase, user.id, {
      source_method: 'scholar_shared_data',
      class_id: class_id || 'all',
      since_date: sinceISO,
      grades_found: dedupedSourceRows.length,
      students_matched: matchedStudentIds.size,
      grades_imported: result.imported,
      duplicates_skipped: dedupedSourceRows.length - result.imported,
      match_breakdown: {
        id: matchedById,
        email: matchedByEmail,
        name: matchedByName,
      },
      source_breakdown: {
        sync_log_events: syncLogs?.length || 0,
        sync_log_rows: localGradeRows.length,
        remote_grade_history_records: scholarGrades.length,
        remote_grade_history_rows: remoteGradeRows.length,
      },
    });

    return jsonResp({
      success: true,
      grades_imported: result.imported,
      grades_created: result.imported,
      students_matched: matchedStudentIds.size,
      completions_found: dedupedSourceRows.length,
      duplicates_skipped: Math.max(0, dedupedSourceRows.length - result.imported),
      message: result.imported > 0
        ? `Imported ${result.imported} grades from Scholar for ${matchedStudentIds.size} students.`
        : matchedStudentIds.size > 0
          ? 'Scholar grades were found, but they were already imported.'
          : 'Scholar grades were found, but no student IDs, emails, or names matched your class roster.',
    });
  } catch (error) {
    console.error('Error in pull-scholar-completions:', error);
    return jsonResp({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

async function deduplicateAndInsert(
  supabase: any,
  gradeRows: GradeRow[],
  teacherId: string,
  sinceISO: string,
): Promise<{ imported: number }> {
  if (!gradeRows.length) {
    return { imported: 0 };
  }

  const affectedStudentIds = [...new Set(gradeRows.map((grade) => grade.student_id))];
  const { data: existingGrades } = await supabase
    .from('grade_history')
    .select('student_id, topic_name, created_at')
    .in('student_id', affectedStudentIds)
    .gte('created_at', sinceISO);

  const existingExact = new Set(
    (existingGrades || []).map((grade: any) => `${grade.student_id}|${grade.topic_name}|${grade.created_at}`),
  );

  const newGrades = gradeRows.filter((grade) => {
    const exactKey = `${grade.student_id}|${grade.topic_name}|${grade.created_at}`;
    return !existingExact.has(exactKey);
  });

  console.log(`New grades after de-dup: ${newGrades.length} (from ${gradeRows.length})`);

  let imported = 0;
  for (let i = 0; i < newGrades.length; i += 50) {
    const batch = newGrades.slice(i, i + 50).map((grade) => ({
      student_id: grade.student_id,
      teacher_id: teacherId,
      topic_name: grade.topic_name,
      grade: grade.grade,
      created_at: grade.created_at,
      nys_standard: grade.nys_standard || null,
      raw_score_earned: grade.raw_score_earned ?? null,
      raw_score_possible: grade.raw_score_possible ?? null,
      grade_justification: `Scholar (synced) | ${grade.justification}`,
    }));

    const { error } = await supabase.from('grade_history').insert(batch);
    if (error) {
      console.error(`Batch insert error at offset ${i}:`, error.message);
      continue;
    }

    imported += batch.length;
  }

  return { imported };
}

async function logSync(supabase: any, teacherId: string, data: Record<string, any>) {
  try {
    await supabase.from('sister_app_sync_log').insert({
      teacher_id: teacherId,
      action: 'pull_completions',
      data,
      processed: true,
      processed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Non-fatal log error:', error);
  }
}
