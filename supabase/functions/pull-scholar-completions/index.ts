import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Pull Scholar completions — simplified for shared database.
 * Scholar now writes directly to grade_history, so we just query locally.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { class_id, since_days = 30 } = body;

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - since_days);
    const sinceISO = sinceDate.toISOString();

    // Query grade_history directly — Scholar writes here now
    let query = supabase
      .from('grade_history')
      .select(`
        id, student_id, topic_name, grade, grade_justification,
        raw_score_earned, raw_score_possible, created_at,
        students!inner(id, first_name, last_name, class_id, classes!inner(id, name, teacher_id))
      `)
      .eq('students.classes.teacher_id', user.id)
      .gte('created_at', sinceISO)
      .ilike('grade_justification', '%scholar%')
      .order('created_at', { ascending: false });

    if (class_id) {
      query = query.eq('students.class_id', class_id);
    }

    const { data: scholarGrades, error: gradesError } = await query;

    if (gradesError) {
      console.error('Error querying scholar grades:', gradesError);
      return new Response(
        JSON.stringify({ success: false, error: gradesError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const grades = scholarGrades || [];
    const uniqueStudents = new Set(grades.map(g => g.student_id));

    // Also check for any unprocessed sync log entries and mark them processed
    const { data: pendingLogs } = await supabase
      .from('sister_app_sync_log')
      .select('id')
      .eq('teacher_id', user.id)
      .eq('processed', false)
      .in('action', ['grade_completed', 'activity_completed']);

    if (pendingLogs && pendingLogs.length > 0) {
      const logIds = pendingLogs.map(l => l.id);
      await supabase
        .from('sister_app_sync_log')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .in('id', logIds);
    }

    // Log this pull
    try {
      await supabase.from('sister_app_sync_log').insert({
        teacher_id: user.id,
        action: 'pull_completions',
        data: {
          source_method: 'shared_database',
          grades_found: grades.length,
          students_matched: uniqueStudents.size,
          since_date: sinceISO,
          class_id: class_id || 'all',
        },
        processed: true,
        processed_at: new Date().toISOString(),
      });
    } catch (logErr) {
      console.error('Non-fatal log error:', logErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        source: 'shared_database',
        grades_found: grades.length,
        students_matched: uniqueStudents.size,
        grades: grades.map(g => ({
          id: g.id,
          student_id: g.student_id,
          student_name: `${(g.students as any)?.first_name || ''} ${(g.students as any)?.last_name || ''}`.trim(),
          topic_name: g.topic_name,
          grade: g.grade,
          raw_score_earned: g.raw_score_earned,
          raw_score_possible: g.raw_score_possible,
          created_at: g.created_at,
        })),
        message: grades.length > 0
          ? `Found ${grades.length} Scholar grades for ${uniqueStudents.size} students`
          : 'No recent Scholar grades found',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in pull-scholar-completions:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
