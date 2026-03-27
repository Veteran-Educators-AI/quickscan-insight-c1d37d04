import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return jsonResp({ success: false, error: 'Invalid token' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const { class_id, since_days = 30 } = body;

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - since_days);
    const sinceISO = sinceDate.toISOString();

    // Get local students for this teacher
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
      return jsonResp({ success: true, grades_imported: 0, grades_created: 0, message: 'No students found in this class.' });
    }

    const studentIds = localStudents.map((s: any) => s.id);

    // Since this is a SHARED DATABASE, Scholar grades are already in grade_history.
    // Just query them directly — look for Scholar-sourced grades.
    const { data: scholarGrades, error: gradesError } = await supabase
      .from('grade_history')
      .select('id, student_id, topic_name, grade, grade_justification, created_at, nys_standard, raw_score_earned, raw_score_possible')
      .in('student_id', studentIds)
      .gte('created_at', sinceISO)
      .like('grade_justification', '%Scholar%')
      .order('created_at', { ascending: false })
      .limit(2000);

    if (gradesError) {
      return jsonResp({ success: false, error: gradesError.message }, 500);
    }

    // Also check sync logs for any unprocessed practice sessions with actual data
    const { data: syncLogs } = await supabase
      .from('sister_app_sync_log')
      .select('id, action, student_id, created_at, data')
      .eq('teacher_id', user.id)
      .in('action', ['grade_completed', 'activity_completed', 'sync_practice_session'])
      .gte('created_at', sinceISO)
      .eq('processed', false)
      .order('created_at', { ascending: false })
      .limit(500);

    // Process any unprocessed sync logs that have actual grade data
    const studentIdSet = new Set(studentIds);
    let newGradesImported = 0;
    const processedLogIds: string[] = [];

    for (const log of (syncLogs || [])) {
      if (!log.student_id || !studentIdSet.has(log.student_id)) continue;
      const data = (log.data || {}) as Record<string, any>;
      const score = typeof data.score === 'number' ? data.score : Number(data.score);
      if (!Number.isFinite(score)) continue;

      const topicName = String(data.topic_name || data.activity_name || 'Scholar Practice');
      const createdAt = data.completed_at || data.timestamp || log.created_at;

      // Check if this grade already exists
      const { data: existing } = await supabase
        .from('grade_history')
        .select('id')
        .eq('student_id', log.student_id)
        .eq('topic_name', topicName)
        .eq('created_at', createdAt)
        .limit(1);

      if (existing && existing.length > 0) {
        processedLogIds.push(log.id);
        continue;
      }

      const { error: insertError } = await supabase.from('grade_history').insert({
        student_id: log.student_id,
        teacher_id: user.id,
        topic_name: topicName,
        grade: Math.round(score),
        grade_justification: `Scholar (synced) | ${topicName} | ${Math.round(score)}%`,
        created_at: createdAt,
        nys_standard: data.standard_code || null,
        raw_score_earned: typeof data.questions_correct === 'number' ? data.questions_correct : null,
        raw_score_possible: typeof data.questions_attempted === 'number' ? data.questions_attempted : null,
      });

      if (!insertError) {
        newGradesImported++;
      }
      processedLogIds.push(log.id);
    }

    // Mark processed logs
    if (processedLogIds.length > 0) {
      await supabase
        .from('sister_app_sync_log')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .in('id', processedLogIds);
    }

    const totalScholarGrades = (scholarGrades?.length || 0) + newGradesImported;
    const matchedStudents = new Set([
      ...(scholarGrades || []).map((g: any) => g.student_id),
      ...(syncLogs || []).filter((l: any) => studentIdSet.has(l.student_id)).map((l: any) => l.student_id),
    ]);

    // Log the pull
    await supabase.from('sister_app_sync_log').insert({
      teacher_id: user.id,
      action: 'pull_completions',
      data: {
        source_method: 'shared_database',
        class_id: class_id || 'all',
        since_date: sinceISO,
        grades_found: totalScholarGrades,
        students_matched: matchedStudents.size,
        grades_created: newGradesImported,
        existing_scholar_grades: scholarGrades?.length || 0,
        unprocessed_logs_checked: syncLogs?.length || 0,
      },
      processed: true,
      processed_at: new Date().toISOString(),
    });

    return jsonResp({
      success: true,
      grades_found: totalScholarGrades,
      grades_created: newGradesImported,
      grades_imported: newGradesImported,
      students_matched: matchedStudents.size,
      completions_found: totalScholarGrades,
      duplicates_skipped: (syncLogs?.length || 0) - newGradesImported,
      message: totalScholarGrades > 0
        ? `Found ${totalScholarGrades} Scholar grades for ${matchedStudents.size} students.${newGradesImported > 0 ? ` Imported ${newGradesImported} new grades.` : ' All grades already in gradebook.'}`
        : 'No Scholar grades found for the selected time period.',
    });
  } catch (error) {
    console.error('Error in pull-scholar-completions:', error);
    return jsonResp({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});
