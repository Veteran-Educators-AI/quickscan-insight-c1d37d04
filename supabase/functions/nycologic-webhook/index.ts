import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, x-source-app",
};

interface AssignmentPayload {
  type: "assignment";
  data: {
    external_ref: string;
    class_code: string;
    title: string;
    subject?: string;
    description?: string;
    due_at: string;
    printable_url?: string;
    xp_reward?: number;
    coin_reward?: number;
    questions?: Array<{
      prompt: string;
      question_type: "multiple_choice" | "short_answer" | "numeric" | "drag_order" | "matching";
      options?: string[];
      answer_key: unknown;
      hint?: string;
      difficulty?: number;
      skill_tag?: string;
    }>;
  };
}

interface StudentProfilePayload {
  type: "student_profile";
  data: {
    user_id: string;
    grade_level?: number;
    reading_level?: string;
    math_level?: string;
    skill_tags?: string[];
    strengths?: string[];
    weaknesses?: string[];
    accommodations?: string[];
  };
}

interface StatusQueryPayload {
  type: "status_query";
  data: {
    external_ref: string;
  };
}

interface RemediationPayload {
  type: "remediation";
  data: {
    student_id: string; // The student's user_id in Scholar
    external_ref?: string; // Reference ID from NYCLogic AI
    title: string;
    description?: string;
    skill_tags: string[]; // Skills/weaknesses being targeted
    printable_url?: string; // URL to downloadable PDF worksheet
    xp_reward?: number;
    coin_reward?: number;
    questions: Array<{
      prompt: string;
      question_type: "multiple_choice" | "short_answer" | "numeric" | "drag_order" | "matching";
      options?: string[];
      answer_key: unknown;
      hint?: string;
      difficulty?: number;
      skill_tag?: string;
    }>;
  };
}

interface TopicPerformance {
  topic: string;
  standardCode: string;
  questionsAttempted: number;
  questionsCorrect: number;
  masteryPercentage: number;
}

interface PracticeSessionPayload {
  source: "scholar-app";
  timestamp: string;
  event_type: "practice_session_completed";
  data: {
    student_id: string;
    student_email?: string;
    exam_type?: string;
    subject: string;
    questions_attempted: number;
    questions_correct: number;
    percentage: number;
    max_streak?: number;
    timed_mode?: boolean;
    topic_performance: TopicPerformance[];
    completed_at: string;
    request_plan_adjustment: boolean;
  };
}

// Payloads from push-to-sister-app (grade and student sync)
interface GradeCompletedPayload {
  action: "grade_completed";
  student_id: string;
  data: {
    activity_type: string;
    activity_name: string;
    score: number;
    xp_earned?: number;
    coins_earned?: number;
    topic_name?: string;
    description?: string;
    standard_code?: string;
    class_id?: string;
    student_name?: string;
    printable_url?: string;
    due_at?: string;
    questions?: any[];
    timestamp: string;
  };
}

interface StudentCreatedPayload {
  action: "student_created";
  student_id: string;
  data: {
    first_name?: string;
    last_name?: string;
    student_name?: string;
    email?: string;
    class_id?: string;
    class_name?: string;
    timestamp: string;
  };
}

interface BehaviorDeductionPayload {
  action: "behavior_deduction";
  student_id: string;
  data: {
    activity_type: string;
    activity_name: string;
    xp_deducted?: number;
    coins_deducted?: number;
    xp_earned?: number;
    coins_earned?: number;
    reason?: string;
    notes?: string;
    class_id?: string;
    student_name?: string;
    timestamp: string;
  };
}

interface WorkSubmittedPayload {
  action: "work_submitted";
  student_id: string;
  data: {
    student_name?: string;
    class_id?: string;
    assignment_title?: string;
    topic_name?: string;
    standard_code?: string;
    score?: number;
    questions_attempted?: number;
    questions_correct?: number;
    time_spent_minutes?: number;
    answers?: Array<{
      questionNumber: number;
      studentAnswer: string;
      isCorrect: boolean;
      correctAnswer?: string;
    }>;
    completed_at?: string;
    source_assignment_id?: string;
  };
}

