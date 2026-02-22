/**
 * ============================================================================
 * PUSH TO SISTER APP — DIRECT DATABASE WRITE
 * ============================================================================
 *
 * Writes student data directly to the Scholar Ai database using a secondary
 * Supabase client. Replaces the old webhook-based sync.
 *
 * REQUIRED SECRETS:
 *   SCHOLAR_SUPABASE_URL          – Scholar project URL
 *   SCHOLAR_SUPABASE_SERVICE_ROLE_KEY – Scholar service-role key
 *   BREVO_API_KEY                 – (optional) for email notifications
 *
 * SCHOLAR TABLES WRITTEN:
 *   external_students   – upserted on every push (student roster data)
 *   practice_sets       – one row per assignment / graded scan
 *   practice_questions  – one row per question inside a practice set
 *   notifications       – student-facing notifications
 *
 * ============================================================================
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PushRequest {
  type?:
    | "ping"
    | "grade"
    | "behavior"
    | "student_created"
    | "student_updated"
    | "roster_sync"
    | "live_session_completed"
    | "assignment_push";
  source?: "scan_genius" | "scan_analysis" | "assignment_push" | "tutorial_push";
  class_id?: string;
  class_name?: string;
  title?: string;
  description?: string;
  due_at?: string;
  standard_code?: string;
  xp_reward?: number;
  coin_reward?: number;
  printable_url?: string;
  student_id?: string;
  student_name?: string;
  student_email?: string;
  first_name?: string;
  last_name?: string;
  grade?: number;
  topic_name?: string;
  questions?: any[];
  remediation_recommendations?: string[];
  difficulty_level?: string;
  // Behavior
  xp_deduction?: number;
  coin_deduction?: number;
  reason?: string;
  notes?: string;
  // Live session
  session_code?: string;
  participation_mode?: string;
  credit_for_participation?: number;
  deduction_for_non_participation?: number;
  total_participants?: number;
  active_participants?: number;
  participant_results?: ParticipantResult[];
  // Extra student data for external_students
  overall_average?: number;
  grades?: Record<string, any>;
  misconceptions?: Record<string, any>;
  weak_topics?: Record<string, any>;
  skill_tags?: string[];
  teacher_name?: string;
}

interface ParticipantResult {
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a Scholar Supabase client (service-role, bypasses RLS).
 *  Since both apps now share the same Cloud database, we use the
 *  primary SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Falls back to
 *  SCHOLAR_* secrets for backward compatibility.                    */
// deno-lint-ignore no-explicit-any
function getScholarClient(): any {
  // Scholar is a SEPARATE database — always use SCHOLAR_* secrets
  const url = Deno.env.get("SCHOLAR_SUPABASE_URL");
  const key = Deno.env.get("SCHOLAR_SUPABASE_SERVICE_ROLE_KEY");
  console.log("Scholar DB URL:", url?.substring(0, 40) + "...");
  if (!url || !key) throw new Error("Scholar DB secrets not configured");
  return createClient(url, key);
}

/** Upsert the student into Scholar's external_students table. Returns the row id. */
async function upsertExternalStudent(
  scholar: any,
  req: PushRequest
): Promise<string | null> {
  if (!req.student_id) return null;

  const row: Record<string, unknown> = {
    external_id: req.student_id,
    full_name: req.student_name || `${req.first_name || ""} ${req.last_name || ""}`.trim(),
    first_name: req.first_name || req.student_name?.split(" ")[0] || null,
    last_name: req.last_name || req.student_name?.split(" ").slice(1).join(" ") || null,
    email: req.student_email || null,
    class_id: req.class_id || null,
    class_name: req.class_name || null,
    source: "nycologic_ai",
    sync_timestamp: new Date().toISOString(),
  };

  // Optional enrichment fields
  if (req.teacher_name) row.teacher_name = req.teacher_name;
  if (req.overall_average !== undefined) row.overall_average = req.overall_average;
  if (req.grades) row.grades = req.grades;
  if (req.misconceptions) row.misconceptions = req.misconceptions;
  if (req.weak_topics) row.weak_topics = req.weak_topics;
  if (req.remediation_recommendations)
    row.remediation_recommendations = req.remediation_recommendations;
  if (req.skill_tags) row.skill_tags = req.skill_tags;
  if (req.xp_reward !== undefined) row.xp_potential = req.xp_reward;
  if (req.coin_reward !== undefined) row.coin_potential = req.coin_reward;

  const { data, error } = await scholar
    .from("external_students")
    .upsert(row, { onConflict: "external_id" })
    .select("id")
    .single();

  if (error) {
    console.error("external_students upsert error:", error.message);
    return null;
  }
  return data?.id ?? null;
}

