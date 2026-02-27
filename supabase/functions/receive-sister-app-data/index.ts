// =============================================================================
// RECEIVE SISTER APP DATA - Edge Function
// =============================================================================
// This edge function allows the sister app (NYClogic Scholar Ai)
// to send graded work and activity data back to NYCLogic Ai.
// 
// HOW IT WORKS:
// 1. Sister app sends a POST request with an API key in the x-api-key header
// 2. We validate the API key by hashing it and comparing to stored hashes
// 3. If valid, we log the incoming data and optionally save grades
// 4. We return success/failure response to the sister app
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// -----------------------------------------------------------------------------
// CORS HEADERS
// -----------------------------------------------------------------------------
// These headers allow the edge function to be called from any origin.
// This is necessary because the sister app might be hosted on a different domain.
// The x-api-key header is explicitly allowed for API key authentication.
// -----------------------------------------------------------------------------
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

// -----------------------------------------------------------------------------
// INCOMING DATA INTERFACE
// -----------------------------------------------------------------------------
// This defines the structure of data the sister app can send.
// 
// action: What type of event is being reported
//   - grade_completed: Student finished graded work
//   - activity_completed: Student finished an activity (game, quiz, etc.)
//   - reward_earned: Student earned XP, coins, or other rewards
//   - level_up: Student reached a new level
//   - achievement_unlocked: Student earned an achievement/badge
//
// student_id: The UUID of the student in our database
//
// data: Flexible object containing event-specific information
// -----------------------------------------------------------------------------
interface IncomingData {
  action: 'grade_completed' | 'activity_completed' | 'sync_practice_session' | 'reward_earned' | 'level_up' | 'achievement_unlocked' | 'batch_sync' | 'behavior_deduction' | 'live_session_completed' | 'roster_sync' | 'student_created' | 'student_updated' | 'work_submitted';
  student_id?: string; // Optional for batch_sync and live_session_completed
  data?: {
    activity_type?: string;      // e.g., "quiz", "game", "practice", "live_presentation"
    activity_name?: string;      // e.g., "Algebra Challenge Level 5"
    score?: number;              // 0-100 score if applicable
    xp_earned?: number;          // Experience points earned
    coins_earned?: number;       // Virtual currency earned
    new_level?: number;          // New level reached (for level_up action)
    achievement_name?: string;   // Name of achievement (for achievement_unlocked)
    topic_name?: string;         // Math topic associated with the activity
    timestamp?: string;          // When the event occurred (ISO string)
    // Live session specific fields
    session_code?: string;
    participation_mode?: string;
    credit_for_participation?: number;
    deduction_for_non_participation?: number;
    total_participants?: number;
    active_participants?: number;
    participant_results?: LiveSessionParticipantResult[];
    [key: string]: unknown;      // Allow additional custom fields
  };
  // Batch sync fields (when action === 'batch_sync')
  teacher_id?: string;
  teacher_name?: string | null;
  sync_timestamp?: string;
  student_profiles?: StudentLearningProfile[];
  summary?: {
    total_students: number;
    total_grades: number;
    total_misconceptions: number;
    weak_topics_identified: number;
  };
}

interface LiveSessionParticipantResult {
  student_id: string;
  student_name: string;
  total_questions_answered: number;
  correct_answers: number;
  accuracy: number;
  credit_awarded: number;
  participated: boolean;
  answers: {
    selected_answer: string;
    is_correct: boolean | null;
    time_taken_seconds: number | null;
  }[];
}

interface StudentLearningProfile {
  student_id: string;
  student_name: string;
  student_email: string | null;  // Email for auto-linking on Scholar signup
  class_id: string;
  class_name: string;
  overall_average: number;
  grades: {
    topic_name: string;
    grade: number;
    regents_score: number | null;
    nys_standard: string | null;
    grade_justification: string | null;
    created_at: string;
  }[];
  misconceptions: {
    name: string;
    description: string | null;
    confidence: number | null;
    topic_name: string | null;
    standard: string | null;  // NYS standard code (e.g., "A.REI.4")
    problem_set: string | null;  // Worksheet/problem set title
    severity: string | null;  // high, medium, low
    suggested_remedies: string[] | null;
  }[];
  weak_topics: { topic_name: string; avg_score: number }[];
  recommended_remediation: string[];
  xp_potential: number;
  coin_potential: number;
}

