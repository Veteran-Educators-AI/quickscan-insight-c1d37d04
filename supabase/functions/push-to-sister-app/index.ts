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

/** POST data to Scholar's webhook endpoint instead of direct DB writes.
 *  The sb_secret_ key format used by Lovable Cloud is incompatible with
 *  createClient(), so we use Scholar's nycologic-webhook edge function. */
async function postToScholar(payload: Record<string, unknown>): Promise<{ success: boolean; data?: any; error?: string }> {
  const scholarUrl = Deno.env.get("SCHOLAR_SUPABASE_URL");
  const scholarKey = Deno.env.get("SCHOLAR_SUPABASE_SERVICE_ROLE_KEY");
  const scholarAnonKey = Deno.env.get("SCHOLAR_SUPABASE_ANON_KEY");
  if (!scholarUrl || !scholarKey) throw new Error("Scholar DB secrets not configured");

  const anonKey = scholarAnonKey || scholarKey;
  const webhookUrl = `${scholarUrl}/functions/v1/nycologic-webhook`;
  console.log("Scholar debug - URL:", webhookUrl, "| anonKey exists:", !!scholarAnonKey, "| anonKey length:", scholarAnonKey?.length, "| anonKey first 30:", anonKey?.substring(0, 30), "| serviceKey first 20:", scholarKey?.substring(0, 20));

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${anonKey}`,
      "apikey": anonKey,
      "x-source-app": "nycologic-ai",
      "x-service-role-key": scholarKey,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  console.log("Scholar webhook response:", response.status, text);

  if (!response.ok) {
    return { success: false, error: `Scholar webhook error ${response.status}: ${text}` };
  }

  try {
    return { success: true, data: JSON.parse(text) };
  } catch {
    return { success: true, data: text };
  }
}

// Direct DB helpers removed — all data is now sent via Scholar's webhook endpoint

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
        const scholarUrl = Deno.env.get("SCHOLAR_SUPABASE_URL");
        const scholarKey = Deno.env.get("SCHOLAR_SUPABASE_SERVICE_ROLE_KEY");
        if (!scholarUrl || !scholarKey) throw new Error("Scholar DB secrets not configured");
        
        // Test the webhook endpoint
        const testResult = await postToScholar({ type: "ping", source: "nycologic-ai" });
        return new Response(
          JSON.stringify({ success: true, message: "Scholar webhook connection configured", test: testResult }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({ success: false, error: (e as Error).message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // --- Build webhook payload and POST to Scholar ---
    const webhookPayload: Record<string, unknown> = {
      source: "nycologic-ai",
      event_type: requestData.type || "grade",
      timestamp: new Date().toISOString(),
      student_id: requestData.student_id,
      student_name: requestData.student_name,
      first_name: requestData.first_name,
      last_name: requestData.last_name,
      student_email: requestData.student_email,
      class_id: requestData.class_id,
      class_name: requestData.class_name,
      title: requestData.title,
      description: requestData.description,
      topic_name: requestData.topic_name,
      grade: requestData.grade,
      xp_reward: requestData.xp_reward,
      coin_reward: requestData.coin_reward,
      questions: requestData.questions,
      difficulty_level: requestData.difficulty_level,
      teacher_name: requestData.teacher_name,
      overall_average: requestData.overall_average,
      grades: requestData.grades,
      misconceptions: requestData.misconceptions,
      weak_topics: requestData.weak_topics,
      skill_tags: requestData.skill_tags,
      remediation_recommendations: requestData.remediation_recommendations,
    };

    // Add type-specific fields
    if (requestData.type === "behavior") {
      webhookPayload.xp_deduction = requestData.xp_deduction;
      webhookPayload.coin_deduction = requestData.coin_deduction;
      webhookPayload.reason = requestData.reason;
      webhookPayload.notes = requestData.notes;
    }

    if (requestData.type === "live_session_completed") {
      webhookPayload.session_code = requestData.session_code;
      webhookPayload.participation_mode = requestData.participation_mode;
      webhookPayload.credit_for_participation = requestData.credit_for_participation;
      webhookPayload.deduction_for_non_participation = requestData.deduction_for_non_participation;
      webhookPayload.total_participants = requestData.total_participants;
      webhookPayload.active_participants = requestData.active_participants;
      webhookPayload.participant_results = requestData.participant_results;
    }

    if (requestData.type === "assignment_push") {
      webhookPayload.due_at = requestData.due_at;
      webhookPayload.standard_code = requestData.standard_code;
      webhookPayload.printable_url = requestData.printable_url;
      webhookPayload.source = requestData.source || "nycologic_ai";
    }

    const scholarResult = await postToScholar(webhookPayload);
    console.log("Scholar webhook result:", JSON.stringify(scholarResult));

    // Send email notification for relevant types
    if (requestData.type === "assignment_push" || requestData.type === "grade") {
      await sendEmailNotification(requestData);
    }

    console.log("push-to-sister-app result:", JSON.stringify(scholarResult));
    return new Response(
      JSON.stringify({ success: true, response: scholarResult }),
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