type WebhookPayload = AssignmentPayload | StudentProfilePayload | StatusQueryPayload | RemediationPayload | PracticeSessionPayload | GradeCompletedPayload | StudentCreatedPayload | BehaviorDeductionPayload | WorkSubmittedPayload;

async function verifyApiKey(apiKey: string, supabaseUrl: string, supabaseKey: string): Promise<boolean> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Hash the API key and check against stored hashes
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const tokenHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

  console.log("Checking API key, hash:", tokenHash.substring(0, 20) + "...");

  // Check integration_tokens table first
  const { data: token, error } = await supabase
    .from("integration_tokens")
    .select("id, is_active")
    .eq("token_hash", tokenHash)
    .eq("is_active", true)
    .single();

  if (token) {
    await supabase
      .from("integration_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", token.id);
    console.log("Valid token found in integration_tokens");
    return true;
  }

  // Also check api_tokens table
  const { data: apiToken } = await supabase
    .from("api_tokens")
    .select("id, is_active")
    .eq("token_hash", tokenHash)
    .eq("is_active", true)
    .single();

  if (apiToken) {
    await supabase
      .from("api_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", apiToken.id);
    console.log("Valid token found in api_tokens");
    return true;
  }

  // Legacy support: check if the plain API key matches a token_hash directly
  const { data: legacyToken } = await supabase
    .from("integration_tokens")
    .select("id, is_active")
    .eq("token_hash", apiKey)
    .eq("is_active", true)
    .single();

  if (legacyToken) {
    await supabase
      .from("integration_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", legacyToken.id);
    console.log("Valid legacy token found");
    return true;
  }

  console.log("No valid token found for hash:", tokenHash.substring(0, 20) + "...");
  return false;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check for x-source-app header for Scholar app authentication
    const sourceApp = req.headers.get("x-source-app");
    
    // Verify API key (skip for scholar-app with valid source header)
    const apiKey = req.headers.get("x-api-key");
    if (sourceApp !== "scholar-app") {
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "Missing API key" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const isValid = await verifyApiKey(apiKey, supabaseUrl, supabaseServiceKey);
      if (!isValid) {
        return new Response(
          JSON.stringify({ error: "Invalid or inactive API key" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      console.log("Received request from scholar-app");
    }

    const payload = await req.json();
    
    // Determine the event type - support 'type', 'event_type', and 'action' fields
    // 'action' is used by push-to-sister-app (grade_completed, student_created, behavior_deduction)
    const eventType = payload.action || payload.type || payload.event_type;
    console.log(`Processing webhook event: ${eventType}`);
    
    switch (eventType) {
      case "practice_session_completed": {
        // Handle practice session data from Scholar app
        const sessionData = payload.data;
        console.log(`Processing practice session for student ${sessionData.student_id}`);
        
        // Find student by ID or email
        let studentId = sessionData.student_id;
        let studentRecord = null;
        
        // Try to find by user_id first
        const { data: studentByUserId } = await supabase
          .from("students")
          .select("id, first_name, last_name, class_id")
          .eq("user_id", studentId)
          .single();
        
        if (studentByUserId) {
          studentRecord = studentByUserId;
        } else if (sessionData.student_email) {
          // Fallback to email lookup
          const { data: studentByEmail } = await supabase
            .from("students")
            .select("id, first_name, last_name, class_id")
            .eq("email", sessionData.student_email)
            .single();
          
          if (studentByEmail) {
            studentRecord = studentByEmail;
          }
        }

        // Also try direct ID lookup
        if (!studentRecord) {
          const { data: studentById } = await supabase
            .from("students")
            .select("id, first_name, last_name, class_id")
            .eq("id", studentId)
            .maybeSingle();
          if (studentById) {
            studentRecord = studentById;
          }
        }

        // Resolve teacher_id
        let teacherIdForLog: string | null = null;
        if (studentRecord?.class_id) {
          try {
            const { data: classInfo } = await supabase
              .from("classes")
              .select("teacher_id")
              .eq("id", studentRecord.class_id)
              .single();
            teacherIdForLog = classInfo?.teacher_id || null;
          } catch (err) {
            console.error("Failed to resolve teacher_id:", err);
          }
        }
        
        // Update mastery levels from topic_performance array
        let masteryUpdated = false;
        let gradesCreatedCount = 0;
        if (sessionData.topic_performance && sessionData.topic_performance.length > 0) {
          for (const topic of sessionData.topic_performance) {
            try {
              // Record grade history for each topic
              const { error: gradeError } = await supabase
                .from("grade_history")
                .insert({
                  student_id: studentRecord?.id || studentId,
                  teacher_id: teacherIdForLog,
                  topic_name: topic.topic,
                  grade: topic.masteryPercentage,
                  nys_standard: topic.standardCode,
                  raw_score_earned: topic.questionsCorrect,
                  raw_score_possible: topic.questionsAttempted,
                  grade_justification: `Scholar app practice: ${topic.questionsCorrect}/${topic.questionsAttempted} correct`,
                });
              
              if (!gradeError) {
                masteryUpdated = true;
                gradesCreatedCount++;
                console.log(`Updated mastery for topic ${topic.topic}: ${topic.masteryPercentage}%`);
              } else {
                console.error(`Failed to update mastery for ${topic.topic}:`, gradeError);
              }
            } catch (topicErr) {
              console.error(`Error processing topic ${topic.topic}:`, topicErr);
            }
          }
        }

        // LOG TO sister_app_sync_log so InboundScholarDataPanel can see it
        if (teacherIdForLog) {
          try {
            const studentName = studentRecord
              ? `${studentRecord.first_name} ${studentRecord.last_name}`
              : sessionData.student_email || studentId;

            await supabase.from("sister_app_sync_log").insert({
              teacher_id: teacherIdForLog,
              student_id: studentRecord?.id || studentId,
              action: "sync_practice_session",
              data: {
                student_name: studentName,
                activity_name: `${sessionData.subject || "Practice"} Session`,
                topic_name: sessionData.topic_performance?.[0]?.topic || sessionData.subject || "Practice Session",
                score: sessionData.percentage,
                questions_attempted: sessionData.questions_attempted,
                questions_correct: sessionData.questions_correct,
                completed_at: sessionData.completed_at,
                exam_type: sessionData.exam_type,
                max_streak: sessionData.max_streak,
                timed_mode: sessionData.timed_mode,
                topics_processed: sessionData.topic_performance?.length || 0,
                grades_created: gradesCreatedCount,
                topic_details: sessionData.topic_performance?.map((t: TopicPerformance) => ({
                  topic: t.topic,
                  standard: t.standardCode,
                  score: t.masteryPercentage,
                  correct: t.questionsCorrect,
                  attempted: t.questionsAttempted,
                })),
              },
              source_app: "scholar_app",
              processed: masteryUpdated,
              processed_at: masteryUpdated ? new Date().toISOString() : null,
            });
            console.log("Logged practice session to sister_app_sync_log for teacher:", teacherIdForLog);
          } catch (logErr) {
            console.error("Non-fatal: Failed to log practice session to sync log:", logErr);
          }
        }
        
        // Handle study plan adjustment if requested
        let planUpdated = false;
        if (sessionData.request_plan_adjustment) {
          console.log("Study plan adjustment requested");
          
          // Identify weak topics (below 70% mastery)
          const weakTopics = sessionData.topic_performance
            ?.filter((t: TopicPerformance) => t.masteryPercentage < 70)
            .map((t: TopicPerformance) => ({
              topic: t.topic,
              standard: t.standardCode,
              mastery: t.masteryPercentage,
            })) || [];
          
          // Identify strong topics (80%+ mastery)
          const strongTopics = sessionData.topic_performance
            ?.filter((t: TopicPerformance) => t.masteryPercentage >= 80)
            .map((t: TopicPerformance) => t.topic) || [];
          
          // Create study plan recommendation
          if (weakTopics.length > 0) {
            const focusAreas = weakTopics.slice(0, 3).map((w: { topic: string; standard: string; mastery: number }) => 
              `${w.topic} (${w.standard}): ${w.mastery}% mastery`
            );
            
            // Store recommendation as a diagnostic result or note
            try {
              await supabase
                .from("diagnostic_results")
                .insert({
                  student_id: studentRecord?.id || studentId,
                  strengths: strongTopics,
                  weaknesses: weakTopics.map((w: { topic: string }) => w.topic),
                  recommendations: {
                    source: "scholar-app",
                    session_date: sessionData.completed_at,
                    overall_percentage: sessionData.percentage,
                    focus_areas: focusAreas,
                    strong_topics: strongTopics,
                    max_streak: sessionData.max_streak,
                    timed_mode: sessionData.timed_mode,
                  },
                });
              
              planUpdated = true;
              console.log(`Study plan updated with ${weakTopics.length} focus areas`);
            } catch (diagErr) {
              console.error("Failed to save diagnostic result (non-fatal):", diagErr);
            }
          }
        }
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            plan_updated: planUpdated,
            mastery_updated: masteryUpdated,
            topics_processed: sessionData.topic_performance?.length || 0,
            grades_created: gradesCreatedCount,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "assignment": {
        const { data } = payload as AssignmentPayload;
        
        // Find class by code
        const { data: classData, error: classError } = await supabase
          .from("classes")
          .select("id")
          .eq("class_code", data.class_code)
          .single();

        if (classError || !classData) {
          return new Response(
            JSON.stringify({ error: "Class not found", class_code: data.class_code }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Create assignment
        const { data: assignment, error: assignmentError } = await supabase
          .from("assignments")
          .insert({
            class_id: classData.id,
            external_ref: data.external_ref,
            title: data.title,
            subject: data.subject,
            description: data.description,
            due_at: data.due_at,
            printable_url: data.printable_url,
            xp_reward: data.xp_reward || 50,
            coin_reward: data.coin_reward || 10,
            status: "active",
          })
          .select("id")
          .single();

        if (assignmentError) {
          return new Response(
            JSON.stringify({ error: "Failed to create assignment", details: assignmentError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Create questions if provided
        if (data.questions && data.questions.length > 0) {
          const questionsToInsert = data.questions.map((q, index) => ({
            assignment_id: assignment.id,
            prompt: q.prompt,
            question_type: q.question_type,
            options: q.options ? JSON.stringify(q.options) : null,
            answer_key: q.answer_key,
            hint: q.hint,
            difficulty: q.difficulty || 1,
            skill_tag: q.skill_tag,
            order_index: index,
          }));

          await supabase.from("questions").insert(questionsToInsert);
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            assignment_id: assignment.id,
            status: "received"
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "student_profile": {
        const { data } = payload as StudentProfilePayload;
        
        const { error } = await supabase
          .from("student_profiles")
          .update({
            grade_level: data.grade_level,
            reading_level: data.reading_level,
            math_level: data.math_level,
            skill_tags: data.skill_tags,
            strengths: data.strengths,
            weaknesses: data.weaknesses,
            accommodations: data.accommodations,
          })
          .eq("user_id", data.user_id);

        if (error) {
          return new Response(
            JSON.stringify({ error: "Failed to update student profile", details: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, status: "profile_updated" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "remediation": {
        const { data } = payload as RemediationPayload;
        
        // Verify student exists
        const { data: studentProfile, error: studentError } = await supabase
          .from("student_profiles")
          .select("user_id")
          .eq("user_id", data.student_id)
          .single();

        if (studentError || !studentProfile) {
          return new Response(
            JSON.stringify({ error: "Student not found", student_id: data.student_id }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Create practice set
        const { data: practiceSet, error: practiceError } = await supabase
          .from("practice_sets")
          .insert({
            student_id: data.student_id,
            title: data.title,
            description: data.description || `Practice exercises to strengthen: ${data.skill_tags.join(", ")}`,
            skill_tags: data.skill_tags,
            source: "nycologic",
            external_ref: data.external_ref,
            printable_url: data.printable_url,
            xp_reward: data.xp_reward || 25,
            coin_reward: data.coin_reward || 5,
            total_questions: data.questions.length,
            status: "pending",
          })
          .select("id")
          .single();

        if (practiceError) {
          console.error("Failed to create practice set:", practiceError);
          return new Response(
            JSON.stringify({ error: "Failed to create practice set", details: practiceError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Create practice questions
        if (data.questions && data.questions.length > 0) {
          const questionsToInsert = data.questions.map((q, index) => ({
            practice_set_id: practiceSet.id,
            prompt: q.prompt,
            question_type: q.question_type,
            options: q.options ? q.options : null,
            answer_key: q.answer_key,
            hint: q.hint,
            difficulty: q.difficulty || 1,
            skill_tag: q.skill_tag,
            order_index: index,
          }));

          const { error: questionsError } = await supabase
            .from("practice_questions")
            .insert(questionsToInsert);

          if (questionsError) {
            console.error("Failed to create practice questions:", questionsError);
            // Clean up the practice set
            await supabase.from("practice_sets").delete().eq("id", practiceSet.id);
            return new Response(
              JSON.stringify({ error: "Failed to create practice questions", details: questionsError.message }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        // Create notification for the student
        const skillList = data.skill_tags.slice(0, 2).join(" & ");
        const { error: notifError } = await supabase
          .from("notifications")
          .insert({
            user_id: data.student_id,
            type: "remediation",
            title: "📚 New Practice Available!",
            message: `You have a new practice set: "${data.title}" to help with ${skillList}. Complete it to earn ${data.xp_reward || 25} XP and ${data.coin_reward || 5} coins!`,
            icon: "📝",
            data: {
              practice_set_id: practiceSet.id,
              skill_tags: data.skill_tags,
              xp_reward: data.xp_reward || 25,
              coin_reward: data.coin_reward || 5,
            },
          });

        if (notifError) {
          console.error("Failed to create notification:", notifError);
          // Don't fail the whole request for notification failure
        }

        // Update student weaknesses if skill_tags provided
        if (data.skill_tags && data.skill_tags.length > 0) {
          const { data: currentProfile } = await supabase
            .from("student_profiles")
            .select("weaknesses")
            .eq("user_id", data.student_id)
            .single();

          const existingWeaknesses = currentProfile?.weaknesses || [];
          const newWeaknesses = [...new Set([...existingWeaknesses, ...data.skill_tags])];

          await supabase
            .from("student_profiles")
            .update({ weaknesses: newWeaknesses })
            .eq("user_id", data.student_id);
        }

        // Auto-generate skill games from remediation
        const gameTypes = ["flashcard_battle", "timed_challenge", "matching_puzzle"];
        for (const skillTag of data.skill_tags.slice(0, 2)) {
          const gameType = gameTypes[Math.floor(Math.random() * gameTypes.length)];
          const gameData = gameType === "flashcard_battle" 
            ? { cards: data.questions.slice(0, 6).map((q, i) => ({ id: `card-${i}`, front: q.prompt, back: String(q.answer_key), hint: q.hint })) }
            : gameType === "timed_challenge"
            ? { questions: data.questions.slice(0, 6).map((q, i) => ({ id: `q-${i}`, prompt: q.prompt, options: q.options || [], correctAnswer: String(q.answer_key), hint: q.hint })), timePerQuestion: 15 }
            : { pairs: data.questions.slice(0, 6).map((q, i) => ({ id: `pair-${i}`, term: q.prompt.substring(0, 50), definition: String(q.answer_key) })) };

          await supabase.from("skill_games").insert({
            student_id: data.student_id,
            game_type: gameType,
            skill_tag: skillTag,
            title: `${skillTag} ${gameType === "flashcard_battle" ? "Flashcards" : gameType === "timed_challenge" ? "Challenge" : "Match"}`,
            difficulty: Math.min(3, Math.max(1, data.questions[0]?.difficulty || 2)),
            game_data: gameData,
            xp_reward: 15,
            coin_reward: 5,
            source: "nycologic",
            external_ref: data.external_ref,
          });
        }

        console.log(`Created remediation practice set ${practiceSet.id} for student ${data.student_id}`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            practice_set_id: practiceSet.id,
            questions_count: data.questions.length,
            status: "remediation_created",
            notification_sent: !notifError,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "status_query": {
        const { data } = payload as StatusQueryPayload;
        
        const { data: assignment, error } = await supabase
          .from("assignments")
          .select(`
            id,
            status,
            attempts (
              id,
              student_id,
              status,
              created_at,
              updated_at
            )
          `)
          .eq("external_ref", data.external_ref)
          .single();

        if (error || !assignment) {
          return new Response(
            JSON.stringify({ error: "Assignment not found", external_ref: data.external_ref }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            assignment_id: assignment.id,
            status: assignment.status,
            attempts: assignment.attempts
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ================================================================
      // HANDLERS FOR push-to-sister-app PAYLOADS
      // ================================================================

      case "grade_completed": {
        // Handle grade data pushed from NYCLogic AI scan analysis
        const gradeData = payload.data;
        console.log(`Processing grade completion for student ${payload.student_id}`);
        
        // Find or validate student
        const { data: studentRecord } = await supabase
          .from("students")
          .select("id, first_name, last_name, class_id")
          .eq("id", payload.student_id)
          .maybeSingle();
        
        // Log the incoming grade data (non-fatal if table doesn't exist)
        try {
          const { error: logError } = await supabase
            .from("inbound_scholar_data")
            .insert({
              source_app: "nycologic-ai",
              event_type: "grade_completed",
              student_id: studentRecord?.id || null,
              student_name: gradeData.student_name,
              class_id: gradeData.class_id,
              payload: gradeData,
              status: "pending",
            });
          
          if (logError) {
            console.error("Failed to log grade data (non-fatal):", logError);
          }
        } catch (logErr) {
          console.error("Non-fatal: inbound_scholar_data insert failed:", logErr);
        }
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            status: "grade_received",
            student_found: !!studentRecord,
            topic: gradeData.topic_name,
            score: gradeData.score,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "student_created": {
        // Handle new student creation sync from NYCLogic AI
        const studentData = payload.data;
        console.log(`Processing student creation: ${studentData.student_name}`);
        
        // Log the incoming student data for review (non-fatal)
        try {
          const { error: logError } = await supabase
            .from("inbound_scholar_data")
            .insert({
              source_app: "nycologic-ai",
              event_type: "student_created",
              student_id: payload.student_id,
              student_name: studentData.student_name || `${studentData.first_name} ${studentData.last_name}`,
              class_id: studentData.class_id,
              payload: studentData,
              status: "pending",
            });
          
          if (logError) {
            console.error("Failed to log student creation (non-fatal):", logError);
          }
        } catch (logErr) {
          console.error("Non-fatal: inbound_scholar_data insert failed:", logErr);
        }
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            status: "student_received",
            student_name: studentData.student_name || `${studentData.first_name} ${studentData.last_name}`,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "behavior_deduction": {
        // Handle behavior deduction from NYCLogic AI
        const behaviorData = payload.data;
        console.log(`Processing behavior deduction for student ${payload.student_id}`);
        
        // Log the behavior data (non-fatal)
        try {
          const { error: logError } = await supabase
            .from("inbound_scholar_data")
            .insert({
              source_app: "nycologic-ai",
              event_type: "behavior_deduction",
              student_id: payload.student_id,
              student_name: behaviorData.student_name,
              class_id: behaviorData.class_id,
              payload: behaviorData,
              status: "pending",
            });
          
          if (logError) {
            console.error("Failed to log behavior deduction (non-fatal):", logError);
          }
        } catch (logErr) {
          console.error("Non-fatal: inbound_scholar_data insert failed:", logErr);
        }
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            status: "behavior_deduction_received",
            reason: behaviorData.reason,
            xp_deducted: behaviorData.xp_deducted,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "work_submitted": {
        // Handle completed work pushed from Scholar App by student
        const workData = (payload as WorkSubmittedPayload).data;
        const studentId = payload.student_id;
        console.log(`Processing work submission from student ${studentId}: ${workData.assignment_title || workData.topic_name}`);

        // Find student record
        const { data: studentRec } = await supabase
          .from("students")
          .select("id, first_name, last_name, class_id")
          .eq("id", studentId)
          .maybeSingle();

        // Resolve teacher from class
        let resolvedTeacherId: string | null = null;
        const classId = workData.class_id || studentRec?.class_id;
        if (classId) {
          const { data: classInfo } = await supabase
            .from("classes")
            .select("teacher_id")
            .eq("id", classId)
            .single();
          resolvedTeacherId = classInfo?.teacher_id || null;
        }

        // Save grade to grade_history if score is present
        let gradeSaved = false;
        if (workData.score !== undefined && resolvedTeacherId) {
          const { error: gradeError } = await supabase
            .from("grade_history")
            .insert({
              student_id: studentRec?.id || studentId,
              teacher_id: resolvedTeacherId,
              topic_name: workData.topic_name || workData.assignment_title || "Scholar App Submission",
              grade: workData.score,
              nys_standard: workData.standard_code || null,
              raw_score_earned: workData.questions_correct || null,
              raw_score_possible: workData.questions_attempted || null,
              grade_justification: `Student submitted from Scholar App: ${workData.assignment_title || workData.topic_name || "Work"} (${workData.questions_correct || 0}/${workData.questions_attempted || 0} correct)`,
            });
          gradeSaved = !gradeError;
          if (gradeError) console.error("Failed to save grade:", gradeError);
        }

        // Log to sister_app_sync_log for teacher review
        if (resolvedTeacherId) {
          try {
            await supabase.from("sister_app_sync_log").insert({
              teacher_id: resolvedTeacherId,
              student_id: studentRec?.id || studentId,
              action: "work_submitted",
              data: {
                student_name: workData.student_name || (studentRec ? `${studentRec.first_name} ${studentRec.last_name}` : "Unknown"),
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
                grade_saved: gradeSaved,
              },
              source_app: "scholar_app",
              processed: false,
            });
          } catch (logErr) {
            console.error("Non-fatal: Failed to log work submission:", logErr);
          }

          // Send push notification to teacher
          try {
            const studentName = workData.student_name || (studentRec ? `${studentRec.first_name} ${studentRec.last_name}` : "A student");
            const scoreText = workData.score !== undefined ? ` (${workData.score}%)` : "";
            const topicText = workData.assignment_title || workData.topic_name || "their work";

            const notifPayload = {
              userId: resolvedTeacherId,
              title: "📝 Student Work Submitted",
              body: `${studentName} submitted ${topicText}${scoreText}`,
              data: { url: "/reports" },
            };

            const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
            const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

            await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify(notifPayload),
            });
            console.log("Push notification sent to teacher:", resolvedTeacherId);
          } catch (pushErr) {
            console.error("Non-fatal: Failed to send push notification:", pushErr);
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            status: "work_received",
            student_found: !!studentRec,
            grade_saved: gradeSaved,
            topic: workData.topic_name,
            score: workData.score,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        console.error(`Unknown payload type: ${eventType}`);
        return new Response(
          JSON.stringify({ error: "Unknown payload type", received_type: eventType }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
