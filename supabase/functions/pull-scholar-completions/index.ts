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
      console.warn(`Table '${table}' query failed: ${error.message}`);
      return [];
    }
    return data || [];
  } catch (e) {
    console.warn(`Table '${table}' threw: ${e}`);
    return [];
  }
}

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

    // ── Step 1: Get local students ──
    let studentsQuery = supabase
      .from('students')
      .select('id, first_name, last_name, class_id, classes!inner(id, name, teacher_id)')
      .eq('classes.teacher_id', user.id);

    if (class_id && class_id !== 'all') {
      studentsQuery = studentsQuery.eq('class_id', class_id);
    }

    const { data: localStudents, error: studentsError } = await studentsQuery;
    if (studentsError) {
      return jsonResp({ success: false, error: studentsError.message }, 500);
    }

    if (!localStudents || localStudents.length === 0) {
      return jsonResp({ success: true, message: 'No students found', grades_imported: 0 });
    }

    // Build name lookup: "firstname|lastname" → local student
    const nameToLocal = new Map<string, { id: string; class_id: string }>();
    for (const s of localStudents) {
      const key = `${(s.first_name || '').toLowerCase().trim()}|${(s.last_name || '').toLowerCase().trim()}`;
      if (!nameToLocal.has(key)) {
        nameToLocal.set(key, { id: s.id, class_id: s.class_id });
      }
    }
    // Also map by id for sync log entries that already have student_id
    const idToLocal = new Map<string, string>();
    for (const s of localStudents) {
      idToLocal.set(s.id, s.id);
    }

    console.log(`Local students: ${localStudents.length}, unique names: ${nameToLocal.size}`);

    let totalImported = 0;
    let studentsMatched = 0;
    const matchedStudentIds = new Set<string>();

    // ══════════════════════════════════════════════════════════════
    // SOURCE 1: Local sync log (data pushed from Scholar via webhook)
    // ══════════════════════════════════════════════════════════════
    const { data: syncLogs } = await supabase
      .from('sister_app_sync_log')
      .select('id, action, data, student_id, created_at')
      .eq('teacher_id', user.id)
      .in('action', ['grade_completed', 'activity_completed', 'sync_practice_session', 'batch_sync_student'])
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: false })
      .limit(500);

    const localGradeRows: GradeRow[] = [];

    if (syncLogs && syncLogs.length > 0) {
      console.log(`Found ${syncLogs.length} local sync log entries to process`);

      for (const log of syncLogs) {
        const d = log.data as any;
        if (!d) continue;

        // Extract grade from various data formats
        const score = d.score ?? d.grade ?? d.overall_average;
        const topicName = d.topic_name ?? d.activity_name ?? d.subject ?? 'Scholar Activity';

        if (score === null || score === undefined || score === 0) continue;

        // Find matching local student
        let localStudentId: string | null = null;

        // Try student_id from log row
        if (log.student_id && idToLocal.has(log.student_id)) {
          localStudentId = log.student_id;
        }

        // Try name matching from data
        if (!localStudentId && d.student_name) {
          const parts = d.student_name.trim().split(/\s+/);
          if (parts.length >= 2) {
            const key = `${parts[0].toLowerCase()}|${parts.slice(1).join(' ').toLowerCase()}`;
            const local = nameToLocal.get(key);
            if (local) localStudentId = local.id;
          }
        }

        if (!localStudentId) continue;

        matchedStudentIds.add(localStudentId);
        localGradeRows.push({
          student_id: localStudentId,
          topic_name: topicName,
          grade: Math.round(Number(score)),
          justification: `Scholar sync: ${topicName}`,
          created_at: log.created_at,
        });
      }

      console.log(`Local sync log grades extracted: ${localGradeRows.length}`);
    }

    // Insert local sync log grades
    if (localGradeRows.length > 0) {
      const result = await deduplicateAndInsert(supabase, localGradeRows, user.id, sinceISO);
      totalImported += result.imported;
    }

    // ══════════════════════════════════════════════════════════════
    // SOURCE 2: Remote Scholar DB (direct query)
    // ══════════════════════════════════════════════════════════════
    const scholarKey = Deno.env.get('SCHOLAR_SUPABASE_SERVICE_ROLE_KEY');
    const scholarUrl = scholarKey ? deriveSupabaseUrl(scholarKey) : Deno.env.get('SCHOLAR_SUPABASE_URL');

    if (scholarUrl && scholarKey) {
      console.log('Querying remote Scholar database...');
      const scholar = createClient(scholarUrl, scholarKey);

      // Query Scholar's grade_history directly
      const scholarGrades = await safeQuery(scholar, 'grade_history',
        'id, student_id, topic_name, grade, grade_justification, created_at',
        (q: any) => q.gte('created_at', sinceISO).order('created_at', { ascending: false }),
        500);

      console.log(`Scholar grade_history entries: ${scholarGrades.length}`);

      if (scholarGrades.length > 0) {
        // Get the unique student IDs from Scholar grades (filter to valid UUIDs only)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const scholarStudentIds = [...new Set(
          scholarGrades.map((g: any) => g.student_id).filter((id: string) => uuidRegex.test(id))
        )];

        if (scholarStudentIds.length > 0) {
          // Get student names from Scholar's students table
          const scholarStudentMap = new Map<string, { first_name: string; last_name: string }>();

          for (let i = 0; i < scholarStudentIds.length; i += 50) {
            const batch = scholarStudentIds.slice(i, i + 50);
            const scholarStudents = await safeQuery(scholar, 'students',
              'id, first_name, last_name',
              (q: any) => q.in('id', batch));
            for (const ss of scholarStudents) {
              scholarStudentMap.set(ss.id, { first_name: ss.first_name, last_name: ss.last_name });
            }
          }

          console.log(`Scholar students resolved: ${scholarStudentMap.size}`);

          // Match Scholar grades to local students by name
          const remoteGradeRows: GradeRow[] = [];
          for (const sg of scholarGrades) {
            const ss = scholarStudentMap.get(sg.student_id);
            if (!ss) continue;

            const key = `${(ss.first_name || '').toLowerCase().trim()}|${(ss.last_name || '').toLowerCase().trim()}`;
            const local = nameToLocal.get(key);
            if (!local) continue;

            matchedStudentIds.add(local.id);
            remoteGradeRows.push({
              student_id: local.id,
              topic_name: sg.topic_name,
              grade: sg.grade,
              justification: sg.grade_justification || `Scholar: ${sg.topic_name}`,
              created_at: sg.created_at,
            });
          }

          console.log(`Remote Scholar grades matched to local: ${remoteGradeRows.length}`);

          if (remoteGradeRows.length > 0) {
            const result = await deduplicateAndInsert(supabase, remoteGradeRows, user.id, sinceISO);
            totalImported += result.imported;
          }
        }
      }
    } else {
      console.log('Scholar DB credentials not configured, using local sync log only');
    }

    studentsMatched = matchedStudentIds.size;

    // Log this pull
    await logSync(supabase, user.id, {
      grades_imported: totalImported,
      students_matched: studentsMatched,
      local_sync_entries: syncLogs?.length || 0,
      since_date: sinceISO,
      class_id: class_id || 'all',
    });

    return jsonResp({
      success: true,
      grades_imported: totalImported,
      grades_created: totalImported,
      students_matched: studentsMatched,
      completions_found: localGradeRows.length,
      duplicates_skipped: localGradeRows.length - totalImported,
      message: totalImported > 0
        ? `Imported ${totalImported} grades for ${studentsMatched} students`
        : studentsMatched > 0
          ? 'No new grades to import (already synced)'
          : 'No matching student grades found. Ensure student names match between systems.',
    });
  } catch (error) {
    console.error('Error in pull-scholar-completions:', error);
    return jsonResp(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// ── Helpers ──

interface GradeRow {
  student_id: string;
  topic_name: string;
  grade: number;
  justification: string;
  created_at: string;
}

function jsonResp(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function deduplicateAndInsert(
  supabase: any,
  gradeRows: GradeRow[],
  teacherId: string,
  sinceISO: string
): Promise<{ imported: number }> {
  const affectedStudentIds = [...new Set(gradeRows.map(g => g.student_id))];

  // Get existing grades to avoid duplicates
  const { data: existingGrades } = await supabase
    .from('grade_history')
    .select('student_id, topic_name, created_at')
    .in('student_id', affectedStudentIds.slice(0, 200))
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
      console.error(`Batch insert error at offset ${i}:`, error.message);
    } else {
      imported += batch.length;
    }
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
  } catch (e) {
    console.error('Non-fatal log error:', e);
  }
}
