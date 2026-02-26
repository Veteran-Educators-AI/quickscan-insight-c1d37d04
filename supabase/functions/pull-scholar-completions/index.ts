import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Pull practice session completions FROM Scholar AI.
 * 
 * Strategy (in priority order):
 * 1. Call Scholar's API endpoint to request completions (preferred)
 * 2. Query Scholar's external_students table for cached grade data
 * 3. Fall back to direct table scanning if API unavailable
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

    // Get our students for matching
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

    const teacherStudents = students.filter(s => s.classes && (s.classes as any)?.teacher_id === user.id);
    console.log(`Found ${teacherStudents.length} students for teacher`);

    // Build lookup maps
    const emailToStudent = new Map<string, typeof teacherStudents[0]>();
    const nameToStudent = new Map<string, typeof teacherStudents[0]>();
    const idToStudent = new Map<string, typeof teacherStudents[0]>();
    for (const s of teacherStudents) {
      if (s.email) emailToStudent.set(s.email.toLowerCase(), s);
      if (s.user_id) idToStudent.set(s.user_id, s);
      idToStudent.set(s.id, s);
      const fullName = `${s.first_name} ${s.last_name}`.toLowerCase().trim();
      nameToStudent.set(fullName, s);
    }

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - since_days);
    const sinceISO = sinceDate.toISOString();

    let completions: any[] = [];
    let sourceMethod = '';
    const diagnostics: string[] = [];

    // ── Strategy 1: Call Scholar's API endpoint ──
    const scholarApiUrl = Deno.env.get('NYCOLOGIC_API_URL');
    const sisterAppApiKey = Deno.env.get('SISTER_APP_API_KEY');
    const scholarAnonKey = Deno.env.get('SCHOLAR_SUPABASE_ANON_KEY');

    if (scholarApiUrl && sisterAppApiKey) {
      try {
        console.log('Strategy 1: Requesting completions via Scholar API...');
        
        // Build student identifiers to send to Scholar
        const studentIdentifiers = teacherStudents.map(s => ({
          id: s.id,
          email: s.email,
          name: `${s.first_name} ${s.last_name}`,
          user_id: s.user_id,
        }));

        const apiResponse = await fetch(scholarApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': sisterAppApiKey,
            ...(scholarAnonKey ? { 'apikey': scholarAnonKey } : {}),
          },
          body: JSON.stringify({
            type: 'pull_completions',
            data: {
              source: 'nycologic_ai',
              since: sinceISO,
              student_identifiers: studentIdentifiers,
              class_id: class_id || null,
            },
          }),
        });

        if (apiResponse.ok) {
          const apiData = await apiResponse.json();
          console.log(`Scholar API response: ${JSON.stringify(apiData).substring(0, 500)}`);
          
          if (apiData.completions && Array.isArray(apiData.completions) && apiData.completions.length > 0) {
            completions = apiData.completions;
            sourceMethod = 'scholar_api';
            diagnostics.push(`scholar_api: ${completions.length} completions returned`);
          } else if (apiData.students && Array.isArray(apiData.students)) {
            // Scholar might return student-level data instead
            for (const student of apiData.students) {
              if (student.grades && Array.isArray(student.grades)) {
                for (const grade of student.grades) {
                  completions.push({
                    ...grade,
                    student_email: student.email,
                    student_name: student.full_name || student.name,
                    external_id: student.external_id || student.id,
                  });
                }
              }
            }
            if (completions.length > 0) {
              sourceMethod = 'scholar_api_students';
              diagnostics.push(`scholar_api_students: ${completions.length} grades from ${apiData.students.length} students`);
            }
          } else {
            diagnostics.push(`scholar_api: ok but no completions (keys: ${Object.keys(apiData).join(',')})`);
          }
        } else {
          diagnostics.push(`scholar_api: HTTP ${apiResponse.status}`);
        }
      } catch (e) {
        diagnostics.push(`scholar_api: ${(e as Error).message}`);
        console.error('Scholar API pull failed:', e);
      }
    } else {
      diagnostics.push('scholar_api: not configured (missing URL or API key)');
    }

    // ── Strategy 2: Query Scholar's external_students table ──
    if (completions.length === 0) {
      const scholarUrl = Deno.env.get('SCHOLAR_SUPABASE_URL');
      
      if (scholarUrl && scholarAnonKey) {
        try {
          console.log('Strategy 2: Querying Scholar external_students...');
          const scholarClient = createClient(scholarUrl, scholarAnonKey);

          // Query external_students which we know exists on Scholar
          const { data: extStudents, error: extError } = await scholarClient
            .from('external_students')
            .select('*')
            .gte('updated_at', sinceISO)
            .limit(500);

          if (!extError && extStudents && extStudents.length > 0) {
            console.log(`Found ${extStudents.length} external_students records`);
            
            // Extract grade data from external_students
            for (const ext of extStudents) {
              if (ext.grades && typeof ext.grades === 'object') {
                const grades = Array.isArray(ext.grades) ? ext.grades : [ext.grades];
                for (const grade of grades) {
                  completions.push({
                    ...grade,
                    student_email: ext.email,
                    student_name: ext.full_name || `${ext.first_name || ''} ${ext.last_name || ''}`.trim(),
                    external_id: ext.external_id,
                    overall_average: ext.overall_average,
                  });
                }
              }
              
              // If no embedded grades but has overall_average, create a summary entry
              if (ext.overall_average && (!ext.grades || (Array.isArray(ext.grades) && ext.grades.length === 0))) {
                completions.push({
                  student_email: ext.email,
                  student_name: ext.full_name || `${ext.first_name || ''} ${ext.last_name || ''}`.trim(),
                  external_id: ext.external_id,
                  score: ext.overall_average,
                  topic_name: 'Scholar Overall Average',
                  completed_at: ext.updated_at,
                });
              }
            }
            
            if (completions.length > 0) {
              sourceMethod = 'external_students';
              diagnostics.push(`external_students: ${completions.length} entries from ${extStudents.length} students`);
            } else {
              diagnostics.push(`external_students: ${extStudents.length} records but no grade data embedded`);
            }
          } else {
            diagnostics.push(`external_students: ${extError ? extError.message : '0 rows'}`);
          }

          // Also try game_sessions which we know exists
          if (completions.length === 0) {
            const { data: gameSessions, error: gameError } = await scholarClient
              .from('game_sessions')
              .select('*')
              .gte('completed_at', sinceISO)
              .order('completed_at', { ascending: false })
              .limit(500);

            if (!gameError && gameSessions && gameSessions.length > 0) {
              completions = gameSessions;
              sourceMethod = 'game_sessions';
              diagnostics.push(`game_sessions: ${gameSessions.length} rows`);
              console.log(`Sample game_session: ${JSON.stringify(gameSessions[0]).substring(0, 500)}`);
            } else {
              diagnostics.push(`game_sessions: ${gameError ? gameError.message : '0 rows'}`);
            }
          }
        } catch (e) {
          diagnostics.push(`direct_query: ${(e as Error).message}`);
        }
      } else {
        diagnostics.push('direct_query: Scholar URL or anon key not configured');
      }
    }

    console.log(`Diagnostics: ${diagnostics.join(' | ')}`);
    console.log(`Total completions: ${completions.length} via ${sourceMethod || 'none'}`);

    // ── Match completions to local students and create grade_history ──
    let gradesCreated = 0;
    const matchedStudents = new Set<string>();
    let skippedDuplicates = 0;
    let skippedNoScore = 0;

    for (const completion of completions) {
      const email = (completion.student_email || completion.email || completion.user_email || '').toLowerCase();
      const userId = completion.user_id || completion.student_user_id || '';
      const externalId = completion.external_id || completion.student_external_id || completion.nycologic_student_id || '';
      const name = (completion.student_name || completion.full_name || '').toLowerCase().trim();

      let matchedStudent = emailToStudent.get(email)
        || idToStudent.get(userId)
        || idToStudent.get(externalId)
        || nameToStudent.get(name);

      if (!matchedStudent) continue;
      matchedStudents.add(matchedStudent.id);

      // Determine score and topic
      const score = completion.score ?? completion.percentage ?? completion.grade
        ?? completion.overall_score ?? completion.final_score ?? null;
      const topicName = completion.topic_name || completion.topic || completion.subject
        || completion.activity_name || completion.game_name || completion.assignment_title
        || completion.title || completion.lesson_name || 'Scholar Practice';
      const completedAt = completion.completed_at || completion.submitted_at
        || completion.created_at || completion.updated_at;
      const questionsCorrect = completion.questions_correct || completion.correct_count || 0;
      const questionsAttempted = completion.questions_attempted || completion.total_questions || 0;

      let finalScore = score;
      if (finalScore === null && questionsAttempted > 0 && questionsCorrect >= 0) {
        finalScore = Math.round((questionsCorrect / questionsAttempted) * 100);
      }

      if (finalScore === null || finalScore === 0) {
        skippedNoScore++;
        continue;
      }

      // Duplicate check
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

      const justification = questionsAttempted > 0
        ? `Scholar practice: ${questionsCorrect}/${questionsAttempted} correct (pulled via ${sourceMethod})`
        : `Scholar practice: ${topicName} (pulled via ${sourceMethod})`;

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
        console.error(`Insert failed for ${matchedStudent.first_name}:`, insertError);
      }
    }

    // Log the pull
    try {
      await supabase.from('sister_app_sync_log').insert({
        teacher_id: user.id,
        action: 'pull_completions',
        data: {
          source_method: sourceMethod,
          diagnostics,
          completions_found: completions.length,
          students_matched: matchedStudents.size,
          grades_created: gradesCreated,
          duplicates_skipped: skippedDuplicates,
          skipped_no_score: skippedNoScore,
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
        source: sourceMethod || 'none',
        diagnostics,
        completions_found: completions.length,
        students_matched: matchedStudents.size,
        grades_created: gradesCreated,
        duplicates_skipped: skippedDuplicates,
        message: gradesCreated > 0
          ? `Pulled ${gradesCreated} new grades for ${matchedStudents.size} students`
          : completions.length > 0
            ? `Found ${completions.length} completions but ${skippedDuplicates} were already recorded`
            : `No completions found from Scholar (tried: ${diagnostics.map(d => d.split(':')[0]).join(', ')})`,
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
