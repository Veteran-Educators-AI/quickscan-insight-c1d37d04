import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const brevoApiKey = Deno.env.get("BREVO_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParentNotificationRequest {
  studentName: string;
  parentEmail: string;
  confidence: number;
  indicators: string[];
  wasRejected: boolean;
  teacherName?: string;
}

async function sendParentNotification(request: ParentNotificationRequest): Promise<Response> {
  const { studentName, parentEmail, confidence, indicators, wasRejected, teacherName } = request;

  if (!parentEmail) {
    console.log("No parent email provided, skipping notification");
    return new Response(JSON.stringify({ success: false, reason: "No parent email" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const subject = wasRejected 
    ? `🚨 Action Required: ${studentName}'s Assignment Rejected` 
    : `⚠️ Notice: ${studentName}'s Work Flagged for Review`;

  const statusColor = wasRejected ? "#DC2626" : "#F59E0B";
  const statusBg = wasRejected ? "#FEF2F2" : "#FFFBEB";
  const statusBorder = wasRejected ? "#FECACA" : "#FDE68A";
  const statusText = wasRejected ? "Work Rejected" : "Work Flagged";

  const indicatorsList = indicators.map(i => `<li style="color: #4b5563; margin-bottom: 8px;">${i}</li>`).join("");

  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    
    <div style="background-color: ${statusBg}; border: 1px solid ${statusBorder}; border-radius: 8px; padding: 20px; margin-bottom: 24px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 12px;">${wasRejected ? '🚨' : '⚠️'}</div>
      <h1 style="color: ${statusColor}; margin: 0; font-size: 24px;">${statusText}</h1>
    </div>

    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Dear Parent/Guardian,</p>
    
    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
      We are writing to inform you that <strong>${studentName}</strong>'s recent assignment submission has been 
      ${wasRejected ? '<strong style="color: #DC2626;">rejected</strong>' : '<strong style="color: #F59E0B;">flagged for review</strong>'} 
      by our AI detection system.
    </p>

    <div style="background-color: #f3f4f6; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Student:</td>
          <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">${studentName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">AI Confidence:</td>
          <td style="padding: 8px 0; color: ${statusColor}; font-size: 14px; font-weight: 600; text-align: right;">${confidence}%</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Status:</td>
          <td style="padding: 8px 0; color: ${statusColor}; font-size: 14px; font-weight: 600; text-align: right;">${statusText}</td>
        </tr>
      </table>
    </div>

    ${indicators.length > 0 ? `
    <div style="margin: 24px 0;">
      <h3 style="color: #1f2937; font-size: 16px; margin-bottom: 12px;">Indicators Detected:</h3>
      <ul style="padding-left: 20px; margin: 0;">
        ${indicatorsList}
      </ul>
    </div>
    ` : ''}

    ${wasRejected ? `
    <div style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #991B1B; font-size: 14px; margin: 0; font-weight: 600;">
        ⚠️ Action Required: ${studentName} must redo this assignment using their own work.
      </p>
    </div>
    ` : `
    <div style="background-color: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #92400E; font-size: 14px; margin: 0;">
        The teacher will review this submission and may reach out if additional clarification is needed.
      </p>
    </div>
    `}

    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
      We encourage academic honesty and the use of one's own knowledge and skills to complete assignments. 
      If you have any questions or believe this was flagged in error, please contact the teacher directly.
    </p>

    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
      Best regards,<br>
      ${teacherName ? `${teacherName}<br>` : ''}
      <span style="color: #9ca3af;">via ScanGenius</span>
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">

    <p style="color: #9ca3af; font-size: 12px; text-align: center;">
      This is an automated notification from ScanGenius. Please do not reply to this email.
    </p>
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
      to: [{ email: parentEmail }],
      cc: [{ email: "gfrancois@nyclogicai.com", name: "Gregory Francois" }],
      subject: subject,
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

  console.log("Parent AI notification email sent successfully to:", parentEmail);

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method === "POST") {
      const body: ParentNotificationRequest = await req.json();
      return await sendParentNotification(body);
    }

    return new Response(JSON.stringify({ error: "Invalid request method" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in send-parent-ai-notification:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