/** Create a practice set + questions on Scholar. */
async function createPracticeSet(
  scholar: any,
  scholarStudentId: string | null,
  req: PushRequest
) {
  // If we don't have a linked Scholar user, look it up
  let studentUserId = scholarStudentId;
  if (!studentUserId && req.student_id) {
    const { data } = await scholar
      .from("external_students")
      .select("linked_user_id")
      .eq("external_id", req.student_id)
      .maybeSingle();
    studentUserId = data?.linked_user_id ?? null;
  }

  if (!studentUserId) {
    console.log("No linked Scholar user found — skipping practice_set creation");
    return null;
  }

  const { data: ps, error: psErr } = await scholar
    .from("practice_sets")
    .insert({
      student_id: studentUserId,
      title: req.title || req.topic_name || "Assignment",
      description: req.description || null,
      source: req.source || "nycologic_ai",
      external_ref: req.student_id,
      status: req.type === "assignment_push" ? "assigned" : "graded",
      score: req.grade ?? null,
      total_questions: req.questions?.length ?? 0,
      skill_tags: req.skill_tags || [],
      xp_reward: req.xp_reward ?? 0,
      coin_reward: req.coin_reward ?? 0,
    })
    .select("id")
    .single();

  if (psErr) {
    console.error("practice_sets insert error:", psErr.message);
    return null;
  }

  // Insert practice questions
  if (req.questions?.length && ps?.id) {
    const questionRows = req.questions.map((q: any, i: number) => ({
      practice_set_id: ps.id,
      prompt: q.question || q.prompt || q.text || JSON.stringify(q),
      question_type: q.type || "multiple_choice",
      options: q.options || q.choices || [],
      answer_key: q.answer || q.correct_answer || q.answer_key || null,
      hint: q.hint || null,
      difficulty: req.difficulty_level || q.difficulty || null,
      order_index: i,
      skill_tag: q.skill_tag || q.topic || req.topic_name || null,
    }));

    const { error: qErr } = await scholar
      .from("practice_questions")
      .insert(questionRows);

    if (qErr) console.error("practice_questions insert error:", qErr.message);
  }

  return ps?.id ?? null;
}

/** Send a notification to the student inside Scholar. */
async function sendScholarNotification(
  scholar: any,
  userId: string,
  req: PushRequest,
  type: string
) {
  const { error } = await scholar.from("notifications").insert({
    user_id: userId,
    type,
    title: req.title || "Update from NYCLogic Ai",
    message: req.description || `You have a new ${type} update.`,
    icon: type === "assignment" ? "📚" : type === "behavior" ? "⚠️" : "🔔",
    data: {
      source: "nycologic_ai",
      class_name: req.class_name,
      xp_reward: req.xp_reward,
      coin_reward: req.coin_reward,
      grade: req.grade,
    },
    read: false,
  });
  if (error) console.error("notifications insert error:", error.message);
}

