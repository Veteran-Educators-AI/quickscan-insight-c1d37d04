import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Pull practice session completions FROM Scholar's database
 * and create grade_history entries locally.
 * 
 * Scholar stores practice results that we can read via PostgREST.
 * This function queries Scholar for recent completions by our students,
 * then creates local grade_history entries so the teacher can see them.
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

    // Get Scholar connection config
    const scholarUrl = Deno.env.get('SCHOLAR_SUPABASE_URL');
    const scholarAnonKey = Deno.env.get('SCHOLAR_SUPABASE_ANON_KEY');
    
    if (!scholarUrl || !scholarAnonKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Scholar connection not configured' }),
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

    console.log(`Found ${students.length} local students to check for Scholar completions`);

    // Collect student emails and IDs for matching
    const studentEmails = students
      .filter(s => s.email)
      .map(s => s.email!.toLowerCase());
    
    const studentUserIds = students
      .filter(s => s.user_id)
      .map(s => s.user_id!);

    // Build a lookup map
    const emailToStudent = new Map<string, typeof students[0]>();
    const userIdToStudent = new Map<string, typeof students[0]>();
    for (const s of students) {
      if (s.email) emailToStudent.set(s.email.toLowerCase(), s);
      if (s.user_id) userIdToStudent.set(s.user_id, s);
    }

    // Query Scholar's database via PostgREST for practice sessions
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - since_days);
    const sinceISO = sinceDate.toISOString();

    // Try to read from Scholar's practice_sessions or similar table
    // We'll try multiple possible table names
    const scholarClient = createClient(scholarUrl, scholarAnonKey);
    
    let completions: any[] = [];
    let sourceTable = '';

    // Try practice_sessions table first
    try {
      const { data, error } = await scholarClient
        .from('practice_sessions')
        .select('*')
        .gte('completed_at', sinceISO)
        .order('completed_at', { ascending: false })
        .limit(500);
      
      if (!error && data && data.length > 0) {
        completions = data;
        sourceTable = 'practice_sessions';
        console.log(`Found ${data.length} practice sessions from Scholar`);
      }
    } catch (e) {
      console.log('practice_sessions table not accessible:', e);
    }

    // If no practice_sessions, try student_activity or activity_log
    if (completions.length === 0) {
      try {
        const { data, error } = await scholarClient
          .from('student_activity')
          .select('*')
          .gte('created_at', sinceISO)
          .order('created_at', { ascending: false })
          .limit(500);
        
        if (!error && data && data.length > 0) {
          completions = data;
          sourceTable = 'student_activity';
          console.log(`Found ${data.length} student activities from Scholar`);
        }
      } catch (e) {
        console.log('student_activity table not accessible:', e);
      }
    }

    // Try assignment_submissions
    if (completions.length === 0) {
      try {
        const { data, error } = await scholarClient
          .from('assignment_submissions')
          .select('*')
          .gte('submitted_at', sinceISO)
          .order('submitted_at', { ascending: false })
          .limit(500);
        
        if (!error && data && data.length > 0) {
          completions = data;
          sourceTable = 'assignment_submissions';
          console.log(`Found ${data.length} assignment submissions from Scholar`);
        }
      } catch (e) {
        console.log('assignment_submissions table not accessible:', e);
      }
    }

    // Try grade_entries or grades
    if (completions.length === 0) {
      try {
        const { data, error } = await scholarClient
          .from('grade_entries')
          .select('*')
          .gte('created_at', sinceISO)
          .order('created_at', { ascending: false })
          .limit(500);
        
        if (!error && data && data.length > 0) {
          completions = data;
          sourceTable = 'grade_entries';
          console.log(`Found ${data.length} grade entries from Scholar`);
        }
      } catch (e) {
        console.log('grade_entries table not accessible:', e);
      }
    }

    // Try external_students table on Scholar (where our synced data may live)
    if (completions.length === 0) {
      try {
        const { data, error } = await scholarClient
          .from('external_students')
          .select('*')
          .gte('updated_at', sinceISO)
          .order('updated_at', { ascending: false })
          .limit(500);
        
        if (!error && data && data.length > 0) {
          completions = data;
          sourceTable = 'external_students';
          console.log(`Found ${data.length} external student records from Scholar`);
        }
      } catch (e) {
        console.log('external_students table not accessible:', e);
      }
    }

    // Also try to list available tables by querying a few common ones
    if (completions.length === 0) {
      // Try querying the Scholar nycologic-webhook to get completions
      const sisterApiKey = Deno.env.get('SISTER_APP_API_KEY');
      if (sisterApiKey) {
        try {
          const pullUrl = `${scholarUrl}/functions/v1/nycologic-webhook`;
          console.log(`Trying to pull completions via Scholar webhook: ${pullUrl}`);
          
          const response = await fetch(pullUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': scholarAnonKey,
              'Authorization': `Bearer ${scholarAnonKey}`,
              'x-api-key': sisterApiKey,
              'x-source-app': 'nycologic-ai',
            },
            body: JSON.stringify({
              type: 'pull_completions',
              data: {
                student_emails: studentEmails.slice(0, 100),
                student_ids: studentUserIds.slice(0, 100),
                since: sinceISO,
              },
            }),
          });

          const responseText = await response.text();
          console.log(`Scholar pull response: ${response.status} ${responseText.substring(0, 500)}`);
          
          if (response.ok) {
            try {
              const result = JSON.parse(responseText);
              if (result.completions && result.completions.length > 0) {
                completions = result.completions;
                sourceTable = 'webhook_pull';
              }
            } catch (e) {
              console.log('Failed to parse Scholar pull response');
            }
          }
        } catch (e) {
          console.error('Failed to pull from Scholar webhook:', e);
        }
      }
    }

    console.log(`Total completions found: ${completions.length} from ${sourceTable || 'none'}`);

    // Match completions to our students and create grade_history entries
    let gradesCreated = 0;
    let matchedStudents = new Set<string>();
    let skippedDuplicates = 0;

    for (const completion of completions) {
      // Try to match to a local student
      const email = (completion.student_email || completion.email || '').toLowerCase();
      const userId = completion.user_id || completion.student_id || '';
      
      let matchedStudent = emailToStudent.get(email) || userIdToStudent.get(userId);
      
      // Also try matching by external_id
      if (!matchedStudent && completion.external_id) {
        matchedStudent = students.find(s => s.id === completion.external_id) || undefined;
      }

      if (!matchedStudent) continue;

      matchedStudents.add(matchedStudent.id);

      // Determine the score and topic
      const score = completion.score || completion.percentage || completion.grade || completion.overall_average || 0;
      const topicName = completion.topic_name || completion.topic || completion.subject || completion.activity_name || 'Scholar Practice';
      const completedAt = completion.completed_at || completion.submitted_at || completion.created_at || completion.updated_at;
      const questionsCorrect = completion.questions_correct || completion.correct_count || 0;
      const questionsAttempted = completion.questions_attempted || completion.total_questions || 0;

      if (score === 0 && questionsCorrect === 0) continue;

      // Check for duplicates - avoid re-inserting the same grade
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
      const { error: insertError } = await supabase
        .from('grade_history')
        .insert({
          student_id: matchedStudent.id,
          teacher_id: user.id,
          topic_name: topicName,
          grade: Math.round(score),
          raw_score_earned: questionsCorrect || null,
          raw_score_possible: questionsAttempted || null,
          grade_justification: `Scholar practice: ${questionsCorrect}/${questionsAttempted} correct (pulled from Scholar)`,
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
          completions_found: completions.length,
          students_matched: matchedStudents.size,
          grades_created: gradesCreated,
          duplicates_skipped: skippedDuplicates,
          since_date: sinceISO,
          class_id: class_id || 'all',
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
        completions_found: completions.length,
        students_matched: matchedStudents.size,
        grades_created: gradesCreated,
        duplicates_skipped: skippedDuplicates,
        message: gradesCreated > 0
          ? `Pulled ${gradesCreated} new grades from Scholar for ${matchedStudents.size} students`
          : completions.length > 0
            ? `Found ${completions.length} completions but ${skippedDuplicates} were already recorded`
            : `No new completions found in Scholar (checked ${sourceTable || 'multiple tables'})`,
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
