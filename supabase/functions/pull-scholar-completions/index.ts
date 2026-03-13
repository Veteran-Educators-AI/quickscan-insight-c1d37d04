import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const decodeBase64Url = (value: string): string => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return atob(padded);
};

const deriveSupabaseUrlFromServiceKey = (serviceRoleKey: string): string | null => {
  try {
    const parts = serviceRoleKey.split('.');
    if (parts.length < 2) return null;

    const payload = JSON.parse(decodeBase64Url(parts[1]));
    const projectRef = payload?.ref;

    if (typeof projectRef !== 'string' || !projectRef.trim()) return null;
    return `https://${projectRef}.supabase.co`;
  } catch (error) {
    console.error('Failed to derive Scholar URL from service key:', error);
    return null;
  }
};

/**
 * Pull Scholar completions — queries the Scholar (sister) database directly
 * and imports any new grades by matching students on first_name + last_name.
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

    // ── Step 1: Get local students for this teacher ──
    let studentsQuery = supabase
      .from('students')
      .select('id, first_name, last_name, class_id, classes!inner(id, name, teacher_id)')
      .eq('classes.teacher_id', user.id);

    if (class_id && class_id !== 'all') {
      studentsQuery = studentsQuery.eq('class_id', class_id);
    }

    const { data: localStudents, error: studentsError } = await studentsQuery;
    if (studentsError) {
      console.error('Error fetching local students:', studentsError);
      return new Response(
        JSON.stringify({ success: false, error: studentsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!localStudents || localStudents.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No students found', grades_imported: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build name→local student ID map (lowercase for matching)
    // If multiple students share same name across classes, pick any — grade goes to first match
    const nameToLocal = new Map<string, { id: string; class_id: string }>();
    for (const s of localStudents) {
      const key = `${(s.first_name || '').toLowerCase().trim()}|${(s.last_name || '').toLowerCase().trim()}`;
      if (!nameToLocal.has(key)) {
        nameToLocal.set(key, { id: s.id, class_id: s.class_id });
      }
    }

    console.log(`Local students loaded: ${localStudents.length}, unique names: ${nameToLocal.size}`);

    // ── Step 2: Query Scholar database ──
    const configuredScholarUrl = Deno.env.get('SCHOLAR_SUPABASE_URL');
    const scholarKey = Deno.env.get('SCHOLAR_SUPABASE_SERVICE_ROLE_KEY');
    const derivedScholarUrl = scholarKey ? deriveSupabaseUrlFromServiceKey(scholarKey) : null;
    const scholarUrl = derivedScholarUrl || configuredScholarUrl;

    if (configuredScholarUrl && derivedScholarUrl && configuredScholarUrl !== derivedScholarUrl) {
      console.warn(
        `SCHOLAR_SUPABASE_URL mismatch detected. Using URL derived from service key ref instead: ${derivedScholarUrl}`,
      );
    }

    if (!scholarUrl || !scholarKey) {
      // Fallback: just read local scholar grades
      console.log('Scholar DB credentials missing, reading local scholar grades only');
      const { data: localGrades } = await supabase
        .from('grade_history')
        .select('id, student_id, topic_name, grade, grade_justification, raw_score_earned, raw_score_possible, created_at')
        .in('student_id', localStudents.map(s => s.id))
        .gte('created_at', sinceISO)
        .ilike('grade_justification', '%scholar%')
        .order('created_at', { ascending: false });

      return new Response(
        JSON.stringify({
          success: true,
          source: 'local_only',
          grades_found: (localGrades || []).length,
          grades_imported: 0,
          message: 'Scholar DB not configured — showing local data only',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const scholarClient = createClient(scholarUrl, scholarKey);

    // Get Scholar students matching our local student names
    // First get all Scholar students
    const { data: scholarStudents, error: scholarStudentsErr } = await scholarClient
      .from('students')
      .select('id, first_name, last_name')
      .limit(1000);

    if (scholarStudentsErr) {
      console.error('Error fetching Scholar students:', scholarStudentsErr);
      return new Response(
        JSON.stringify({ success: false, error: `Scholar students query failed: ${scholarStudentsErr.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Match Scholar student IDs → local student IDs by name
    const scholarIdToLocalId = new Map<string, string>();
    const matchedNames: string[] = [];
    for (const ss of (scholarStudents || [])) {
      const key = `${(ss.first_name || '').toLowerCase().trim()}|${(ss.last_name || '').toLowerCase().trim()}`;
      const local = nameToLocal.get(key);
      if (local) {
        scholarIdToLocalId.set(ss.id, local.id);
        matchedNames.push(`${ss.first_name} ${ss.last_name}`);
      }
    }

    console.log(`Matched ${scholarIdToLocalId.size} Scholar students to local: ${matchedNames.join(', ')}`);

    if (scholarIdToLocalId.size === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          source: 'scholar_db',
          grades_imported: 0,
          students_matched: 0,
          message: 'No matching students found in Scholar database',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Query Scholar grade_history for matched students
    const scholarStudentIds = Array.from(scholarIdToLocalId.keys());
    const { data: scholarGrades, error: scholarGradesErr } = await scholarClient
      .from('grade_history')
      .select('id, student_id, topic_name, grade, grade_justification, raw_score_earned, raw_score_possible, created_at')
      .in('student_id', scholarStudentIds)
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: false })
      .limit(500);

    if (scholarGradesErr) {
      console.error('Error fetching Scholar grades:', scholarGradesErr);
      return new Response(
        JSON.stringify({ success: false, error: `Scholar grades query failed: ${scholarGradesErr.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Scholar grades found: ${(scholarGrades || []).length}`);

    if (!scholarGrades || scholarGrades.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          source: 'scholar_db',
          grades_imported: 0,
          students_matched: scholarIdToLocalId.size,
          message: 'No recent grades found in Scholar database',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Step 3: De-duplicate against existing local grades ──
    const localStudentIds = Array.from(new Set(
      scholarGrades.map(g => scholarIdToLocalId.get(g.student_id)).filter(Boolean)
    )) as string[];

    const { data: existingGrades } = await supabase
      .from('grade_history')
      .select('student_id, topic_name, created_at')
      .in('student_id', localStudentIds)
      .gte('created_at', sinceISO);

    const existingSet = new Set(
      (existingGrades || []).map(g => `${g.student_id}|${g.topic_name}|${g.created_at}`)
    );

    // Also de-dup by topic_name + grade to avoid near-identical entries
    const existingTopicGrade = new Set(
      (existingGrades || []).map(g => `${g.student_id}|${g.topic_name}`)
    );

    const newGrades = scholarGrades.filter(g => {
      const localId = scholarIdToLocalId.get(g.student_id);
      if (!localId) return false;
      // Exact match de-dup
      const exactKey = `${localId}|${g.topic_name}|${g.created_at}`;
      return !existingSet.has(exactKey);
    });

    console.log(`New grades to import: ${newGrades.length} (filtered from ${scholarGrades.length})`);

    // ── Step 4: Insert new grades ──
    let gradesImported = 0;
    if (newGrades.length > 0) {
      const insertRows = newGrades.map(g => ({
        student_id: scholarIdToLocalId.get(g.student_id)!,
        teacher_id: user.id,
        topic_name: g.topic_name,
        grade: g.grade,
        raw_score_earned: g.raw_score_earned,
        raw_score_possible: g.raw_score_possible,
        grade_justification: `Scholar (synced) | ${g.grade_justification || g.topic_name}`,
      }));

      // Insert in batches of 50
      for (let i = 0; i < insertRows.length; i += 50) {
        const batch = insertRows.slice(i, i + 50);
        const { error: insertError } = await supabase
          .from('grade_history')
          .insert(batch);

        if (insertError) {
          console.error(`Batch insert error at offset ${i}:`, insertError);
        } else {
          gradesImported += batch.length;
        }
      }
    }

    // ── Step 5: Mark pending sync logs as processed ──
    const { data: pendingLogs } = await supabase
      .from('sister_app_sync_log')
      .select('id')
      .eq('teacher_id', user.id)
      .eq('processed', false)
      .in('action', ['grade_completed', 'activity_completed', 'sync_practice_session']);

    if (pendingLogs && pendingLogs.length > 0) {
      await supabase
        .from('sister_app_sync_log')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .in('id', pendingLogs.map(l => l.id));
    }

    // Log this pull
    try {
      await supabase.from('sister_app_sync_log').insert({
        teacher_id: user.id,
        action: 'pull_completions',
        data: {
          source_method: 'scholar_db_cross_project',
          grades_found: scholarGrades.length,
          grades_imported: gradesImported,
          students_matched: scholarIdToLocalId.size,
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
        source: 'scholar_db',
        grades_found: scholarGrades.length,
        grades_imported: gradesImported,
        students_matched: scholarIdToLocalId.size,
        message: gradesImported > 0
          ? `Imported ${gradesImported} new grades from Scholar for ${scholarIdToLocalId.size} students`
          : `No new grades to import (${scholarGrades.length} already synced)`,
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