/** Send email notification via Brevo (non-fatal). */
async function sendEmailNotification(req: PushRequest) {
  if (!req.student_email || !req.title || req.type === "ping") return;
  const brevoApiKey = Deno.env.get("BREVO_API_KEY");
  if (!brevoApiKey) return;

  try {
    const studentFirstName =
      req.first_name || req.student_name?.split(" ")[0] || "Student";
    const questionsCount = req.questions?.length || 0;
    const questionsSection =
      questionsCount > 0
        ? `<p style="color:#555;font-size:14px;">This assignment includes <strong>${questionsCount} question${questionsCount !== 1 ? "s" : ""}</strong> for you to complete.</p>`
        : "";

    const emailHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:20px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="color:white;margin:0;font-size:22px;">📚 New Assignment</h1>
        </div>
        <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
          <p style="color:#333;font-size:16px;">Hi ${studentFirstName},</p>
          <p style="color:#555;font-size:14px;">You have a new assignment on <strong>NYCLogic Scholar AI</strong>:</p>
          <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">
            <h2 style="color:#6366f1;margin:0 0 8px 0;font-size:18px;">${req.title}</h2>
            <p style="color:#666;margin:0;font-size:14px;">Topic: ${req.topic_name || req.title}</p>
            ${req.xp_reward ? `<p style="color:#059669;margin:8px 0 0 0;font-size:14px;">🎯 Earn up to <strong>${req.xp_reward} XP</strong> and <strong>${req.coin_reward || 0} Coins</strong></p>` : ""}
          </div>
          ${questionsSection}
          <p style="color:#555;font-size:14px;">Open the <strong>Scholar App</strong> to get started. Good luck! 💪</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
          <p style="color:#999;font-size:12px;text-align:center;">NYCLogic Ai — Empowering Student Success</p>
        </div>
      </div>`;

    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": brevoApiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "NYCLogic Ai", email: "notifications@nyclogic.ai" },
        to: [{ email: req.student_email, name: req.student_name || studentFirstName }],
        subject: `📚 New Assignment: ${req.title}`,
        htmlContent: emailHtml,
      }),
    });
    console.log("Email sent to", req.student_email);
  } catch (e) {
    console.error("Email error (non-fatal):", e);
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData: PushRequest = await req.json();
    console.log("push-to-sister-app received:", JSON.stringify(requestData));

    // --- Ping: verify secrets are configured ---
    if (requestData.type === "ping") {
      try {
        getScholarClient();
        return new Response(
          JSON.stringify({ success: true, message: "Scholar DB connection configured" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({ success: false, error: (e as Error).message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const scholar = getScholarClient();

    // --- Always upsert external_students ---
    const externalStudentId = await upsertExternalStudent(scholar, requestData);
    console.log("Upserted external_student, id:", externalStudentId);

    // Resolve the Scholar user_id for notifications / practice sets
    let scholarUserId: string | null = null;
    if (requestData.student_id) {
      const { data } = await scholar
        .from("external_students")
        .select("linked_user_id")
        .eq("external_id", requestData.student_id)
        .maybeSingle();
      scholarUserId = data?.linked_user_id ?? null;
    }

    // --- Route by type ---
    let result: Record<string, unknown> = { external_student_id: externalStudentId };

    if (requestData.type === "behavior") {
      // Behavior deduction → notification only
      if (scholarUserId) {
        await sendScholarNotification(scholar, scholarUserId, {
          ...requestData,
          title: `Behavior: ${requestData.reason}`,
          description: `XP −${requestData.xp_deduction || 0}, Coins −${requestData.coin_deduction || 0}. ${requestData.notes || ""}`,
        }, "behavior");
      }
      result.action = "behavior_notification_sent";

    } else if (
      requestData.type === "student_created" ||
      requestData.type === "roster_sync" ||
      requestData.type === "student_updated"
    ) {
      // Student roster sync — already handled by upsertExternalStudent above
      result.action = "student_synced";

    } else if (requestData.type === "live_session_completed") {
      // Live session → create notifications for each participant
      if (requestData.participant_results?.length) {
        for (const p of requestData.participant_results) {
          const { data: ext } = await scholar
            .from("external_students")
            .select("linked_user_id")
            .eq("external_id", p.student_id)
            .maybeSingle();
          if (ext?.linked_user_id) {
            await sendScholarNotification(scholar, ext.linked_user_id, {
              ...requestData,
              title: `Live Session: ${requestData.title}`,
              description: `You answered ${p.correct_answers}/${p.total_questions_answered} correctly. Credit: ${p.credit_awarded}`,
              xp_reward: p.credit_awarded,
            }, "live_session");
          }
        }
      }
      result.action = "live_session_notifications_sent";

    } else if (requestData.type === "assignment_push") {
      // Assignment push → write to Scholar's assignments + questions tables
      const { data: assignment, error: assignError } = await scholar
        .from("assignments")
        .insert({
          class_id: requestData.class_id,
          title: requestData.title,
          description: requestData.description,
          subject: requestData.topic_name || "General",
          status: "active",
          xp_reward: requestData.xp_reward || 100,
          coin_reward: requestData.coin_reward || 50,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (assignError) {
        console.error("assignments insert error:", assignError.message, assignError);
      }

      // Insert questions linked to the assignment
      if (requestData.questions?.length && assignment?.id) {
        const questionRows = requestData.questions.map((q: any, i: number) => ({
          assignment_id: assignment.id,
          question_type: q.type || "multiple_choice",
          prompt: q.question || q.prompt || q.text || JSON.stringify(q),
          options: q.options || q.choices || [],
          answer_key: q.answer || q.correct_answer || q.answer_key || null,
          hint: q.hint || null,
          difficulty: requestData.difficulty_level || q.difficulty || null,
          order_index: i,
          skill_tag: q.skill_tag || q.topic || requestData.topic_name || null,
        }));

        const { error: qErr } = await scholar
          .from("questions")
          .insert(questionRows);

        if (qErr) console.error("questions insert error:", qErr.message, qErr);
      }

      result.assignment_id = assignment?.id;
      result.questions_inserted = requestData.questions?.length || 0;
      result.action = "assignment_push";

      if (scholarUserId) {
        await sendScholarNotification(scholar, scholarUserId, requestData, "assignment");
      }

      // Email notification
      await sendEmailNotification(requestData);

    } else {
      // Grade push → create practice set + notification
      const practiceSetId = await createPracticeSet(scholar, scholarUserId, requestData);
      result.practice_set_id = practiceSetId;
      result.action = "grade_pushed";

      if (scholarUserId) {
        await sendScholarNotification(scholar, scholarUserId, requestData, "assignment");
      }

      // Email notification
      await sendEmailNotification(requestData);
    }

    console.log("push-to-sister-app result:", JSON.stringify(result));
    return new Response(
      JSON.stringify({ success: true, response: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Push failed:", errMsg, error);
    return new Response(
      JSON.stringify({
        success: false,
        error: errMsg,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
