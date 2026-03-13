/**
 * ============================================================================
 * SYNC GRADES TO SCHOLAR EDGE FUNCTION
 * ============================================================================
 * 
 * Syncs comprehensive student learning data to NYCLogic Scholar AI including:
 * - Grade history with performance metrics
 * - Misconceptions identified from work analysis
 * - Recommended remediation topics
 * - Skill gaps and weak areas
 * 
 * Scholar uses this data to:
 * 1. Auto-assign targeted remediation practice
 * 2. Display misconception patterns to students
 * 3. Personalize learning paths based on weaknesses
 * 4. Award XP/coins for improvement on weak topics
 * 
 * REQUIRED SECRETS:
 * - NYCOLOGIC_API_URL: Endpoint URL of Scholar app receiver
 * - SCHOLAR_SUPABASE_SERVICE_ROLE_KEY: Preferred auth for shared-database sync (no API key management)
 * - SISTER_APP_API_KEY: Optional legacy fallback
 * 
 * ============================================================================
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SyncRequest {
  class_id?: string;
  student_ids?: string[];
  sync_all?: boolean;
  test_connection?: boolean;
}

interface MisconceptionData {
  name: string;
  description: string | null;
  confidence: number | null;
  topic_name: string | null;
  standard: string | null;  // NYS standard code (e.g., "A.REI.4")
  problem_set: string | null;  // Worksheet/problem set title
  severity: string | null;  // high, medium, low
  suggested_remedies: string[] | null;
}

interface GradeEntry {
  topic_name: string;
  grade: number;
  regents_score: number | null;
  nys_standard: string | null;
  grade_justification: string | null;
  created_at: string;
}

interface StudentLearningProfile {
  student_id: string;
  student_name: string;
  student_email: string | null;  // Email for auto-linking on Scholar signup
  class_id: string;
  class_name: string;
  overall_average: number;
  grades: GradeEntry[];
  misconceptions: MisconceptionData[];
  weak_topics: { topic_name: string; avg_score: number }[];
  recommended_remediation: string[];
  xp_potential: number;
  coin_potential: number;
}

interface BatchSyncPayload {
  action: 'batch_sync';
  teacher_id: string;
  teacher_name: string | null;
  sync_timestamp: string;
  student_profiles: StudentLearningProfile[];
  summary: {
    total_students: number;
    total_grades: number;
    total_misconceptions: number;
    weak_topics_identified: number;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sisterAppEndpoint = Deno.env.get('NYCOLOGIC_API_URL');
    const scholarServiceRoleKey = Deno.env.get('SCHOLAR_SUPABASE_SERVICE_ROLE_KEY') || null;
    const sisterAppApiKey = Deno.env.get('SISTER_APP_API_KEY') || null;

    if (!scholarServiceRoleKey && !sisterAppApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Neither Scholar service role key nor sister app API key is configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!sisterAppEndpoint) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sister app endpoint URL not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authMode = scholarServiceRoleKey ? 'service_role' : 'api_key';

    const getOutboundHeaders = (forceLegacyApiKey = false): Record<string, string> => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (scholarServiceRoleKey && !forceLegacyApiKey) {
        headers['x-api-key'] = scholarServiceRoleKey;
        headers['Authorization'] = `Bearer ${scholarServiceRoleKey}`;
        headers['apikey'] = scholarServiceRoleKey;
        headers['x-source-app'] = 'scholar-app';
        return headers;
      }

      if (!sisterAppApiKey) {
        throw new Error('Legacy API key fallback requested but SISTER_APP_API_KEY is not configured');
      }

      headers['x-api-key'] = sisterAppApiKey;
      return headers;
    };

    const postWithAuthFallback = async (url: string, payload: unknown) => {
      let usedAuthMode = authMode;
      let response = await fetch(url, {
        method: 'POST',
        headers: getOutboundHeaders(false),
        body: JSON.stringify(payload),
      });

      if (!response.ok && scholarServiceRoleKey && sisterAppApiKey && (response.status === 401 || response.status === 403)) {
        usedAuthMode = 'api_key_fallback';
        response = await fetch(url, {
          method: 'POST',
          headers: getOutboundHeaders(true),
          body: JSON.stringify(payload),
        });
      }

      const responseText = await response.text();
      return { response, responseText, usedAuthMode };
    };

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const requestData: SyncRequest = await req.json();
    const { class_id, student_ids, test_connection } = requestData;

    // Handle test connection request - ping Scholar API directly
    if (test_connection) {
      console.log('Testing connection to Scholar API...');
      const baseEndpoint = sisterAppEndpoint.replace(/\/$/, '');
      
      try {
        const testPayload = baseEndpoint.includes('nycologic-webhook')
          ? {
              type: 'student_created',
              data: {
                external_id: 'ping-test',
                full_name: 'Ping Test',
                source: 'nycologic',
              },
            }
          : {
              action: 'ping',
              timestamp: new Date().toISOString(),
            };

        const { response: testResponse, responseText, usedAuthMode } = await postWithAuthFallback(baseEndpoint, testPayload);
        console.log('Scholar API response:', testResponse.status, responseText, `auth_mode=${usedAuthMode}`);

        if (testResponse.ok) {
          return new Response(
            JSON.stringify({ 
              success: true, 
              message: 'Successfully connected to Scholar API!',
              endpoint: baseEndpoint,
              status: testResponse.status,
              auth_mode: usedAuthMode,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: `Scholar API returned ${testResponse.status}: ${responseText.slice(0, 200)}`,
              endpoint: baseEndpoint,
              auth_mode: usedAuthMode,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (fetchError: unknown) {
        const errorMessage = fetchError instanceof Error ? fetchError.message : 'Unknown error';
        console.error('Connection test failed:', fetchError);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Network error: ${errorMessage}`,
            endpoint: sisterAppEndpoint,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get teacher info
    const { data: teacherProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    // Get teacher settings for XP/coin multipliers
    const { data: settings } = await supabase
      .from('settings')
      .select('sister_app_xp_multiplier, sister_app_coin_multiplier')
      .eq('teacher_id', user.id)
      .single();

    const xpMultiplier = settings?.sister_app_xp_multiplier || 1;
    const coinMultiplier = settings?.sister_app_coin_multiplier || 1;

    // Get students to sync (including email for auto-linking on Scholar)
    let studentQuery = supabase
      .from('students')
      .select('id, first_name, last_name, email, class_id, classes(name)')
      .eq('classes.teacher_id', user.id);

    if (student_ids && student_ids.length > 0) {
      studentQuery = studentQuery.in('id', student_ids);
    } else if (class_id) {
      studentQuery = studentQuery.eq('class_id', class_id);
    }

    const { data: students, error: studentsError } = await studentQuery;

    if (studentsError || !students || students.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No students to sync', synced_count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const studentIds = students.map(s => s.id);

    // Fetch all grades for these students
    const { data: grades, error: gradesError } = await supabase
      .from('grade_history')
      .select('student_id, topic_name, grade, regents_score, nys_standard, grade_justification, created_at')
      .in('student_id', studentIds)
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false });

    if (gradesError) {
      console.error('Error fetching grades:', gradesError);
    }

    // Fetch misconceptions from attempts (with graceful fallback)
    let attempts: any[] | null = null;
    try {
      const { data: attemptData, error: attemptError } = await supabase
        .from('attempts')
        .select('student_id, attempt_misconceptions(misconception_id, confidence, misconception_tags(name, description, topics(name)))')
        .in('student_id', studentIds);
      
      if (attemptError) {
        console.error('Error fetching attempt misconceptions (non-fatal):', attemptError.message);
      } else {
        attempts = attemptData;
      }
    } catch (err) {
      console.error('Failed to fetch attempt misconceptions:', err);
    }

    // Fetch analysis_misconceptions which have structured data including standards and remedies
    let analysisMisconceptions: any[] | null = null;
    try {
      const { data: misData, error: misError } = await supabase
        .from('analysis_misconceptions')
        .select('student_id, topic_name, misconception_text, severity, suggested_remedies, grade_history_id')
        .in('student_id', studentIds)
        .eq('teacher_id', user.id);
      
      if (misError) {
        console.error('Error fetching analysis misconceptions (non-fatal):', misError.message);
      } else {
        analysisMisconceptions = misData;
      }
    } catch (err) {
      console.error('Failed to fetch analysis misconceptions:', err);
    }

    // Fetch worksheets for problem set names
    const { data: worksheets } = await supabase
      .from('worksheets')
      .select('id, title')
      .eq('teacher_id', user.id);

    // Build comprehensive learning profiles for each student
    const studentProfiles: StudentLearningProfile[] = [];
    let totalMisconceptions = 0;
    let totalWeakTopics = 0;

    for (const student of students) {
      const studentGrades = (grades || []).filter(g => g.student_id === student.id);
      const studentAttempts = (attempts || []).filter(a => a.student_id === student.id);

      // Calculate overall average
      const avgGrade = studentGrades.length > 0
        ? Math.round(studentGrades.reduce((sum, g) => sum + g.grade, 0) / studentGrades.length)
        : 0;

      // Extract misconceptions from attempt_misconceptions
      const misconceptions: MisconceptionData[] = [];
      const misconceptionSet = new Set<string>();
      
      for (const attempt of studentAttempts) {
        const attemptMisconceptions = attempt.attempt_misconceptions as any[];
        if (attemptMisconceptions) {
          for (const am of attemptMisconceptions) {
            const tag = am.misconception_tags as any;
            if (tag && !misconceptionSet.has(tag.name)) {
              misconceptionSet.add(tag.name);
              misconceptions.push({
                name: tag.name,
                description: tag.description,
                confidence: am.confidence,
                topic_name: tag.topics?.name || null,
                standard: null,
                problem_set: null,
                severity: null,
                suggested_remedies: null,
              });
            }
          }
        }
      }

      // Add misconceptions from analysis_misconceptions (has standards and remedies)
      const studentAnalysisMisconceptions = (analysisMisconceptions || []).filter((m: any) => m.student_id === student.id);
      for (const am of studentAnalysisMisconceptions) {
        // grade_history join may not be available; gracefully handle
        const gradeHistory = (am as any).grade_history;
        const standard = gradeHistory?.nys_standard || null;
        
        // Find associated worksheet/problem set from grade history topic
        const topicName = am.topic_name;
        const associatedWorksheet = (worksheets || []).find(w => 
          w.title?.toLowerCase().includes(topicName?.toLowerCase() || '')
        );

        if (!misconceptionSet.has(am.misconception_text)) {
          misconceptionSet.add(am.misconception_text);
          misconceptions.push({
            name: am.misconception_text,
            description: am.misconception_text,
            confidence: null,
            topic_name: am.topic_name,
            standard: standard,
            problem_set: associatedWorksheet?.title || null,
            severity: am.severity,
            suggested_remedies: am.suggested_remedies,
          });
        }
      }

      totalMisconceptions += misconceptions.length;

      // Calculate weak topics (topics with avg < 70%)
      const topicScores: Record<string, number[]> = {};
      for (const g of studentGrades) {
        if (!topicScores[g.topic_name]) {
          topicScores[g.topic_name] = [];
        }
        topicScores[g.topic_name].push(g.grade);
      }

      const weakTopics: { topic_name: string; avg_score: number }[] = [];
      for (const [topic, scores] of Object.entries(topicScores)) {
        const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        if (avg < 70) {
          weakTopics.push({ topic_name: topic, avg_score: avg });
        }
      }
      weakTopics.sort((a, b) => a.avg_score - b.avg_score);
      totalWeakTopics += weakTopics.length;

      // Generate remediation recommendations based on weak topics and misconceptions
      const recommendedRemediation: string[] = [];
      
      // Add weak topics as remediation priorities
      for (const wt of weakTopics.slice(0, 5)) {
        recommendedRemediation.push(`Practice: ${wt.topic_name} (current: ${wt.avg_score}%)`);
      }
      
      // Add topics from misconceptions
      for (const m of misconceptions.slice(0, 3)) {
        if (m.topic_name && !recommendedRemediation.some(r => r.includes(m.topic_name!))) {
          recommendedRemediation.push(`Address misconception: ${m.name} in ${m.topic_name}`);
        }
      }

      // Calculate XP/coin potential based on improvement opportunity
      const improvementPotential = Math.max(0, 100 - avgGrade);
      const xpPotential = Math.round(improvementPotential * 2 * xpMultiplier);
      const coinPotential = Math.round(improvementPotential * coinMultiplier);

      const classData = student.classes as any;
      studentProfiles.push({
        student_id: student.id,
        student_name: `${student.first_name} ${student.last_name}`,
        student_email: student.email || null,  // Include email for auto-linking
        class_id: student.class_id,
        class_name: classData?.name || 'Unknown',
        overall_average: avgGrade,
        grades: studentGrades.map(g => ({
          topic_name: g.topic_name,
          grade: g.grade,
          regents_score: g.regents_score,
          nys_standard: g.nys_standard,
          grade_justification: g.grade_justification,
          created_at: g.created_at,
        })),
        misconceptions,
        weak_topics: weakTopics,
        recommended_remediation: recommendedRemediation,
        xp_potential: xpPotential,
        coin_potential: coinPotential,
      });
    }

    // Build single batch payload
    const batchPayload: BatchSyncPayload = {
      action: 'batch_sync',
      teacher_id: user.id,
      teacher_name: teacherProfile?.full_name || null,
      sync_timestamp: new Date().toISOString(),
      student_profiles: studentProfiles,
      summary: {
        total_students: studentProfiles.length,
        total_grades: (grades || []).length,
        total_misconceptions: totalMisconceptions,
        weak_topics_identified: totalWeakTopics,
      },
    };

    console.log('Syncing comprehensive data to Scholar:', JSON.stringify(batchPayload.summary));

    // Determine the endpoint - check if it ends with /sync-student or needs it appended
    let baseEndpoint = sisterAppEndpoint;
    const isSyncStudentEndpoint = sisterAppEndpoint.includes('/sync-student');
    
    // Track sync results
    const syncResults = {
      successful: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Try batch sync first to our own receiver, otherwise sync students individually
    const isOwnReceiver = sisterAppEndpoint.includes('receive-sister-app-data');
    
    if (isOwnReceiver) {
      // Use batch sync for our own receiver
      try {
        const { response, responseText, usedAuthMode } = await postWithAuthFallback(sisterAppEndpoint, batchPayload);
        
        if (!response.ok) {
          console.error('Batch sync failed:', response.status, responseText, `auth_mode=${usedAuthMode}`);

          try {
            await supabase.from('sister_app_sync_log').insert({
              teacher_id: user.id,
              action: 'batch_sync',
              data: {
                ...batchPayload.summary,
                class_id,
                status: 'failed',
                http_status: response.status,
                error: responseText.slice(0, 500),
              },
            });
          } catch (logError) {
            console.error('Failed to log batch sync failure:', logError);
          }

          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Batch sync failed',
              details: responseText,
              status: response.status,
              http_status: response.status,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        let responseData;
        try {
          responseData = JSON.parse(responseText);
        } catch {
          responseData = { raw: responseText };
        }

        // Log the sync action (non-fatal if logging fails)
        try {
          await supabase.from('sister_app_sync_log').insert({
            teacher_id: user.id,
            action: 'batch_sync',
            data: {
              ...batchPayload.summary,
              class_id,
              response: responseData,
            },
          });
        } catch (logErr) {
          console.error('Non-fatal: Failed to log sync action:', logErr);
        }

        return new Response(
          JSON.stringify({ 
            success: true,
            synced_students: studentProfiles.length,
            synced_grades: (grades || []).length,
            misconceptions_synced: totalMisconceptions,
            weak_topics_synced: totalWeakTopics,
            response: responseData,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (fetchError) {
        console.error('Network error:', fetchError);

        try {
          await supabase.from('sister_app_sync_log').insert({
            teacher_id: user.id,
            action: 'batch_sync',
            data: {
              ...batchPayload.summary,
              class_id,
              status: 'network_error',
              error: fetchError instanceof Error ? fetchError.message : 'Connection failed',
            },
          });
        } catch (logError) {
          console.error('Failed to log batch sync network error:', logError);
        }

        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Network error: ${fetchError instanceof Error ? fetchError.message : 'Connection failed'}`,
            http_status: 503,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // For external Scholar API - sync students in parallel batches for speed
    // Use the dedicated /sync-student endpoint for bulk student syncing
    const BATCH_SIZE = 20; // Increased batch size for faster processing
    const syncStudentEndpoint = baseEndpoint.replace('/nycologic-webhook', '/sync-student');
    console.log(`Syncing to Scholar API at ${syncStudentEndpoint} - processing ${studentProfiles.length} students in batches of ${BATCH_SIZE}...`);
    
    // Build all payloads first
    const studentPayloads = studentProfiles.map(profile => ({
      profile,
      payload: {
        action: 'sync_student',
        student_id: profile.student_id,
        student_name: profile.student_name,
        student_email: profile.student_email,  // Email for auto-linking on Scholar signup
        class_id: profile.class_id,
        class_name: profile.class_name,
        teacher_id: user.id,
        teacher_name: teacherProfile?.full_name || null,
        overall_average: profile.overall_average,
        grades: profile.grades.slice(0, 20).map(g => ({
          topic: g.topic_name,
          score: g.grade,
          regents_score: g.regents_score,
          standard: g.nys_standard,
          justification: g.grade_justification,
          date: g.created_at,
        })),
        misconceptions: profile.misconceptions.map(m => ({
          name: m.name,
          description: m.description,
          topic: m.topic_name,
          confidence: m.confidence,
          standard: m.standard,
          problem_set: m.problem_set,
          severity: m.severity,
          suggested_remedies: m.suggested_remedies,
        })),
        weak_topics: profile.weak_topics,
        remediation_recommendations: profile.recommended_remediation,
        xp_potential: profile.xp_potential,
        coin_potential: profile.coin_potential,
        sync_timestamp: new Date().toISOString(),
      },
    }));

    // Log detailed payload information for debugging data transmission issues
    console.log('=== SCHOLAR SYNC PAYLOAD DEBUG START ===');
    console.log(`Total students: ${studentPayloads.length}, Total grades: ${(grades || []).length}`);
    
    if (studentPayloads.length > 0) {
      const samplePayload = studentPayloads[0].payload;
      console.log('SAMPLE STUDENT PAYLOAD:', JSON.stringify({
        student_id: samplePayload.student_id,
        student_name: samplePayload.student_name,
        student_email: samplePayload.student_email,
        overall_average: samplePayload.overall_average,
        grades_count: samplePayload.grades?.length || 0,
        weak_topics_count: samplePayload.weak_topics?.length || 0,
        misconceptions_count: samplePayload.misconceptions?.length || 0,
        remediation_count: samplePayload.remediation_recommendations?.length || 0,
      }));
      
      // Log actual grade data samples
      if (samplePayload.grades && samplePayload.grades.length > 0) {
        console.log('SAMPLE GRADES (first 3):', JSON.stringify(samplePayload.grades.slice(0, 3)));
      }
      
      // Log actual weak topics
      if (samplePayload.weak_topics && samplePayload.weak_topics.length > 0) {
        console.log('WEAK TOPICS:', JSON.stringify(samplePayload.weak_topics));
      }
      
      // Log remediation recommendations
      if (samplePayload.remediation_recommendations && samplePayload.remediation_recommendations.length > 0) {
        console.log('REMEDIATION RECOMMENDATIONS:', JSON.stringify(samplePayload.remediation_recommendations));
      }
    }
    console.log('=== SCHOLAR SYNC PAYLOAD DEBUG END ===');

    // Process all batches in parallel using Promise.all for speed
    const allBatchPromises = [];
    for (let i = 0; i < studentPayloads.length; i += BATCH_SIZE) {
      const batch = studentPayloads.slice(i, i + BATCH_SIZE);
      
      const batchPromise = Promise.allSettled(
        batch.map(async ({ profile, payload }) => {
          const { response, responseText } = await postWithAuthFallback(syncStudentEndpoint, payload);

          if (!response.ok) {
            throw new Error(`${profile.student_name}: ${response.status} - ${responseText.slice(0, 100)}`);
          }
          return profile.student_name;
        })
      );
      
      allBatchPromises.push(batchPromise);
    }

    // Wait for all batches concurrently
    const allBatchResults = await Promise.all(allBatchPromises);
    
    // Flatten and process all results
    for (const batchResults of allBatchResults) {
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          syncResults.successful++;
        } else {
          syncResults.failed++;
          if (syncResults.errors.length < 5) {
            syncResults.errors.push(result.reason?.message || 'Unknown error');
          }
          console.error('Sync failed:', result.reason?.message);
        }
      }
    }
    
    console.log(`All batches complete: ${syncResults.successful} synced, ${syncResults.failed} failed`);

    // Log the sync action with response for dashboard status display (non-fatal)
    try {
      await supabase.from('sister_app_sync_log').insert({
        teacher_id: user.id,
        action: 'individual_sync',
        data: {
          ...batchPayload.summary,
          class_id,
          sync_results: syncResults,
          response: {
            success: syncResults.failed === 0 || syncResults.successful > 0,
            message: `Synced ${syncResults.successful} students`,
            processed: {
              students_synced: syncResults.successful,
              grades_received: (grades || []).length,
              misconceptions_tracked: totalMisconceptions,
            },
          },
        },
      });
    } catch (logErr) {
      console.error('Non-fatal: Failed to log sync action:', logErr);
    }

    const allSucceeded = syncResults.failed === 0;
    const partialSuccess = syncResults.successful > 0 && syncResults.failed > 0;

    return new Response(
      JSON.stringify({ 
        success: allSucceeded || partialSuccess,
        synced_students: syncResults.successful,
        failed_students: syncResults.failed,
        synced_grades: (grades || []).length,
        misconceptions_synced: totalMisconceptions,
        weak_topics_synced: totalWeakTopics,
        errors: syncResults.errors.length > 0 ? syncResults.errors : undefined,
        http_status: allSucceeded ? 200 : partialSuccess ? 207 : 500,
        message: allSucceeded 
          ? `Successfully synced ${syncResults.successful} students to Scholar`
          : partialSuccess
            ? `Synced ${syncResults.successful} students, ${syncResults.failed} failed`
            : `Failed to sync all ${syncResults.failed} students`,
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('Error in sync-grades-to-scholar:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message, http_status: 500 }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
