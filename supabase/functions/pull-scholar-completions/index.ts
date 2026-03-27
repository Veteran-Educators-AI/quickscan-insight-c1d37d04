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

/** Safely query a remote table — returns empty array if table doesn't exist */
async function safeQuery(client: any, table: string, select: string, filters?: (q: any) => any, limit = 1000): Promise<any[]> {
  try {
    let q = client.from(table).select(select).limit(limit);
    if (filters) q = filters(q);
    const { data, error } = await q;
    if (error) {
      console.warn(`Scholar table '${table}' query failed (may not exist): ${error.message}`);
      return [];
    }
    return data || [];
  } catch (e) {
    console.warn(`Scholar table '${table}' threw: ${e}`);
    return [];
  }
}

/**
 * Pull Scholar completions — queries the Scholar (shared) database
 * and imports grades into local grade_history by matching students on name.
 * All remote queries are resilient to missing tables.
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

    // Build name → local student map (first_name|last_name → {id, class_id})
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
    const matchedNames: string[] = [];
    const scholarProfileToLocal = new Map<string, string>(); // Scholar profile id → local student id

    // ── Step 3: Try multiple strategies to match Scholar students to local ──

    // Strategy A: external_students table (may not exist)
    const extStudents = await safeQuery(scholar, 'external_students',
      'id, external_id, first_name, last_name, full_name, linked_user_id, email');
    console.log(`Scholar external_students: ${extStudents.length}`);

    const scholarUserToLocal = new Map<string, string>();

    for (const es of extStudents) {
      let key = `${(es.first_name || '').toLowerCase().trim()}|${(es.last_name || '').toLowerCase().trim()}`;
      let local = nameToLocal.get(key);
      if (!local && es.full_name) {
        const parts = es.full_name.trim().split(/\s+/);
        if (parts.length >= 2) {
          key = `${parts[0].toLowerCase()}|${parts.slice(1).join(' ').toLowerCase()}`;
          local = nameToLocal.get(key);
        }
      }
      if (local) {
        if (es.linked_user_id) scholarUserToLocal.set(es.linked_user_id, local.id);
        matchedNames.push(es.full_name || `${es.first_name} ${es.last_name}`);
      }
    }

    // Resolve linked_user_id → student_profiles.id
    const linkedUserIds = Array.from(scholarUserToLocal.keys());
    if (linkedUserIds.length > 0) {
      for (let i = 0; i < linkedUserIds.length; i += 50) {
        const batch = linkedUserIds.slice(i, i + 50);
        const profiles = await safeQuery(scholar, 'student_profiles', 'id, user_id',
          (q: any) => q.in('user_id', batch));
        for (const p of profiles) {
          const localId = scholarUserToLocal.get(p.user_id);
          if (localId) scholarProfileToLocal.set(p.id, localId);
        }
      }
    }

    // Strategy B: Direct name match on student_profiles (fallback)
    if (scholarProfileToLocal.size === 0) {
      console.log('Trying direct student_profiles name match...');
      const allProfiles = await safeQuery(scholar, 'student_profiles',
        'id, user_id, first_name, last_name, display_name');

      for (const p of allProfiles) {
        let key = `${(p.first_name || '').toLowerCase().trim()}|${(p.last_name || '').toLowerCase().trim()}`;
        let local = nameToLocal.get(key);
        if (!local && p.display_name) {
          const parts = p.display_name.trim().split(/\s+/);
          if (parts.length >= 2) {
            key = `${parts[0].toLowerCase()}|${parts.slice(1).join(' ').toLowerCase()}`;
            local = nameToLocal.get(key);
          }
        }
        if (local) {
          scholarProfileToLocal.set(p.id, local.id);
          matchedNames.push(p.display_name || `${p.first_name} ${p.last_name}`);
        }
      }
      console.log(`Direct profile name match: ${scholarProfileToLocal.size}`);
    }

    // Strategy C: Try xp_transactions or grade_history directly if profiles didn't work
    if (scholarProfileToLocal.size === 0) {
      console.log('No student_profiles matched. Trying Scholar grade_history by student name...');
      // Try querying Scholar's grade_history or similar tables with student references
      const scholarGrades = await safeQuery(scholar, 'grade_history',
        'id, student_id, topic_name, grade, grade_justification, created_at',
        (q: any) => q.gte('created_at', sinceISO).order('created_at', { ascending: false }),
        500);

      if (scholarGrades.length > 0) {
        // Get student info from Scholar's students table
        const scholarStudentIds = [...new Set(scholarGrades.map((g: any) => g.student_id))];
        const scholarStudents = await safeQuery(scholar, 'students',
          'id, first_name, last_name',
          (q: any) => q.in('id', scholarStudentIds.slice(0, 200)));

        const scholarStudentMap = new Map<string, any>();
        for (const ss of scholarStudents) {
          scholarStudentMap.set(ss.id, ss);
        }

        // Direct grade import by name matching
        const gradeRows: any[] = [];
        for (const sg of scholarGrades) {
          const ss = scholarStudentMap.get(sg.student_id);
          if (!ss) continue;
          const key = `${(ss.first_name || '').toLowerCase().trim()}|${(ss.last_name || '').toLowerCase().trim()}`;
          const local = nameToLocal.get(key);
          if (local) {
            gradeRows.push({
              student_id: local.id,
              topic_name: sg.topic_name,
              grade: sg.grade,
              justification: sg.grade_justification || `Scholar grade: ${sg.topic_name}`,
              created_at: sg.created_at,
            });
            matchedNames.push(`${ss.first_name} ${ss.last_name}`);
          }
        }

        if (gradeRows.length > 0) {
          // De-duplicate and insert (same logic as below)
          const result = await deduplicateAndInsert(supabase, gradeRows, user.id, sinceISO);
          await logSync(supabase, user.id, {
            source_method: 'scholar_grade_history_direct',
            grades_imported: result.imported,
            students_matched: [...new Set(matchedNames)].length,
            class_id: class_id || 'all',
          });

          return new Response(
            JSON.stringify({
              success: true,
              source: 'scholar_db_direct',
              grades_imported: result.imported,
              students_matched: [...new Set(matchedNames)].length,
              message: result.imported > 0
                ? `Imported ${result.imported} grades directly from Scholar`
                : 'No new grades to import (already synced)',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          source: 'scholar_db',
          grades_imported: 0,
          students_matched: 0,
          message: 'Could not match any Scholar students to local roster. Ensure student names match between systems.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Scholar profiles mapped: ${scholarProfileToLocal.size}, matched names: ${matchedNames.length}`);

    // ── Step 4: Pull practice_sets (completed) from Scholar ──
    const scholarProfileIds = Array.from(scholarProfileToLocal.keys());
    let allPracticeSets: any[] = [];

    for (let i = 0; i < scholarProfileIds.length; i += 50) {
      const batch = scholarProfileIds.slice(i, i + 50);
      const sets = await safeQuery(scholar, 'practice_sets',
        'id, student_id, title, score, completed_at, skill_tags, status',
        (q: any) => q.in('student_id', batch).eq('status', 'completed').gte('completed_at', sinceISO)
          .order('completed_at', { ascending: false }),
        200);
      allPracticeSets = allPracticeSets.concat(sets);
    }
    console.log(`Scholar practice_sets found: ${allPracticeSets.length}`);

    // ── Step 5: Pull attempts (submitted/graded) from Scholar ──
    let allAttempts: any[] = [];

    for (let i = 0; i < scholarProfileIds.length; i += 50) {
      const batch = scholarProfileIds.slice(i, i + 50);
      const atts = await safeQuery(scholar, 'attempts',
        'id, student_id, assignment_id, score, submitted_at, status, mode',
        (q: any) => q.in('student_id', batch).in('status', ['submitted', 'graded', 'verified'])
          .not('score', 'is', null).gte('submitted_at', sinceISO)
          .order('submitted_at', { ascending: false }),
        200);
      allAttempts = allAttempts.concat(atts);
    }
    console.log(`Scholar attempts found: ${allAttempts.length}`);

    // Get assignment titles
    const assignmentIds = [...new Set(allAttempts.map(a => a.assignment_id).filter(Boolean))];
    const assignmentTitles = new Map<string, string>();
    if (assignmentIds.length > 0) {
      for (let i = 0; i < assignmentIds.length; i += 50) {
        const batch = assignmentIds.slice(i, i + 50);
        const assignments = await safeQuery(scholar, 'assignments', 'id, title, subject',
          (q: any) => q.in('id', batch));
        for (const a of assignments) {
          assignmentTitles.set(a.id, a.title || a.subject || 'Scholar Assignment');
        }
      }
    }

    // ── Step 6: Build grade rows ──
    const gradeRows: any[] = [];

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

    // ── Step 7: De-duplicate and insert ──
    const result = await deduplicateAndInsert(supabase, gradeRows, user.id, sinceISO);

    // Mark pending sync logs as processed
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

    await logSync(supabase, user.id, {
      source_method: 'scholar_db_multi_strategy',
      practice_sets_found: allPracticeSets.length,
      attempts_found: allAttempts.length,
      grades_imported: result.imported,
      students_matched: matchedNames.length,
      profiles_linked: scholarProfileToLocal.size,
      since_date: sinceISO,
      class_id: class_id || 'all',
    });

    return new Response(
      JSON.stringify({
        success: true,
        source: 'scholar_db',
        practice_sets_found: allPracticeSets.length,
        attempts_found: allAttempts.length,
        grades_imported: result.imported,
        students_matched: matchedNames.length,
        profiles_linked: scholarProfileToLocal.size,
        message: result.imported > 0
          ? `Imported ${result.imported} grades from Scholar for ${scholarProfileToLocal.size} linked students`
          : `No new grades to import (${allPracticeSets.length + allAttempts.length} entries already synced)`,
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

/** De-duplicate grades against existing local grade_history, then insert new ones */
async function deduplicateAndInsert(
  supabase: any,
  gradeRows: { student_id: string; topic_name: string; grade: number; justification: string; created_at: string }[],
  teacherId: string,
  sinceISO: string
): Promise<{ imported: number }> {
  const affectedStudentIds = [...new Set(gradeRows.map(g => g.student_id))];
  const { data: existingGrades } = await supabase
    .from('grade_history')
    .select('student_id, topic_name, created_at')
    .in('student_id', affectedStudentIds)
    .gte('created_at', sinceISO);

  const existingSet = new Set(
    (existingGrades || []).map((g: any) => `${g.student_id}|${g.topic_name}|${g.created_at}`)
  );
  const existingTopicSet = new Set(
    (existingGrades || []).map((g: any) => `${g.student_id}|${g.topic_name}`)
  );

  const newGrades = gradeRows.filter(g => {
    const exactKey = `${g.student_id}|${g.topic_name}|${g.created_at}`;
    const topicKey = `${g.student_id}|${g.topic_name}`;
    return !existingSet.has(exactKey) && !existingTopicSet.has(topicKey);
  });

  console.log(`New grades after de-dup: ${newGrades.length} (from ${gradeRows.length})`);

  let imported = 0;
  for (let i = 0; i < newGrades.length; i += 50) {
    const batch = newGrades.slice(i, i + 50).map(g => ({
      student_id: g.student_id,
      teacher_id: teacherId,
      topic_name: g.topic_name,
      grade: g.grade,
      grade_justification: `Scholar (synced) | ${g.justification}`,
    }));

    const { error } = await supabase.from('grade_history').insert(batch);
    if (error) {
      console.error(`Batch insert error at offset ${i}:`, error);
    } else {
      imported += batch.length;
    }
  }

  return { imported };
}

/** Log a sync event */
async function logSync(supabase: any, teacherId: string, data: Record<string, any>) {
  try {
    await supabase.from('sister_app_sync_log').insert({
      teacher_id: teacherId,
      action: 'pull_completions',
      data,
      processed: true,
      processed_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Non-fatal log error:', e);
  }
}
