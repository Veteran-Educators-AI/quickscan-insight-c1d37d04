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

const deriveSupabaseUrl = (serviceRoleKey: string): string | null => {
  try {
    const payload = JSON.parse(decodeBase64Url(serviceRoleKey.split('.')[1]));
    const ref = payload?.ref;
    return typeof ref === 'string' && ref.trim() ? `https://${ref}.supabase.co` : null;
  } catch { return null; }
};

/**
 * Pull Scholar completions — queries the Scholar database's ACTUAL tables
 * (practice_sets, attempts, external_students, student_profiles)
 * and imports grades by matching students on first_name + last_name.
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

    // Build name→local student map
    const nameToLocal = new Map<string, { id: string; class_id: string }>();
    for (const s of localStudents) {
      const key = `${(s.first_name || '').toLowerCase().trim()}|${(s.last_name || '').toLowerCase().trim()}`;
      if (!nameToLocal.has(key)) {
        nameToLocal.set(key, { id: s.id, class_id: s.class_id });
      }
    }

    console.log(`Local students: ${localStudents.length}, unique names: ${nameToLocal.size}`);

    // ── Step 2: Connect to Scholar database ──
    const scholarKey = Deno.env.get('SCHOLAR_SUPABASE_SERVICE_ROLE_KEY');
    const scholarUrl = scholarKey ? deriveSupabaseUrl(scholarKey) : Deno.env.get('SCHOLAR_SUPABASE_URL');

    if (!scholarUrl || !scholarKey) {
      return new Response(
        JSON.stringify({ success: true, source: 'local_only', grades_imported: 0, message: 'Scholar DB not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const scholar = createClient(scholarUrl, scholarKey);

    // ── Step 3: Try Scholar external_students (may not exist in remote DB) ──
    let extStudents: any[] = [];
    try {
      const { data, error: extErr } = await scholar
        .from('external_students')
        .select('id, external_id, first_name, last_name, full_name, linked_user_id, email')
        .limit(1000);

      if (extErr) {
        console.warn('Scholar external_students not available (table may not exist), skipping:', extErr.message);
      } else {
        extStudents = data || [];
      }
    } catch (e) {
      console.warn('Scholar external_students fetch threw, skipping:', e);
    }

    console.log(`Scholar external_students: ${extStudents.length}`);

    // Match external_students → local students by name, collecting linked_user_ids
    const scholarUserToLocal = new Map<string, string>(); // Scholar user_id → local student_id
    const scholarExtIdToLocal = new Map<string, string>(); // Scholar external_id → local student_id
    const matchedNames: string[] = [];

    for (const es of (extStudents || [])) {
      // Try first_name + last_name match
      let key = `${(es.first_name || '').toLowerCase().trim()}|${(es.last_name || '').toLowerCase().trim()}`;
      let local = nameToLocal.get(key);

      // Fallback: parse full_name
      if (!local && es.full_name) {
        const parts = es.full_name.trim().split(/\s+/);
        if (parts.length >= 2) {
          key = `${parts[0].toLowerCase()}|${parts.slice(1).join(' ').toLowerCase()}`;
          local = nameToLocal.get(key);
        }
      }

      if (local) {
        if (es.linked_user_id) {
          scholarUserToLocal.set(es.linked_user_id, local.id);
        }
        if (es.external_id) {
          scholarExtIdToLocal.set(es.external_id, local.id);
        }
        matchedNames.push(es.full_name || `${es.first_name} ${es.last_name}`);
      }
    }

    console.log(`Matched ${matchedNames.length} Scholar students: ${matchedNames.slice(0, 20).join(', ')}${matchedNames.length > 20 ? '...' : ''}`);

    // ── Step 4: Get Scholar student_profiles for linked users ──
    const linkedUserIds = Array.from(scholarUserToLocal.keys());
    const scholarProfileToLocal = new Map<string, string>(); // Scholar student_profiles.id → local student_id

    if (linkedUserIds.length > 0) {
      // Batch in groups of 50
      for (let i = 0; i < linkedUserIds.length; i += 50) {
        const batch = linkedUserIds.slice(i, i + 50);
        const { data: profiles, error: profErr } = await scholar
          .from('student_profiles')
          .select('id, user_id')
          .in('user_id', batch);

        if (profErr) {
          console.error('Error fetching Scholar student_profiles:', profErr);
        } else {
          for (const p of (profiles || [])) {
            const localId = scholarUserToLocal.get(p.user_id);
            if (localId) {
              scholarProfileToLocal.set(p.id, localId);
            }
          }
        }
      }
    }

    console.log(`Scholar student_profiles mapped: ${scholarProfileToLocal.size}`);

    if (scholarProfileToLocal.size === 0 && scholarExtIdToLocal.size === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          source: 'scholar_db',
          grades_imported: 0,
          students_matched: matchedNames.length,
          profiles_linked: 0,
          message: 'Matched students by name but none have linked Scholar profiles yet',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Step 5: Pull practice_sets (completed) from Scholar ──
    const scholarProfileIds = Array.from(scholarProfileToLocal.keys());
    let allPracticeSets: any[] = [];

    for (let i = 0; i < scholarProfileIds.length; i += 50) {
      const batch = scholarProfileIds.slice(i, i + 50);
      const { data: sets, error: setsErr } = await scholar
        .from('practice_sets')
        .select('id, student_id, title, score, completed_at, skill_tags, status')
        .in('student_id', batch)
        .eq('status', 'completed')
        .gte('completed_at', sinceISO)
        .order('completed_at', { ascending: false })
        .limit(200);

      if (setsErr) {
        console.error('Error fetching practice_sets batch:', setsErr);
      } else {
        allPracticeSets = allPracticeSets.concat(sets || []);
      }
    }

    console.log(`Scholar practice_sets found: ${allPracticeSets.length}`);

    // ── Step 6: Pull attempts (submitted/graded) from Scholar ──
    let allAttempts: any[] = [];

    for (let i = 0; i < scholarProfileIds.length; i += 50) {
      const batch = scholarProfileIds.slice(i, i + 50);
      const { data: atts, error: attsErr } = await scholar
        .from('attempts')
        .select('id, student_id, assignment_id, score, submitted_at, status, mode')
        .in('student_id', batch)
        .in('status', ['submitted', 'graded', 'verified'])
        .not('score', 'is', null)
        .gte('submitted_at', sinceISO)
        .order('submitted_at', { ascending: false })
        .limit(200);

      if (attsErr) {
        console.error('Error fetching attempts batch:', attsErr);
      } else {
        allAttempts = allAttempts.concat(atts || []);
      }
    }

    console.log(`Scholar attempts found: ${allAttempts.length}`);

    // Get assignment titles for attempts
    const assignmentIds = [...new Set(allAttempts.map(a => a.assignment_id).filter(Boolean))];
    const assignmentTitles = new Map<string, string>();

    if (assignmentIds.length > 0) {
      for (let i = 0; i < assignmentIds.length; i += 50) {
        const batch = assignmentIds.slice(i, i + 50);
        const { data: assignments } = await scholar
          .from('assignments')
          .select('id, title, subject')
          .in('id', batch);

        for (const a of (assignments || [])) {
          assignmentTitles.set(a.id, a.title || a.subject || 'Scholar Assignment');
        }
      }
    }

    // ── Step 7: Build grade rows to import ──
    const gradeRows: { student_id: string; topic_name: string; grade: number; justification: string; created_at: string }[] = [];

    // From practice_sets
    for (const ps of allPracticeSets) {
      const localId = scholarProfileToLocal.get(ps.student_id);
      if (!localId || ps.score === null || ps.score === undefined) continue;

      gradeRows.push({
        student_id: localId,
        topic_name: ps.title || 'Scholar Practice',
        grade: ps.score,
        justification: `Scholar practice: ${ps.title || 'Practice Set'}${ps.skill_tags?.length ? ` [${ps.skill_tags.join(', ')}]` : ''}`,
        created_at: ps.completed_at,
      });
    }

    // From attempts
    for (const att of allAttempts) {
      const localId = scholarProfileToLocal.get(att.student_id);
      if (!localId || att.score === null || att.score === undefined) continue;

      const title = assignmentTitles.get(att.assignment_id) || 'Scholar Assignment';
      gradeRows.push({
        student_id: localId,
        topic_name: title,
        grade: att.score,
        justification: `Scholar assignment: ${title} (${att.mode || 'standard'})`,
        created_at: att.submitted_at,
      });
    }

    console.log(`Total grade rows to check: ${gradeRows.length}`);

    if (gradeRows.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          source: 'scholar_db',
          grades_imported: 0,
          students_matched: matchedNames.length,
          profiles_linked: scholarProfileToLocal.size,
          practice_sets_found: allPracticeSets.length,
          attempts_found: allAttempts.length,
          message: 'No completed grades found in Scholar for matched students',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Step 8: De-duplicate against existing local grades ──
    const affectedStudentIds = [...new Set(gradeRows.map(g => g.student_id))];
    const { data: existingGrades } = await supabase
      .from('grade_history')
      .select('student_id, topic_name, created_at')
      .in('student_id', affectedStudentIds)
      .gte('created_at', sinceISO);

    const existingSet = new Set(
      (existingGrades || []).map(g => `${g.student_id}|${g.topic_name}|${g.created_at}`)
    );
    // Also de-dup by student + topic (looser match)
    const existingTopicSet = new Set(
      (existingGrades || []).map(g => `${g.student_id}|${g.topic_name}`)
    );

    const newGrades = gradeRows.filter(g => {
      const exactKey = `${g.student_id}|${g.topic_name}|${g.created_at}`;
      const topicKey = `${g.student_id}|${g.topic_name}`;
      return !existingSet.has(exactKey) && !existingTopicSet.has(topicKey);
    });

    console.log(`New grades after de-dup: ${newGrades.length} (from ${gradeRows.length})`);

    // ── Step 9: Insert new grades ──
    let gradesImported = 0;
    if (newGrades.length > 0) {
      for (let i = 0; i < newGrades.length; i += 50) {
        const batch = newGrades.slice(i, i + 50).map(g => ({
          student_id: g.student_id,
          teacher_id: user.id,
          topic_name: g.topic_name,
          grade: g.grade,
          grade_justification: `Scholar (synced) | ${g.justification}`,
        }));

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

    // ── Step 10: Mark pending sync logs as processed ──
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
          source_method: 'scholar_db_real_tables',
          practice_sets_found: allPracticeSets.length,
          attempts_found: allAttempts.length,
          grades_imported: gradesImported,
          students_matched: matchedNames.length,
          profiles_linked: scholarProfileToLocal.size,
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
        practice_sets_found: allPracticeSets.length,
        attempts_found: allAttempts.length,
        grades_imported: gradesImported,
        students_matched: matchedNames.length,
        profiles_linked: scholarProfileToLocal.size,
        message: gradesImported > 0
          ? `Imported ${gradesImported} grades from Scholar for ${scholarProfileToLocal.size} linked students`
          : `No new grades to import (${allPracticeSets.length} practice sets, ${allAttempts.length} attempts already synced or no new data)`,
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
