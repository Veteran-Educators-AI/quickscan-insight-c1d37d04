import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const brevoApiKey = Deno.env.get("BREVO_API_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  studentId: string;
  studentName: string;
  previousLevel: string | null;
  currentLevel: string;
  topicName: string;
  teacherEmail: string;
  teacherName: string;
  notificationType: 'level_drop' | 'level_a_achieved';
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function sendLevelNotification(request: NotificationRequest): Promise<Response> {
  const { 
    studentId, 
    studentName, 
    previousLevel, 
    currentLevel, 
    topicName, 
    teacherEmail, 
    teacherName,
    notificationType 
  } = request;

  const isLevelDrop = notificationType === 'level_drop';
  const subject = isLevelDrop 
    ? `⚠️ Alert: ${studentName} dropped to Level ${currentLevel}` 
    : `🎉 ${studentName} achieved Level A mastery!`;

  const iconColor = isLevelDrop ? "#EF4444" : "#10B981";
  const headerBg = isLevelDrop ? "#FEF2F2" : "#ECFDF5";
  const headerBorder = isLevelDrop ? "#FECACA" : "#A7F3D0";

  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    
    <div style="background-color: ${headerBg}; border: 1px solid ${headerBorder}; border-radius: 8px; padding: 20px; margin-bottom: 24px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 12px;">${isLevelDrop ? '⚠️' : '🎉'}</div>
      <h1 style="color: #1f2937; margin: 0; font-size: 24px;">${isLevelDrop ? 'Level Drop Alert' : 'Level A Achievement!'}</h1>
    </div>

    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi ${teacherName || 'Teacher'},</p>
    
    ${isLevelDrop ? `
    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
      <strong>${studentName}</strong> has dropped from <strong>Level ${previousLevel || 'unknown'}</strong> to 
      <strong style="color: #EF4444;">Level ${currentLevel}</strong> in <strong>${topicName}</strong>.
    </p>
    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
      This student may need additional support or intervention to get back on track.
    </p>
    ` : `
    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
      Congratulations! <strong>${studentName}</strong> has achieved 
      <strong style="color: #10B981;">Level A mastery</strong> in <strong>${topicName}</strong>!
    </p>
    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
      This is the highest advancement level, indicating excellent understanding of the topic.
    </p>
    `}

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
        ${previousLevel ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Previous Level:</td>
          <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">Level ${previousLevel}</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Current Level:</td>
          <td style="padding: 8px 0; color: ${isLevelDrop ? '#EF4444' : '#10B981'}; font-size: 14px; font-weight: 600; text-align: right;">Level ${currentLevel}</td>
        </tr>
      </table>
    </div>

    <p style="color: #9ca3af; font-size: 14px; margin-top: 32px; text-align: center;">
      This notification was sent by ScanGenius. View the Reports page for more details.
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
      to: [{ email: teacherEmail, name: teacherName || "Teacher" }],
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

  console.log("Level notification email sent successfully to:", teacherEmail);

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
      const body: NotificationRequest = await req.json();
      return await sendLevelNotification(body);
    }

    return new Response(JSON.stringify({ error: "Invalid request method" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in send-level-notification:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