type StudentResolution = 'id' | 'email' | 'missing';

interface ResolvedStudent {
  resolvedId: string | null;
  externalStudentId: string | null;
  resolution: StudentResolution;
}

async function fetchExistingStudentIds(supabaseAdmin: any, studentIds: string[]): Promise<Set<string>> {
  const uniqueIds = Array.from(new Set(studentIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return new Set();
  }

  const { data, error } = await supabaseAdmin
    .from('students')
    .select('id')
    .in('id', uniqueIds);

  if (error) {
    console.error('Error fetching existing student IDs:', error);
    return new Set();
  }

  return new Set((data || []).map((row: { id: string }) => row.id));
}

async function fetchStudentIdsByEmail(
  supabaseAdmin: any,
  emails: string[],
  teacherId: string
): Promise<Map<string, string>> {
  const uniqueEmails = Array.from(new Set(emails.filter(Boolean)));
  if (uniqueEmails.length === 0 || !teacherId) {
    return new Map();
  }

  const { data: classes, error: classError } = await supabaseAdmin
    .from('classes')
    .select('id')
    .eq('teacher_id', teacherId);

  if (classError) {
    console.error('Error fetching teacher classes for email lookup:', classError);
    return new Map();
  }

  const classIds = (classes || []).map((row: { id: string }) => row.id);
  if (classIds.length === 0) {
    return new Map();
  }

  const { data: students, error: studentError } = await supabaseAdmin
    .from('students')
    .select('id, email, class_id')
    .in('class_id', classIds)
    .in('email', uniqueEmails);

  if (studentError) {
    console.error('Error fetching student IDs by email:', studentError);
    return new Map();
  }

  const emailMap = new Map<string, string>();
  for (const row of students || []) {
    if (row.email && !emailMap.has(row.email)) {
      emailMap.set(row.email, row.id);
    }
  }

  return emailMap;
}

function resolveStudentId(
  incomingId: string | undefined,
  email: string | null | undefined,
  existingIds: Set<string>,
  emailMap: Map<string, string>
): ResolvedStudent {
  if (incomingId && existingIds.has(incomingId)) {
    return { resolvedId: incomingId, externalStudentId: null, resolution: 'id' };
  }

  if (email && emailMap.has(email)) {
    return {
      resolvedId: emailMap.get(email) || null,
      externalStudentId: incomingId || null,
      resolution: 'email',
    };
  }

  return {
    resolvedId: null,
    externalStudentId: incomingId || null,
    resolution: 'missing',
  };
}

// -----------------------------------------------------------------------------
// MAIN REQUEST HANDLER
// -----------------------------------------------------------------------------
// This is the entry point for all incoming HTTP requests to this function.
// -----------------------------------------------------------------------------
serve(async (req) => {
  // ---------------------------------------------------------------------------
  // CORS PREFLIGHT HANDLING
  // ---------------------------------------------------------------------------
  // Browsers send an OPTIONS request before the actual POST to check if
  // cross-origin requests are allowed. We respond with CORS headers.
  // ---------------------------------------------------------------------------
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // -------------------------------------------------------------------------
    // STEP 1: EXTRACT API KEY FROM REQUEST HEADER
    // -------------------------------------------------------------------------
    // The sister app must include the API key in the x-api-key header.
    // If missing, we immediately reject the request.
    // -------------------------------------------------------------------------
    const apiKey = req.headers.get('x-api-key');
    
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // -------------------------------------------------------------------------
    // STEP 2: CREATE SUPABASE ADMIN CLIENT
    // -------------------------------------------------------------------------
    // We use the service role key to bypass RLS (Row Level Security).
    // This is necessary because we're validating an API key, not a user session.
    // The service role key has full database access.
    // -------------------------------------------------------------------------
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // -------------------------------------------------------------------------
    // STEP 3: PARSE REQUEST BODY (NEEDED FOR INTERNAL SYNC)
    // -------------------------------------------------------------------------
    // Extract the JSON payload from the request.
    // We'll validate required fields after auth.
    // -------------------------------------------------------------------------
    const body: IncomingData = await req.json();

    // -------------------------------------------------------------------------
    // STEP 4: LOOK UP THE API KEY IN THE DATABASE
    // -------------------------------------------------------------------------
    // Search the teacher_api_keys table for a matching hash.
    // If found, we get the teacher_id to know whose account this key belongs to.
    // -------------------------------------------------------------------------
    // Check if this is an internal system-to-system call
    const isInternalKey = apiKey === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    let teacherIdFromKey: string | null = null;

    if (isInternalKey) {
      // Internal system-to-system calls must include teacher_id in payload
      teacherIdFromKey = body.teacher_id || (body.data as any)?.teacher_id || null;
      if (!teacherIdFromKey) {
        return new Response(
          JSON.stringify({ success: false, error: 'Missing teacher_id for internal sync' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // -----------------------------------------------------------------------
      // STEP 4: HASH THE INCOMING API KEY
      // -----------------------------------------------------------------------
      // We never store API keys in plain text for security reasons.
      // Instead, we store a SHA-256 hash of the key.
      // To validate, we hash the incoming key and compare to stored hashes.
      // -----------------------------------------------------------------------
      const encoder = new TextEncoder();
      const data = encoder.encode(apiKey);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const apiKeyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // -----------------------------------------------------------------------
      // STEP 5: LOOK UP THE API KEY IN THE DATABASE
      // -----------------------------------------------------------------------
      // Search the teacher_api_keys table for a matching hash.
      // If found, we get the teacher_id to know whose account this key belongs to.
      // -----------------------------------------------------------------------
      const { data: keyRecord, error: keyError } = await supabaseAdmin
        .from('teacher_api_keys')
        .select('id, teacher_id, is_active')
        .eq('api_key_hash', apiKeyHash)
        .single();

      // If no matching key found, reject the request
      if (keyError || !keyRecord) {
        console.error('API key not found:', keyError);
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid API key' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // -----------------------------------------------------------------------
      // STEP 6: CHECK IF THE API KEY IS ACTIVE
      // -----------------------------------------------------------------------
      // Teachers can disable their API keys without deleting them.
      // This allows temporary suspension of sister app access.
      // -----------------------------------------------------------------------
      if (!keyRecord.is_active) {
        return new Response(
          JSON.stringify({ success: false, error: 'API key is inactive' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // -----------------------------------------------------------------------
      // STEP 7: UPDATE LAST USED TIMESTAMP
      // -----------------------------------------------------------------------
      // Track when the API key was last used for monitoring purposes.
      // This helps teachers see if their key is actively being used.
      // -----------------------------------------------------------------------
      await supabaseAdmin
        .from('teacher_api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', keyRecord.id);

      teacherIdFromKey = keyRecord.teacher_id;
    }

    // -------------------------------------------------------------------------
    // STEP 8: VALIDATE REQUEST BODY
    // -------------------------------------------------------------------------
    // Validate that required fields are present based on action type.
    // -------------------------------------------------------------------------
    
    if (!body.action) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required field: action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For batch_sync and live_session_completed, validate differently
    if (body.action === 'batch_sync') {
      if (!body.student_profiles || body.student_profiles.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'batch_sync requires student_profiles array' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else if (body.action === 'live_session_completed') {
      // live_session_completed doesn't need student_id, uses participant_results array
      if (!body.data?.participant_results) {
        return new Response(
          JSON.stringify({ success: false, error: 'live_session_completed requires data.participant_results array' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else if (body.action === 'roster_sync' || body.action === 'student_created' || body.action === 'student_updated') {
      // roster_sync can have student_id at root or in data object
      const studentId = body.student_id || body.data?.student_id;
      if (!studentId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Missing required field: student_id (in root or data object)' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else if (!body.student_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required field: student_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const teacherId = teacherIdFromKey!;

    // -------------------------------------------------------------------------
    // STEP 8: PROCESS BASED ON ACTION TYPE
    // -------------------------------------------------------------------------
    let processedResult: any = null;
    let logEntry: any = null;

    if (body.action === 'live_session_completed') {
      // ---------------------------------------------------------------------
      // LIVE SESSION PROCESSING
      // ---------------------------------------------------------------------
      // Process live presentation session results from sister app
      // Saves participation data for each student
      // ---------------------------------------------------------------------
      console.log('Processing live session completed:', body.data);
      
      const participantResults = body.data?.participant_results || [];
      const existingStudentIds = await fetchExistingStudentIds(
        supabaseAdmin,
        participantResults.map((participant) => participant.student_id)
      );
      const emptyEmailMap = new Map<string, string>();
      let participantsProcessed = 0;
      let participantsMissing = 0;
      let gradesCreated = 0;
      let gradesSkippedMissingStudent = 0;

      for (const participant of participantResults) {
        participantsProcessed++;
        
        // Log each participant's results (non-fatal if logging fails)
        try {
          await supabaseAdmin.from('sister_app_sync_log').insert({
            teacher_id: teacherId,
            student_id: participant.student_id,
            action: 'live_session_participation',
            data: {
              activity_name: body.data?.activity_name,
              topic_name: body.data?.topic_name,
              student_name: participant.student_name,
              total_questions_answered: participant.total_questions_answered,
              correct_answers: participant.correct_answers,
              accuracy: participant.accuracy,
              credit_awarded: participant.credit_awarded,
              participated: participant.participated,
              answers: participant.answers,
              session_code: body.data?.session_code,
            },
            source_app: 'scholar_app',
            processed: true,
            processed_at: new Date().toISOString(),
          });
        } catch (logErr) {
          console.error('Non-fatal: Failed to log participant sync:', logErr);
        }

        // If participated, create a grade entry for tracking
        if (participant.participated && participant.total_questions_answered > 0) {
          // Resolve each participant's student ID
          const participantResolved = resolveStudentId(
            participant.student_id,
            undefined,
            existingStudentIds,
            emptyEmailMap
          );
          if (!participantResolved.resolvedId) {
            gradesSkippedMissingStudent++;
            continue;
          }

          const { error: gradeError } = await supabaseAdmin
            .from('grade_history')
            .insert({
              student_id: participantResolved.resolvedId,
              teacher_id: teacherId,
              topic_name: body.data?.topic_name || 'Live Session',
              grade: participant.accuracy,
              grade_justification: `Live session participation: ${participant.correct_answers}/${participant.total_questions_answered} correct (${body.data?.activity_name || 'Session'})`,
            });

          if (!gradeError) {
            gradesCreated++;
          } else {
            console.error('Error saving live session grade:', gradeError);
          }
        }
      }

      // Log the session summary (non-fatal)
      try {
        const { data: summaryLog } = await supabaseAdmin
          .from('sister_app_sync_log')
          .insert({
            teacher_id: teacherId,
            action: 'live_session_completed',
            data: {
              activity_name: body.data?.activity_name,
              topic_name: body.data?.topic_name,
              session_code: body.data?.session_code,
              total_participants: body.data?.total_participants,
              active_participants: body.data?.active_participants,
              participants_processed: participantsProcessed,
              grades_created: gradesCreated,
            },
            source_app: 'scholar_app',
            processed: true,
            processed_at: new Date().toISOString(),
          })
          .select()
          .single();

        logEntry = summaryLog;
      } catch (logErr) {
        console.error('Non-fatal: Failed to log live session summary:', logErr);
      }
      processedResult = {
        live_session_processed: true,
        participants_synced: participantsProcessed,
        participants_missing: participantsMissing,
        grades_created: gradesCreated,
        grades_skipped_missing_student: gradesSkippedMissingStudent,
        message: `Processed ${participantsProcessed} participant results from live session`,
      };

    } else if (body.action === 'batch_sync') {
      // ---------------------------------------------------------------------
      // BATCH SYNC PROCESSING
      // ---------------------------------------------------------------------
      // Process comprehensive learning profiles from NYCLogic AI
      // This includes grades, misconceptions, weak topics, and remediation
      // IMPORTANT: Persist actual data, not just logs!
      // ---------------------------------------------------------------------
      console.log('Processing batch sync with FULL data persistence:', body.summary);
      console.log('First student sample:', JSON.stringify(body.student_profiles?.[0] ? {
        student_id: body.student_profiles[0].student_id,
        student_name: body.student_profiles[0].student_name,
        overall_average: body.student_profiles[0].overall_average,
        grades_count: body.student_profiles[0].grades?.length || 0,
        weak_topics_count: body.student_profiles[0].weak_topics?.length || 0,
        misconceptions_count: body.student_profiles[0].misconceptions?.length || 0,
        sample_grade: body.student_profiles[0].grades?.[0] || null,
      } : 'No profiles'));

      const profiles = body.student_profiles!;
      const existingStudentIds = await fetchExistingStudentIds(
        supabaseAdmin,
        profiles.map((profile) => profile.student_id)
      );
      const emailMap = await fetchStudentIdsByEmail(
        supabaseAdmin,
        profiles.map((profile) => profile.student_email || '').filter(Boolean),
        teacherId
      );
      let gradesProcessed = 0;
      let gradesSaved = 0;
      let gradesSkippedMissingStudent = 0;
      let misconceptionsProcessed = 0;
      let misconceptionsSaved = 0;
      let misconceptionsSkippedMissingStudent = 0;
      let studentsMissing = 0;
      let studentsResolvedByEmail = 0;
      let remediationsCreated = 0;

      for (const profile of profiles) {
        const resolvedStudent = resolveStudentId(
          profile.student_id,
          profile.student_email,
          existingStudentIds,
          emailMap
        );

        if (!resolvedStudent.resolvedId) {
          studentsMissing++;
        }
        if (resolvedStudent.resolution === 'email') {
          studentsResolvedByEmail++;
        }

        let profileGradesProcessed = 0;
        let profileGradesSaved = 0;
        let profileMisconceptionsProcessed = 0;
        let profileMisconceptionsSaved = 0;
        // ===================================================================
        // PERSIST ACTUAL GRADE HISTORY ENTRIES
        // ===================================================================
        if (profile.grades && profile.grades.length > 0) {
          for (const grade of profile.grades) {
            gradesProcessed++;
            profileGradesProcessed++;

            if (!resolvedStudent.resolvedId) {
              gradesSkippedMissingStudent++;
              continue;
            }

            // Check if this grade already exists (avoid duplicates)
            const { data: existingGrade } = await supabaseAdmin
              .from('grade_history')
              .select('id')
              .eq('student_id', resolvedStudent.resolvedId)
              .eq('topic_name', grade.topic_name)
              .eq('created_at', grade.created_at)
              .maybeSingle();

            if (!existingGrade) {
              const { error: gradeError } = await supabaseAdmin
                .from('grade_history')
                .insert({
                  student_id: resolvedStudent.resolvedId,
                  teacher_id: teacherId,
                  topic_name: grade.topic_name,
                  grade: grade.grade,
                  regents_score: grade.regents_score,
                  nys_standard: grade.nys_standard,
                  grade_justification: grade.grade_justification || `Synced from ScanGenius: ${grade.topic_name}`,
                  created_at: grade.created_at,
                });

              if (gradeError) {
                console.error('Error saving grade:', gradeError.message);
              } else {
                gradesSaved++;
                profileGradesSaved++;
              }
            }
          }
        }

        // ===================================================================
        // PERSIST MISCONCEPTIONS DATA
        // ===================================================================
        if (profile.misconceptions && profile.misconceptions.length > 0) {
          for (const misconception of profile.misconceptions) {
            misconceptionsProcessed++;
            profileMisconceptionsProcessed++;

            if (!resolvedStudent.resolvedId) {
              misconceptionsSkippedMissingStudent++;
              continue;
            }

            // Check if this misconception already exists
            const { data: existingMis } = await supabaseAdmin
              .from('analysis_misconceptions')
              .select('id')
              .eq('student_id', resolvedStudent.resolvedId)
              .eq('misconception_text', misconception.name)
              .eq('topic_name', misconception.topic_name || 'General')
              .maybeSingle();

            if (!existingMis) {
              const { error: misError } = await supabaseAdmin
                .from('analysis_misconceptions')
                .insert({
                  student_id: resolvedStudent.resolvedId,
                  teacher_id: teacherId,
                  topic_name: misconception.topic_name || 'General',
                  misconception_text: misconception.name,
                  severity: misconception.severity,
                  suggested_remedies: misconception.suggested_remedies,
                });

              if (misError) {
                console.error('Error saving misconception:', misError.message);
              } else {
                misconceptionsSaved++;
                profileMisconceptionsSaved++;
              }
            }
          }
        }

        // ===================================================================
        // LOG COMPREHENSIVE STUDENT PROFILE WITH ALL DATA (non-fatal)
        // ===================================================================
        try {
          await supabaseAdmin.from('sister_app_sync_log').insert({
            teacher_id: teacherId,
            student_id: profile.student_id,
            action: 'batch_sync_student',
            data: {
              student_name: profile.student_name,
              student_email: profile.student_email,
              overall_average: profile.overall_average,
              grades_count: profile.grades?.length || 0,
              grades_saved: gradesSaved,
              misconceptions_count: profile.misconceptions?.length || 0,
              misconceptions_saved: misconceptionsSaved,
              weak_topics: profile.weak_topics,
              recommended_remediation: profile.recommended_remediation,
              xp_potential: profile.xp_potential,
              coin_potential: profile.coin_potential,
              // Include sample data for debugging
              sample_grades: profile.grades?.slice(0, 3) || [],
              sample_misconceptions: profile.misconceptions?.slice(0, 3) || [],
            },
            source_app: 'nycologic_ai',
            processed: true,
            processed_at: new Date().toISOString(),
          });
        } catch (logErr) {
          console.error('Non-fatal: Failed to log student profile sync:', logErr);
        }

        if (profile.recommended_remediation && profile.recommended_remediation.length > 0) {
          remediationsCreated++;
        }
      }

      console.log(`Batch sync complete: ${gradesSaved}/${gradesProcessed} grades saved, ${misconceptionsSaved}/${misconceptionsProcessed} misconceptions saved`);

      // Log the batch sync summary with actual save counts (non-fatal)
      try {
        const { data: summaryLog } = await supabaseAdmin
          .from('sister_app_sync_log')
          .insert({
            teacher_id: teacherId,
            action: 'batch_sync',
            data: {
              summary: body.summary,
              teacher_name: body.teacher_name,
              sync_timestamp: body.sync_timestamp,
              profiles_processed: profiles.length,
              grades_processed: gradesProcessed,
              grades_saved: gradesSaved,
              misconceptions_processed: misconceptionsProcessed,
              misconceptions_saved: misconceptionsSaved,
            },
            source_app: 'nycologic_ai',
            processed: true,
            processed_at: new Date().toISOString(),
          })
          .select()
          .single();

        logEntry = summaryLog;
      } catch (logErr) {
        console.error('Non-fatal: Failed to log batch sync summary:', logErr);
      }

      processedResult = {
        batch_processed: true,
        students_synced: profiles.length,
        students_missing: studentsMissing,
        students_resolved_by_email: studentsResolvedByEmail,
        grades_received: gradesProcessed,
        grades_saved: gradesSaved,
        grades_skipped_missing_student: gradesSkippedMissingStudent,
        misconceptions_received: misconceptionsProcessed,
        misconceptions_saved: misconceptionsSaved,
        misconceptions_skipped_missing_student: misconceptionsSkippedMissingStudent,
        remediations_queued: remediationsCreated,
        message: `Persisted ${gradesSaved} grades and ${misconceptionsSaved} misconceptions to database`,
      };

    } else if (body.action === 'work_submitted') {
      // ---------------------------------------------------------------------
      // WORK SUBMITTED PROCESSING
      // ---------------------------------------------------------------------
      // Handle completed student work pushed from Scholar App
      // Records grade and notifies teacher via push notification
      // ---------------------------------------------------------------------
      console.log('Processing work_submitted from Scholar app:', body.student_id);

      const workData: any = body.data || {};
      const incomingStudentId = body.student_id || undefined;
      const existingStudentIds2 = await fetchExistingStudentIds(
        supabaseAdmin,
        incomingStudentId ? [incomingStudentId] : []
      );
      const emailMap2 = await fetchStudentIdsByEmail(
        supabaseAdmin,
        workData.student_email ? [workData.student_email] : [],
        teacherId
      );
      const resolvedStudent2 = resolveStudentId(
        incomingStudentId,
        workData.student_email,
        existingStudentIds2,
        emailMap2
      );

      // Save grade if score present
      let workGradeSaved = false;
      if (workData.score !== undefined && resolvedStudent2.resolvedId) {
        const { error: gradeError } = await supabaseAdmin
          .from('grade_history')
          .insert({
            student_id: resolvedStudent2.resolvedId,
            teacher_id: teacherId,
            topic_name: workData.topic_name || workData.assignment_title || 'Scholar App Submission',
            grade: workData.score,
            nys_standard: workData.standard_code || null,
            raw_score_earned: workData.questions_correct || null,
            raw_score_possible: workData.questions_attempted || null,
            grade_justification: `Student submitted from Scholar App: ${workData.assignment_title || workData.topic_name || 'Work'} (${workData.questions_correct || 0}/${workData.questions_attempted || 0} correct)`,
          });
        workGradeSaved = !gradeError;
        if (gradeError) console.error('Error saving work grade:', gradeError);
      }

      // Log to sister_app_sync_log
      try {
        const { data: workLog } = await supabaseAdmin
          .from('sister_app_sync_log')
          .insert({
            teacher_id: teacherId,
            student_id: resolvedStudent2.resolvedId || incomingStudentId,
            action: 'work_submitted',
            data: {
              student_name: workData.student_name,
              assignment_title: workData.assignment_title,
              topic_name: workData.topic_name,
              standard_code: workData.standard_code,
              score: workData.score,
              questions_attempted: workData.questions_attempted,
              questions_correct: workData.questions_correct,
              time_spent_minutes: workData.time_spent_minutes,
              answers: workData.answers,
              completed_at: workData.completed_at,
              source_assignment_id: workData.source_assignment_id,
              grade_saved: workGradeSaved,
              external_student_id: resolvedStudent2.externalStudentId,
              student_resolution: resolvedStudent2.resolution,
            },
            source_app: 'scholar_app',
            processed: workGradeSaved,
            processed_at: workGradeSaved ? new Date().toISOString() : null,
          })
          .select()
          .single();

        logEntry = workLog;
      } catch (logErr) {
        console.error('Non-fatal: Failed to log work submission:', logErr);
      }

      // Send push notification to teacher
      try {
        const studentName = workData.student_name || 'A student';
        const scoreText = workData.score !== undefined ? ` (${workData.score}%)` : '';
        const topicText = workData.assignment_title || workData.topic_name || 'their work';

        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            userId: teacherId,
            title: '📝 Student Work Submitted',
            body: `${studentName} submitted ${topicText}${scoreText}`,
            data: { url: '/reports' },
          }),
        });
        console.log('Push notification sent to teacher:', teacherId);
      } catch (pushErr) {
        console.error('Non-fatal: Failed to send push notification:', pushErr);
      }

      processedResult = {
        work_received: true,
        student_resolved: resolvedStudent2.resolution,
        grade_saved: workGradeSaved,
        topic: workData.topic_name,
        score: workData.score,
      };

    } else if (body.action === 'roster_sync' || body.action === 'student_created' || body.action === 'student_updated') {
      // ---------------------------------------------------------------------
      // ROSTER SYNC PROCESSING
      // ---------------------------------------------------------------------
      // Handle roster data coming FROM the Scholar app
      // This allows Scholar to push student info back to NYCLogic Ai
      // ---------------------------------------------------------------------
      console.log('Processing roster sync from Scholar:', body.action, body.data || body.student_id);
      
      const studentData: any = body.data || {};
      const studentId: string | undefined = body.student_id || studentData.student_id;
      const existingStudentIds = await fetchExistingStudentIds(
        supabaseAdmin,
        studentId ? [studentId] : [] as string[]
      );
      const emailMap = await fetchStudentIdsByEmail(
        supabaseAdmin,
        studentData.email ? [studentData.email as string] : [] as string[],
        teacherId
      );
      const resolvedStudent = resolveStudentId(
        studentId,
        studentData.email,
        existingStudentIds,
        emailMap
      );
      
      // Log the roster sync event (non-fatal)
      try {
        const { data: rosterLog } = await supabaseAdmin
          .from('sister_app_sync_log')
          .insert({
            teacher_id: teacherId,
            student_id: studentId,
            action: body.action,
            data: {
              student_id: studentId,
              first_name: studentData.first_name,
              last_name: studentData.last_name,
              student_name: studentData.student_name,
              email: studentData.email,
              class_id: studentData.class_id,
              class_name: studentData.class_name,
              source_action: body.action,
            },
            source_app: 'scholar_app',
            processed: true,
            processed_at: new Date().toISOString(),
          })
          .select()
          .single();

        logEntry = rosterLog;
      } catch (logErr) {
        console.error('Non-fatal: Failed to log roster sync:', logErr);
      }
      processedResult = {
        roster_sync_received: true,
        student_id: resolvedStudent.resolvedId || studentId,
        external_student_id: resolvedStudent.externalStudentId,
        student_resolution: resolvedStudent.resolution,
        action: body.action,
        message: `Roster sync logged for student: ${studentData.student_name || studentId}`,
      };

    } else {
      // ---------------------------------------------------------------------
      // SINGLE EVENT PROCESSING (original behavior)
      // ---------------------------------------------------------------------
      console.log(`Processing single event: action=${body.action}, student_id=${body.student_id}, data_keys=${Object.keys(body.data || {}).join(',')}`);
      console.log(`Full incoming body for ${body.action}:`, JSON.stringify(body).substring(0, 1000));

      const incomingStudentId = body.student_id || undefined;
      const existingStudentIds = await fetchExistingStudentIds(
        supabaseAdmin,
        incomingStudentId ? [incomingStudentId] : []
      );
      const emailMap = await fetchStudentIdsByEmail(
        supabaseAdmin,
        body.data && (body.data as any).student_email ? [(body.data as any).student_email] : [],
        teacherId
      );
      const resolvedStudent = resolveStudentId(
        incomingStudentId,
        body.data ? (body.data as any).student_email : null,
        existingStudentIds,
        emailMap
      );

      const { data: singleLogEntry, error: logError } = await supabaseAdmin
        .from('sister_app_sync_log')
        .insert({
          teacher_id: teacherId,
          student_id: resolvedStudent.resolvedId,
          action: body.action,
          data: {
            ...(body.data || {}),
            external_student_id: resolvedStudent.externalStudentId,
            student_resolution: resolvedStudent.resolution,
          },
          source_app: 'sister_app',
          processed: true,
          processed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (logError) {
        console.error('Error logging sync data (non-fatal):', logError);
        console.error('Will continue processing the request despite log failure');
      }

      logEntry = singleLogEntry;

      switch (body.action) {
        case 'grade_completed':
        case 'activity_completed':
        case 'sync_practice_session': {
          // Handle practice session completions from Scholar
          const score = body.data?.score;
          const topicName = body.data?.topic_name || body.data?.activity_name || (body.data as any)?.title;
          
          if (score !== undefined && topicName) {
            if (!resolvedStudent.resolvedId) {
              processedResult = { grade_skipped_missing_student: true, action: body.action };
              break;
            }
            const justification = body.action === 'sync_practice_session'
              ? `Practice session completed on Scholar: ${body.data?.activity_name || topicName} (${(body.data as any)?.questions_correct || '?'}/${(body.data as any)?.questions_attempted || '?'} correct)`
              : `Synced from sister app: ${body.data?.activity_name || body.action}`;

            const { error: gradeError } = await supabaseAdmin
              .from('grade_history')
              .insert({
                student_id: resolvedStudent.resolvedId,
                teacher_id: teacherId,
                topic_name: topicName,
                grade: score,
                grade_justification: justification,
              });

            if (gradeError) {
              console.error('Error saving grade:', gradeError);
              processedResult = { grade_save_error: gradeError.message };
            } else {
              console.log(`Grade saved for ${body.action}: student=${resolvedStudent.resolvedId}, topic=${topicName}, score=${score}`);
              processedResult = { grade_saved: true, action: body.action };
            }
          } else {
            console.log(`No score/topic for ${body.action}: score=${score}, topic=${topicName}, data_keys=${Object.keys(body.data || {}).join(',')}`);
            processedResult = { logged: true, no_grade_data: true, action: body.action };
          }
          break;
        }

        case 'reward_earned':
        case 'level_up':
        case 'achievement_unlocked':
          processedResult = { logged: true };
          break;

        case 'behavior_deduction':
          console.log('Behavior deduction received:', body.data);
          const xpVal = body.data?.xp_deducted || (body.data?.xp_earned ? Math.abs(body.data.xp_earned) : 0);
          const coinVal = body.data?.coins_deducted || (body.data?.coins_earned ? Math.abs(body.data.coins_earned) : 0);
          processedResult = { 
            logged: true, 
            behavior_recorded: true,
            xp_deducted: xpVal,
            coins_deducted: coinVal,
          };
          break;

        default:
          console.log(`Unhandled action type: ${body.action}, logging only`);
          processedResult = { logged: true, action: body.action };
          break;
      }
    }

    // -------------------------------------------------------------------------
    // STEP 10: RETURN SUCCESS RESPONSE
    // -------------------------------------------------------------------------
    // Let the sender know the request was successful.
    // Include the log ID and processing result.
    // -------------------------------------------------------------------------
    return new Response(
      JSON.stringify({ 
        success: true, 
        log_id: logEntry?.id,
        processed: processedResult 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    // -------------------------------------------------------------------------
    // ERROR HANDLING
    // -------------------------------------------------------------------------
    // Catch any unexpected errors and return a generic error response.
    // Log the actual error for debugging purposes.
    // -------------------------------------------------------------------------
    console.error('Error processing request:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
