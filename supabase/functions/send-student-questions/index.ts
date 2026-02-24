import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const brevoApiKey = Deno.env.get("BREVO_API_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendQuestionRequest {
  studentId: string;
  questionId: string;
  assessmentId?: string;
  answerChoices: { label: string; value: string }[];
}

interface SubmitAnswerRequest {
  attemptId: string;
  selectedAnswer: string;
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function sendQuestionEmail(request: SendQuestionRequest): Promise<Response> {
  const { studentId, questionId, assessmentId, answerChoices } = request;

  // Get student info
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, first_name, last_name, email")
    .eq("id", studentId)
    .single();

  if (studentError || !student) {
    console.error("Student not found:", studentError);
    return new Response(JSON.stringify({ error: "Student not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!student.email) {
    return new Response(JSON.stringify({ error: "Student has no email address" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get question info
  const { data: question, error: questionError } = await supabase
    .from("questions")
    .select("id, prompt_text, prompt_image_url")
    .eq("id", questionId)
    .single();

  if (questionError || !question) {
    console.error("Question not found:", questionError);
    return new Response(JSON.stringify({ error: "Question not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Create an attempt record
  const { data: attempt, error: attemptError } = await supabase
    .from("attempts")
    .insert({
      student_id: studentId,
      question_id: questionId,
      assessment_id: assessmentId || null,
      status: "pending",
    })
    .select()
    .single();

  if (attemptError || !attempt) {
    console.error("Failed to create attempt:", attemptError);
    return new Response(JSON.stringify({ error: "Failed to create attempt" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Generate answer links
  const baseUrl = Deno.env.get("SITE_URL") || "https://ojyekpuxrjzrqfwexpos.lovableproject.com";
  const answerLinks = answerChoices.map((choice) => {
    const answerUrl = `${supabaseUrl}/functions/v1/send-student-questions?action=submit&attemptId=${attempt.id}&answer=${encodeURIComponent(choice.value)}`;
    return `<a href="${answerUrl}" style="display: inline-block; padding: 12px 24px; margin: 8px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">${choice.label}</a>`;
  }).join("\n");

  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h1 style="color: #1f2937; margin-bottom: 24px;">Hi ${student.first_name}!</h1>
    
    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">You have a new question to answer:</p>
    
    <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <p style="color: #1f2937; font-size: 18px; font-weight: 500; margin: 0;">${question.prompt_text || "See the attached question image"}</p>
      ${question.prompt_image_url ? `<img src="${question.prompt_image_url}" alt="Question" style="max-width: 100%; margin-top: 16px; border-radius: 8px;">` : ""}
    </div>
    
    <p style="color: #4b5563; font-size: 16px; margin-bottom: 16px;">Click on your answer below:</p>
    
    <div style="text-align: center; margin: 24px 0;">
      ${answerLinks}
    </div>
    
    <p style="color: #9ca3af; font-size: 14px; margin-top: 32px;">This email was sent by your teacher. If you have questions, please contact them directly.</p>
  </div>
</body>
</html>
  `;

  // Send email via Brevo
  const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": brevoApiKey!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "NYCologic AI", email: "noreply@nyclogicai.com" },
      to: [{ email: student.email, name: `${student.first_name} ${student.last_name}` }],
      cc: [{ email: "gfrancois@nyclogicai.com", name: "Gregory Francois" }],
      subject: "New Question for You",
      htmlContent: emailHtml,
    }),
  });

  if (!emailResponse.ok) {
    const errorText = await emailResponse.text();
    console.error("Brevo API error:", errorText);
    return new Response(JSON.stringify({ error: "Failed to send email", details: errorText }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("Email sent successfully to:", student.email);

  return new Response(JSON.stringify({ success: true, attemptId: attempt.id }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleAnswerSubmission(attemptId: string, selectedAnswer: string): Promise<Response> {
  console.log("Processing answer submission:", { attemptId, selectedAnswer });

  // Get the attempt
  const { data: attempt, error: attemptError } = await supabase
    .from("attempts")
    .select("id, status, student_id, question_id")
    .eq("id", attemptId)
    .single();

  if (attemptError || !attempt) {
    console.error("Attempt not found:", attemptError);
    return new Response(generateResponseHtml("Error", "This question link is invalid or expired.", false), {
      status: 404,
      headers: { "Content-Type": "text/html" },
    });
  }

  if (attempt.status !== "pending") {
    return new Response(generateResponseHtml("Already Answered", "You have already submitted an answer for this question.", false), {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  }

  // Update the attempt status and store the answer in qr_code field (repurposing for email answers)
  const { error: updateError } = await supabase
    .from("attempts")
    .update({ 
      status: "analyzed",
      qr_code: `email_answer:${selectedAnswer}`,
      updated_at: new Date().toISOString()
    })
    .eq("id", attemptId);

  if (updateError) {
    console.error("Failed to update attempt:", updateError);
    return new Response(generateResponseHtml("Error", "Failed to record your answer. Please try again.", false), {
      status: 500,
      headers: { "Content-Type": "text/html" },
    });
  }

  console.log("Answer recorded successfully:", { attemptId, selectedAnswer });

  return new Response(generateResponseHtml("Thank You!", `Your answer "${selectedAnswer}" has been recorded successfully.`, true), {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}

function generateResponseHtml(title: string, message: string, success: boolean): string {
  const iconColor = success ? "#10B981" : "#EF4444";
  const icon = success 
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background-color: #f9fafb;">
  <div style="text-align: center; background-color: white; border-radius: 16px; padding: 48px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 400px;">
    <div style="margin-bottom: 24px;">
      ${icon}
    </div>
    <h1 style="color: #1f2937; margin-bottom: 16px;">${title}</h1>
    <p style="color: #6b7280; font-size: 16px; line-height: 1.6;">${message}</p>
    <p style="color: #9ca3af; font-size: 14px; margin-top: 32px;">You can close this window now.</p>
  </div>
</body>
</html>
  `;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Handle answer submission via GET (clicked from email) - no auth needed for student responses
    if (action === "submit") {
      const attemptId = url.searchParams.get("attemptId");
      const answer = url.searchParams.get("answer");
      
      if (!attemptId || !answer) {
        return new Response(generateResponseHtml("Error", "Invalid link parameters.", false), {
          status: 400,
          headers: { "Content-Type": "text/html" },
        });
      }
      
      return await handleAnswerSubmission(attemptId, answer);
    }

    // Handle sending questions via POST - requires authentication
    if (req.method === "POST") {
      // Authentication check for sending questions
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });

      const { data: { user }, error: userError } = await supabaseAnon.auth.getUser();
      
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const body: SendQuestionRequest = await req.json();
      return await sendQuestionEmail(body);
    }

    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in send-student-questions:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
