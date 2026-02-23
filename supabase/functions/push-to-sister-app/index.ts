/**
 * ============================================================================
 * PUSH TO SISTER APP — HYBRID APPROACH
 * ============================================================================
 *
 * Uses Scholar's edge functions for writes (they may have verify_jwt=false)
 * and REST API (PostgREST) for reads (using anon key).
 *
 * Falls back to receive-sister-app-data edge function if nycologic-webhook
 * is not available.
 *
 * REQUIRED SECRETS:
 *   SCHOLAR_SUPABASE_URL              – Scholar project URL
 *   SCHOLAR_SUPABASE_ANON_KEY         – Scholar anon/publishable key  
 *   SCHOLAR_SUPABASE_SERVICE_ROLE_KEY – Scholar service-role key (sb_secret_)
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
  const serviceKey = Deno.env.get("SCHOLAR_SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey) throw new Error("Scholar secrets not configured (need URL + anon key)");
  return { url, anonKey, serviceKey: serviceKey || anonKey };
}

/** Call a Scholar edge function (tries multiple function names) */
async function callScholarEdgeFunction(payload: Record<string, unknown>): Promise<{ success: boolean; data?: any; error?: string }> {
  const { url, anonKey, serviceKey } = getScholarConfig();

  // Try these Scholar edge functions in order
  const functionNames = ["receive-sister-app-data", "nycologic-webhook"];

  for (const funcName of functionNames) {
    const fullUrl = `${url}/functions/v1/${funcName}`;
    console.log(`Trying Scholar function: ${funcName}`);

    try {
      const response = await fetch(fullUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": anonKey,
          "Authorization": `Bearer ${serviceKey}`,
          "x-source-app": "nycologic-ai",
        },
        body: JSON.stringify(payload),
      });

      const text = await response.text();
      console.log(`Scholar ${funcName}: ${response.status} ${text.substring(0, 300)}`);

      if (response.status === 404) {
        console.log(`Function ${funcName} not found, trying next...`);
        continue;
      }

      if (response.status === 401) {
        // Try again with anon key as Authorization (some functions have verify_jwt=false)
        const retryResponse = await fetch(fullUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": anonKey,
            "Authorization": `Bearer ${anonKey}`,
            "x-source-app": "nycologic-ai",
            "x-service-key": serviceKey,
          },
          body: JSON.stringify(payload),
        });

        const retryText = await retryResponse.text();
        console.log(`Scholar ${funcName} retry: ${retryResponse.status} ${retryText.substring(0, 300)}`);

        if (retryResponse.ok) {
          try { return { success: true, data: JSON.parse(retryText) }; } catch { return { success: true, data: retryText }; }
        }
        // If retry also fails, continue to next function
        continue;
      }

      if (!response.ok) {
        return { success: false, error: `${funcName} error ${response.status}: ${text}` };
      }

      try { return { success: true, data: JSON.parse(text) }; } catch { return { success: true, data: text }; }
    } catch (e) {
      console.error(`Error calling ${funcName}:`, e);
      continue;
    }
  }

  return { success: false, error: "No Scholar edge function responded successfully" };
}

/** Read from Scholar's REST API (anon role, read-only) */
async function scholarRead(path: string): Promise<{ success: boolean; data?: any; error?: string }> {
  const { url, anonKey } = getScholarConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: { "apikey": anonKey, "Authorization": `Bearer ${anonKey}` },
  });
  const text = await response.text();
  if (!response.ok) return { success: false, error: `REST ${response.status}: ${text}` };
  try { return { success: true, data: JSON.parse(text) }; } catch { return { success: true, data: text }; }
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
// Build Payload
// ---------------------------------------------------------------------------

function buildScholarPayload(req: PushRequest): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    source: "nycologic-ai",
    event_type: req.type || "grade",
    timestamp: new Date().toISOString(),
    student_id: req.student_id,
    student_name: req.student_name,
    first_name: req.first_name,
    last_name: req.last_name,
    student_email: req.student_email,
    class_id: req.class_id,
    class_name: req.class_name,
    title: req.title,
    description: req.description,
    topic_name: req.topic_name,
    grade: req.grade,
    xp_reward: req.xp_reward,
    coin_reward: req.coin_reward,
    questions: req.questions,
    difficulty_level: req.difficulty_level,
    teacher_name: req.teacher_name,
    overall_average: req.overall_average,
    grades: req.grades,
    misconceptions: req.misconceptions,
    weak_topics: req.weak_topics,
    skill_tags: req.skill_tags,
    remediation_recommendations: req.remediation_recommendations,
  };

  if (req.type === "behavior") {
    Object.assign(payload, { xp_deduction: req.xp_deduction, coin_deduction: req.coin_deduction, reason: req.reason, notes: req.notes });
  }
  if (req.type === "live_session_completed") {
    Object.assign(payload, {
      session_code: req.session_code, participation_mode: req.participation_mode,
      credit_for_participation: req.credit_for_participation, deduction_for_non_participation: req.deduction_for_non_participation,
      total_participants: req.total_participants, active_participants: req.active_participants, participant_results: req.participant_results,
    });
  }
  if (req.type === "assignment_push") {
    Object.assign(payload, { due_at: req.due_at, standard_code: req.standard_code, printable_url: req.printable_url, source: req.source || "nycologic_ai" });
  }

  return payload;
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
        const readTest = await scholarRead("external_students?select=id&limit=1");
        const funcTest = await callScholarEdgeFunction({ source: "nycologic-ai", event_type: "ping", timestamp: new Date().toISOString() });
        return new Response(
          JSON.stringify({ success: true, message: "Scholar connection test", rest_api: readTest, edge_function: funcTest, url_prefix: config.url.substring(0, 30) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({ success: false, error: (e as Error).message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // --- Send data to Scholar via edge function ---
    const payload = buildScholarPayload(requestData);
    const result = await callScholarEdgeFunction(payload);
    console.log("Scholar result:", JSON.stringify(result).substring(0, 500));

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
