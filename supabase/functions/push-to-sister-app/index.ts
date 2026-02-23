/**
 * ============================================================================
 * PUSH TO SISTER APP — Scholar Webhook Integration
 * ============================================================================
 *
 * Sends data to Scholar's nycologic-webhook edge function.
 * Scholar requires an x-api-key header validated against its integration_tokens table.
 *
 * REQUIRED SECRETS:
 *   SCHOLAR_SUPABASE_URL              – Scholar project URL
 *   SCHOLAR_SUPABASE_ANON_KEY         – Scholar anon/publishable key
 *   SISTER_APP_API_KEY                – API key registered in Scholar's integration_tokens
 *   BREVO_API_KEY                     – (optional) for email notifications
 * ============================================================================
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    | "ping" | "grade" | "behavior" | "student_created" | "student_updated"
    | "roster_sync" | "live_session_completed" | "assignment_push";
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
  xp_deduction?: number;
  coin_deduction?: number;
  reason?: string;
  notes?: string;
  session_code?: string;
  participation_mode?: string;
  credit_for_participation?: number;
  deduction_for_non_participation?: number;
  total_participants?: number;
  active_participants?: number;
  participant_results?: ParticipantResult[];
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
  answers: { selected_answer: string; is_correct: boolean | null; time_taken_seconds: number | null }[];
}

// ---------------------------------------------------------------------------
// Scholar Connection
// ---------------------------------------------------------------------------

function getScholarConfig() {
  const url = Deno.env.get("SCHOLAR_SUPABASE_URL");
  const anonKey = Deno.env.get("SCHOLAR_SUPABASE_ANON_KEY");
  const sisterApiKey = Deno.env.get("SISTER_APP_API_KEY");
  if (!url) throw new Error("SCHOLAR_SUPABASE_URL not configured");
  if (!anonKey) throw new Error("SCHOLAR_SUPABASE_ANON_KEY not configured");
  if (!sisterApiKey) throw new Error("SISTER_APP_API_KEY not configured");
  return { url, anonKey, sisterApiKey };
}

/** Call Scholar's nycologic-webhook with the x-api-key header */
async function postToScholar(payload: Record<string, unknown>): Promise<{ success: boolean; data?: any; error?: string }> {
  const { url, anonKey, sisterApiKey } = getScholarConfig();
  const webhookUrl = `${url}/functions/v1/nycologic-webhook`;

  console.log("Posting to Scholar:", webhookUrl, "payload type:", payload.type || payload.action);

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": anonKey,
      "Authorization": `Bearer ${anonKey}`,
      "x-api-key": sisterApiKey,
      "x-source-app": "nycologic-ai",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  console.log("Scholar response:", response.status, text.substring(0, 500));

  if (!response.ok) {
    return { success: false, error: `Scholar error ${response.status}: ${text}` };
  }

  try {
    return { success: true, data: JSON.parse(text) };
  } catch {
    return { success: true, data: text };
  }
}

// ---------------------------------------------------------------------------
// Email (Brevo)
// ---------------------------------------------------------------------------

