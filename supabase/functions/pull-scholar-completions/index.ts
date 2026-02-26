import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Pull practice session completions FROM Scholar's database
 * and create grade_history entries locally.
 * 
 * Uses SCHOLAR_SUPABASE_SERVICE_ROLE_KEY to bypass RLS on Scholar's side.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate teacher
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

    // Get Scholar connection config - USE SERVICE ROLE KEY to bypass RLS
    const scholarUrl = Deno.env.get('SCHOLAR_SUPABASE_URL');
    const scholarServiceRoleKey = Deno.env.get('SCHOLAR_SUPABASE_SERVICE_ROLE_KEY');
    const scholarAnonKey = Deno.env.get('SCHOLAR_SUPABASE_ANON_KEY');
    
    if (!scholarUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Scholar connection not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try service role key first, then gracefully fall back to anon key
    const scholarKeysToTry = [
      { type: 'service_role' as const, key: scholarServiceRoleKey },
      { type: 'anon' as const, key: scholarAnonKey },
    ].filter((entry): entry is { type: 'service_role' | 'anon'; key: string } => Boolean(entry.key));

    if (scholarKeysToTry.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Scholar keys not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get our students (with emails for matching)
    let studentQuery = supabase
      .from('students')
      .select('id, first_name, last_name, email, class_id, user_id, classes(name, teacher_id)')
      .eq('classes.teacher_id', user.id);

    if (class_id) {
      studentQuery = studentQuery.eq('class_id', class_id);
    }

    const { data: students, error: studentsError } = await studentQuery;
    if (studentsError || !students || students.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No students found', pulled: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter to only students that belong to this teacher's classes
    const teacherStudents = students.filter(s => s.classes && (s.classes as any)?.teacher_id === user.id);
    console.log(`Found ${teacherStudents.length} students for teacher (from ${students.length} total)`);

    // Build lookup maps
    const emailToStudent = new Map<string, typeof teacherStudents[0]>();
    const userIdToStudent = new Map<string, typeof teacherStudents[0]>();
    const idToStudent = new Map<string, typeof teacherStudents[0]>();
    for (const s of teacherStudents) {
      if (s.email) emailToStudent.set(s.email.toLowerCase(), s);
      if (s.user_id) userIdToStudent.set(s.user_id, s);
      idToStudent.set(s.id, s);
    }

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - since_days);
    const sinceISO = sinceDate.toISOString();

    let completions: any[] = [];
    let sourceTable = '';
    let sourceKeyType: 'service_role' | 'anon' | 'none' = 'none';
    const tablesChecked: string[] = [];

    // Try multiple possible table names on Scholar's side
    const tablesToTry = [
      { name: 'practice_sessions', dateCol: 'completed_at' },
      { name: 'practice_session_results', dateCol: 'completed_at' },
      { name: 'student_practice_sessions', dateCol: 'completed_at' },
      { name: 'game_sessions', dateCol: 'completed_at' },
      { name: 'student_submissions', dateCol: 'submitted_at' },
      { name: 'assignment_submissions', dateCol: 'submitted_at' },
      { name: 'student_activity', dateCol: 'created_at' },
      { name: 'activity_log', dateCol: 'created_at' },
      { name: 'grade_entries', dateCol: 'created_at' },
      { name: 'grades', dateCol: 'created_at' },
      { name: 'student_grades', dateCol: 'created_at' },
      { name: 'external_students', dateCol: 'updated_at' },
    ];

    for (const { type: keyType, key } of scholarKeysToTry) {
      if (completions.length > 0) break;

      const scholarClient = createClient(scholarUrl, key);
      console.log(`Trying Scholar pull with ${keyType} key`);

      for (const table of tablesToTry) {
        if (completions.length > 0) break;

        try {
          const { data, error } = await scholarClient
            .from(table.name)
            .select('*')
            .gte(table.dateCol, sinceISO)
            .order(table.dateCol, { ascending: false })
            .limit(500);

          tablesChecked.push(`${table.name} (${keyType}): ${error ? error.message : `${data?.length || 0} rows`}`);

          if (!error && data && data.length > 0) {
            completions = data;
            sourceTable = table.name;
            sourceKeyType = keyType;
            console.log(`✅ Found ${data.length} records from Scholar table: ${table.name} via ${keyType} key`);
            // Log sample record structure
            console.log(`Sample record keys: ${Object.keys(data[0]).join(', ')}`);
            console.log(`Sample record: ${JSON.stringify(data[0]).substring(0, 500)}`);
          }
        } catch (e) {
          tablesChecked.push(`${table.name} (${keyType}): exception`);
        }
      }
    }

    // If we still have nothing, try to discover tables by querying information_schema
    if (completions.length === 0) {
      try {
        const schemaClient = createClient(scholarUrl, scholarKeysToTry[0].key);

        // Try RPC call to list tables (may not be available)
        const { data: schemaData, error: schemaError } = await schemaClient
          .rpc('get_tables_list')
          .limit(50);

        if (!schemaError && schemaData) {
          console.log('Scholar tables via RPC:', JSON.stringify(schemaData).substring(0, 500));
          tablesChecked.push(`rpc:get_tables_list: ${JSON.stringify(schemaData).substring(0, 200)}`);
        }
      } catch (e) {
        // Not available, that's fine
      }
    }

    console.log(`Tables checked: ${tablesChecked.join(' | ')}`);
    console.log(`Total completions found: ${completions.length} from ${sourceTable || 'none'} via ${sourceKeyType} key`);

    // Match completions to our students and create grade_history entries
    let gradesCreated = 0;
    let matchedStudents = new Set<string>();
    let skippedDuplicates = 0;
    let skippedNoScore = 0;

    for (const completion of completions) {
      // Try to match to a local student by multiple fields
      const email = (completion.student_email || completion.email || completion.user_email || '').toLowerCase();
      const userId = completion.user_id || completion.student_user_id || '';
      const externalId = completion.external_id || completion.student_external_id || completion.nycologic_student_id || '';
      
      let matchedStudent = emailToStudent.get(email) 
        || userIdToStudent.get(userId)
        || idToStudent.get(externalId);

      // Try matching by name as fallback
      if (!matchedStudent && (completion.student_name || completion.full_name)) {
        const name = (completion.student_name || completion.full_name || '').toLowerCase().trim();
        for (const s of teacherStudents) {
          const fullName = `${s.first_name} ${s.last_name}`.toLowerCase().trim();
          if (fullName === name) {
            matchedStudent = s;
            break;
          }
        }
      }

      if (!matchedStudent) continue;

      matchedStudents.add(matchedStudent.id);

      // Determine the score and topic from various possible field names
      const score = completion.score ?? completion.percentage ?? completion.grade 
        ?? completion.overall_score ?? completion.final_score ?? completion.result_score ?? null;
      const topicName = completion.topic_name || completion.topic || completion.subject 
        || completion.activity_name || completion.game_name || completion.assignment_title
        || completion.title || completion.lesson_name || 'Scholar Practice';
      const completedAt = completion.completed_at || completion.submitted_at 
        || completion.created_at || completion.updated_at;
      const questionsCorrect = completion.questions_correct || completion.correct_count 
        || completion.correct_answers || 0;
      const questionsAttempted = completion.questions_attempted || completion.total_questions 
        || completion.question_count || 0;

      // Calculate score from questions if no direct score
      let finalScore = score;
      if (finalScore === null && questionsAttempted > 0 && questionsCorrect >= 0) {
        finalScore = Math.round((questionsCorrect / questionsAttempted) * 100);
      }

      if (finalScore === null || finalScore === 0) {
        skippedNoScore++;
        continue;
      }

      // Check for duplicates
      const { data: existing } = await supabase
        .from('grade_history')
        .select('id')
        .eq('student_id', matchedStudent.id)
        .eq('teacher_id', user.id)
        .eq('topic_name', topicName)
        .gte('created_at', new Date(new Date(completedAt).getTime() - 60000).toISOString())
        .lte('created_at', new Date(new Date(completedAt).getTime() + 60000).toISOString())
        .limit(1);

      if (existing && existing.length > 0) {
        skippedDuplicates++;
        continue;
      }

      // Create grade_history entry
      const justification = questionsAttempted > 0
        ? `Scholar practice: ${questionsCorrect}/${questionsAttempted} correct (pulled from Scholar - ${sourceTable})`
        : `Scholar practice session: ${topicName} (pulled from Scholar)`;

      const { error: insertError } = await supabase
        .from('grade_history')
        .insert({
          student_id: matchedStudent.id,
          teacher_id: user.id,
          topic_name: topicName,
          grade: Math.round(finalScore),
          raw_score_earned: questionsCorrect || null,
          raw_score_possible: questionsAttempted || null,
          grade_justification: justification,
        });

      if (!insertError) {
        gradesCreated++;
      } else {
        console.error(`Failed to insert grade for ${matchedStudent.first_name}:`, insertError);
      }
    }

    // Log the pull action
    try {
      await supabase.from('sister_app_sync_log').insert({
        teacher_id: user.id,
        action: 'pull_completions',
        data: {
          source_table: sourceTable,
          tables_checked: tablesChecked,
          completions_found: completions.length,
          students_matched: matchedStudents.size,
          grades_created: gradesCreated,
          duplicates_skipped: skippedDuplicates,
          skipped_no_score: skippedNoScore,
          since_date: sinceISO,
          class_id: class_id || 'all',
          source_key_type: sourceKeyType,
          used_service_role: sourceKeyType === 'service_role',
        },
        processed: true,
        processed_at: new Date().toISOString(),
      });
    } catch (logErr) {
      console.error('Non-fatal: Failed to log pull action:', logErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        source: sourceTable || 'none',
        source_key_type: sourceKeyType,
        tables_checked: tablesChecked,
        completions_found: completions.length,
        students_matched: matchedStudents.size,
        grades_created: gradesCreated,
        duplicates_skipped: skippedDuplicates,
        message: gradesCreated > 0
          ? `Pulled ${gradesCreated} new grades from Scholar for ${matchedStudents.size} students`
          : completions.length > 0
            ? `Found ${completions.length} completions but ${skippedDuplicates} were already recorded`
            : `No completions found in Scholar (checked: ${tablesChecked.map(t => t.split(':')[0]).join(', ')})`,
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
