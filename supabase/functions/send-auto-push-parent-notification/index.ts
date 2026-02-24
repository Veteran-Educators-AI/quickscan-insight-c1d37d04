import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const brevoApiKey = Deno.env.get("BREVO_API_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AutoPushNotificationRequest {
  studentId: string;
  studentName: string;
  parentEmail: string;
  grade: number;
  regentsScore?: number;
  topicName: string;
  worksheetCount: number;
  teacherName?: string;
  threshold: number;
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function generateParentEmailHtml(
  studentName: string,
  grade: number,
  regentsScore: number | undefined,
  topicName: string,
  worksheetCount: number,
  teacherName: string | undefined,
  threshold: number
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    
    <div style="background-color: #FEF3C7; border: 1px solid #FCD34D; border-radius: 8px; padding: 20px; margin-bottom: 24px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 12px;">📝</div>
      <h1 style="color: #92400E; margin: 0; font-size: 24px;">Remediation Practice Assigned</h1>
    </div>

    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Dear Parent/Guardian,</p>
    
    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
      We wanted to let you know that <strong>${studentName}</strong> has been assigned additional practice materials to help strengthen their understanding in <strong>${topicName}</strong>.
    </p>

    <div style="background-color: #FEF3C7; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
      <p style="color: #78350F; font-size: 14px; margin: 0 0 12px 0;">Practice worksheets assigned:</p>
      <div style="display: inline-block; background-color: #D97706; color: white; border-radius: 50%; width: 60px; height: 60px; line-height: 60px; font-size: 28px; font-weight: bold;">
        ${worksheetCount}
      </div>
    </div>

    <div style="background-color: #f3f4f6; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Student:</td>
          <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">${studentName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Topic:</td>
          <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">${topicName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Recent Grade:</td>
          <td style="padding: 8px 0; color: ${grade < 60 ? '#DC2626' : grade < 70 ? '#D97706' : '#059669'}; font-size: 14px; font-weight: 600; text-align: right;">${grade}%</td>
        </tr>
        ${regentsScore !== undefined ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Regents Score:</td>
          <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">${regentsScore}/4</td>
        </tr>
        ` : ''}
      </table>
    </div>

    <div style="background-color: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #065F46; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">🎮 NYClogic Scholar AI</p>
      <p style="color: #065F46; font-size: 14px; line-height: 1.5; margin: 0;">
        This practice has been sent to the <strong>NYClogic Scholar AI</strong> app, where ${studentName} can complete it in a fun, gamified way and earn XP and coins for their progress!
      </p>
    </div>

    <div style="background-color: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #1E40AF; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">🏠 How You Can Help:</p>
      <ul style="color: #1E40AF; font-size: 14px; line-height: 1.6; margin: 0; padding-left: 20px;">
        <li>Encourage your child to complete the assigned practice</li>
        <li>Set aside dedicated study time each day</li>
        <li>Celebrate their progress and completed worksheets</li>
        <li>Contact the teacher if additional support is needed</li>
      </ul>
    </div>

    <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
      This remediation was automatically assigned because ${studentName}'s grade (${grade}%) was below the target of ${threshold}%. With extra practice, we're confident they'll improve!
    </p>

    <p style="color: #9ca3af; font-size: 14px; margin-top: 32px; text-align: center;">
      This notification was sent by ${teacherName || "your child's teacher"} via NYCLogic Ai.
    </p>
  </div>
</body>
</html>
  `;
}

async function sendAutoPushNotification(request: AutoPushNotificationRequest): Promise<Response> {
  const { 
    studentId, 
    studentName, 
    parentEmail,
    grade,
    regentsScore,
    topicName,
    worksheetCount,
    teacherName,
    threshold
  } = request;

  if (!brevoApiKey) {
    console.error("BREVO_API_KEY not configured");
    return new Response(JSON.stringify({ error: "Email service not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!parentEmail) {
    console.log("No parent email provided for student:", studentId);
    return new Response(JSON.stringify({ 
      success: false, 
      error: "No parent email provided" 
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const subject = `📝 Remediation Practice Assigned for ${studentName}`;
    const emailHtml = generateParentEmailHtml(
      studentName, grade, regentsScore, topicName, worksheetCount, teacherName, threshold
    );

    const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "NYCologic AI", email: "noreply@nyclogicai.com" },
        to: [{ email: parentEmail, name: "Parent/Guardian" }],
        subject: subject,
        htmlContent: emailHtml,
      }),
    });

    if (emailResponse.ok) {
      console.log("Auto-push parent notification sent to:", parentEmail);
      return new Response(JSON.stringify({ 
        success: true,
        parentNotified: true
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      const errorText = await emailResponse.text();
      console.error("Failed to send parent email:", errorText);
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Failed to send email" 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("Error sending parent email:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method === "POST") {
      const body: AutoPushNotificationRequest = await req.json();
      return await sendAutoPushNotification(body);
    }

    return new Response(JSON.stringify({ error: "Invalid request method" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in send-auto-push-parent-notification:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