async function sendEmailNotification(req: PushRequest) {
  if (!req.student_email || !req.title || req.type === "ping") return;
  const brevoApiKey = Deno.env.get("BREVO_API_KEY");
  if (!brevoApiKey) return;

  try {
    const name = req.first_name || req.student_name?.split(" ")[0] || "Student";
    const qCount = req.questions?.length || 0;
    const qSection = qCount > 0
      ? `<p style="color:#555;font-size:14px;">This includes <strong>${qCount} question${qCount !== 1 ? "s" : ""}</strong>.</p>` : "";

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:20px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="color:white;margin:0;font-size:22px;">📚 New Assignment</h1>
        </div>
        <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
          <p style="color:#333;font-size:16px;">Hi ${name},</p>
          <p style="color:#555;font-size:14px;">You have a new assignment on <strong>NYCLogic Scholar AI</strong>:</p>
          <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">
            <h2 style="color:#6366f1;margin:0 0 8px 0;font-size:18px;">${req.title}</h2>
            <p style="color:#666;margin:0;font-size:14px;">Topic: ${req.topic_name || req.title}</p>
            ${req.xp_reward ? `<p style="color:#059669;margin:8px 0 0 0;font-size:14px;">🎯 Earn up to <strong>${req.xp_reward} XP</strong> and <strong>${req.coin_reward || 0} Coins</strong></p>` : ""}
          </div>
          ${qSection}
          <p style="color:#555;font-size:14px;">Open the <strong>Scholar App</strong> to get started! 💪</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
          <p style="color:#999;font-size:12px;text-align:center;">NYCLogic Ai — Empowering Student Success</p>
        </div>
      </div>`;

    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { accept: "application/json", "api-key": brevoApiKey, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { name: "NYCLogic Ai", email: "notifications@nyclogic.ai" },
        to: [{ email: req.student_email, name: req.student_name || name }],
        subject: `📚 New Assignment: ${req.title}`,
        htmlContent: html,
      }),
    });
    console.log("Email sent to", req.student_email);
  } catch (e) {
    console.error("Email error (non-fatal):", e);
  }
}

// ---------------------------------------------------------------------------
// Build Scholar Webhook Payload
// ---------------------------------------------------------------------------

function buildScholarPayload(req: PushRequest): Record<string, unknown> {
  // Scholar's webhook expects { type: "...", data: { ... } } format
  const eventType = req.type || "grade";

  if (eventType === "student_created" || eventType === "student_updated") {
    return {
      type: "student_created",
      data: {
        external_id: req.student_id,
        full_name: req.student_name || `${req.first_name || ""} ${req.last_name || ""}`.trim(),
        first_name: req.first_name,
        last_name: req.last_name,
        email: req.student_email,
        class_name: req.class_name,
        class_id: req.class_id,
        teacher_name: req.teacher_name,
        source: "nycologic",
      },
    };
  }

  if (eventType === "roster_sync") {
    return {
      type: "student_created",
      data: {
        external_id: req.student_id,
        full_name: req.student_name || `${req.first_name || ""} ${req.last_name || ""}`.trim(),
        first_name: req.first_name,
        last_name: req.last_name,
        email: req.student_email,
        class_name: req.class_name,
        class_id: req.class_id,
        teacher_name: req.teacher_name,
        source: "nycologic",
      },
    };
  }

  if (eventType === "grade") {
    return {
      type: "grade_completed",
      data: {
        student_id: req.student_id,
        assignment_title: req.title || req.topic_name,
        score: req.grade || 0,
        max_score: 100,
        percentage: req.grade || 0,
        feedback: req.description,
        xp_reward: req.xp_reward,
        coin_reward: req.coin_reward,
      },
    };
  }

  if (eventType === "behavior") {
    return {
      type: "behavior_deduction",
      data: {
        student_id: req.student_id,
        class_id: req.class_id,
        teacher_id: req.class_id, // placeholder
        reason: req.reason || "Behavior point adjustment",
        points_deducted: req.xp_deduction || 0,
        notes: req.notes,
      },
    };
  }

  if (eventType === "assignment_push") {
    return {
      type: "assignment_push",
      data: {
        student_id: req.student_id,
        student_name: req.student_name || `${req.first_name || ""} ${req.last_name || ""}`.trim(),
        title: req.title || "Assignment",
        topic_name: req.topic_name,
        description: req.description,
        xp_reward: req.xp_reward,
        coin_reward: req.coin_reward,
        questions: req.questions?.map(q => ({
          prompt: q.prompt || q.question_text || q.text,
          question_type: q.question_type || q.type || "multiple_choice",
          options: q.options || q.choices,
          answer_key: q.answer_key || q.correct_answer || q.answer,
          hint: q.hint,
          difficulty: q.difficulty,
          skill_tag: q.skill_tag || q.topic,
        })),
      },
    };
  }

  if (eventType === "live_session_completed") {
    // Send individual results for each participant
    return {
      type: "grade_completed",
      data: {
        student_id: req.student_id,
        assignment_title: `Live Session: ${req.title || req.session_code}`,
        score: req.grade || 0,
        max_score: 100,
        percentage: req.grade || 0,
        xp_reward: req.xp_reward || req.credit_for_participation,
        coin_reward: req.coin_reward,
      },
    };
  }

  // Fallback
  return {
    type: eventType,
    data: {
      student_id: req.student_id,
      title: req.title,
      topic_name: req.topic_name,
      grade: req.grade,
    },
  };
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData: PushRequest = await req.json();
    console.log("push-to-sister-app received:", JSON.stringify(requestData).substring(0, 500));

    // --- Ping ---
    if (requestData.type === "ping") {
      try {
        const config = getScholarConfig();
        // Test the webhook with a simple student_created
        const testResult = await postToScholar({
          type: "student_created",
          data: {
            external_id: "ping-test",
            full_name: "Ping Test",
            source: "nycologic",
          },
        });
        return new Response(
          JSON.stringify({ success: true, message: "Scholar webhook test", result: testResult, url_prefix: config.url.substring(0, 35) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({ success: false, error: (e as Error).message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // --- Build and send Scholar payload ---
    const payload = buildScholarPayload(requestData);
    const result = await postToScholar(payload);
    console.log("Scholar result:", JSON.stringify(result).substring(0, 500));

    // For live sessions, process each participant individually
    if (requestData.type === "live_session_completed" && requestData.participant_results) {
      for (const participant of requestData.participant_results) {
        if (participant.participated) {
          const participantPayload = buildScholarPayload({
            ...requestData,
            student_id: participant.student_id,
            student_name: participant.student_name,
            grade: participant.accuracy,
            xp_reward: participant.credit_awarded,
          });
          await postToScholar(participantPayload);
        }
      }
    }

    // Send email for relevant types
    if (requestData.type === "assignment_push" || requestData.type === "grade") {
      await sendEmailNotification(requestData);
    }

    return new Response(
      JSON.stringify({ success: result.success, response: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Push failed:", errMsg, error);
    return new Response(
      JSON.stringify({ success: false, error: errMsg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
