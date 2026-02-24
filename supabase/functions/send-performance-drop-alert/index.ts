import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const brevoApiKey = Deno.env.get("BREVO_API_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PerformanceDropAlertRequest {
  studentId: string;
  studentName: string;
  previousGrade: number;
  currentGrade: number;
  dropAmount: number;
  topicName: string;
  nysStandard?: string;
  teacherEmail: string;
  teacherName: string;
  threshold: number;
  parentEmail?: string;
  sendToParent?: boolean;
  includeRemediation?: boolean;
  remediationTopics?: string[];
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function generateTeacherEmailHtml(
  studentName: string,
  previousGrade: number,
  currentGrade: number,
  dropAmount: number,
  topicName: string,
  nysStandard: string | undefined,
  threshold: number,
  teacherName: string
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
    
    <div style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 20px; margin-bottom: 24px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 12px;">📉</div>
      <h1 style="color: #991B1B; margin: 0; font-size: 24px;">Performance Drop Alert</h1>
    </div>

    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi ${teacherName || 'Teacher'},</p>
    
    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
      <strong>${studentName}</strong>'s performance has dropped by <strong>${dropAmount}%</strong>, which exceeds your alert threshold of ${threshold}%.
    </p>

    <div style="background-color: #FEF2F2; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
      <div style="display: flex; justify-content: center; align-items: center; gap: 20px;">
        <div>
          <p style="color: #6b7280; font-size: 12px; margin: 0;">Previous</p>
          <div style="font-size: 32px; font-weight: bold; color: #059669;">${previousGrade}%</div>
        </div>
        <div style="font-size: 24px; color: #DC2626;">→</div>
        <div>
          <p style="color: #6b7280; font-size: 12px; margin: 0;">Current</p>
          <div style="font-size: 32px; font-weight: bold; color: #DC2626;">${currentGrade}%</div>
        </div>
      </div>
      <p style="color: #991B1B; font-size: 18px; font-weight: 600; margin: 16px 0 0 0;">-${dropAmount}% decrease</p>
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
        ${nysStandard ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">NYS Standard:</td>
          <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">${nysStandard}</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Performance Drop:</td>
          <td style="padding: 8px 0; color: #DC2626; font-size: 14px; font-weight: 600; text-align: right;">-${dropAmount}%</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Alert Threshold:</td>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px; text-align: right;">≥${threshold}% drop</td>
        </tr>
      </table>
    </div>

    <div style="background-color: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #1E40AF; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">💡 Recommended Actions:</p>
      <ul style="color: #1E40AF; font-size: 14px; line-height: 1.6; margin: 0; padding-left: 20px;">
        <li>Check in with the student to understand any challenges</li>
        <li>Review recent work for patterns or misconceptions</li>
        <li>Consider assigning targeted remediation practice</li>
        <li>Schedule additional support if needed</li>
      </ul>
    </div>

    <p style="color: #9ca3af; font-size: 14px; margin-top: 32px; text-align: center;">
      This notification was sent by ScanGenius. View the Reports page for more details.
    </p>
  </div>
</body>
</html>
  `;
}

function generateParentEmailHtml(
  studentName: string,
  previousGrade: number,
  currentGrade: number,
  dropAmount: number,
  topicName: string,
  nysStandard: string | undefined,
  teacherName: string,
  includeRemediation: boolean,
  remediationTopics: string[]
): string {
  const remediationSection = includeRemediation && remediationTopics.length > 0 ? `
    <div style="background-color: #FEF3C7; border: 1px solid #FCD34D; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #92400E; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">📝 Recommended Practice Topics:</p>
      <ul style="color: #78350F; font-size: 14px; line-height: 1.6; margin: 0; padding-left: 20px;">
        ${remediationTopics.map(topic => `<li>${topic}</li>`).join('')}
      </ul>
    </div>
  ` : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    
    <div style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 20px; margin-bottom: 24px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 12px;">📚</div>
      <h1 style="color: #991B1B; margin: 0; font-size: 24px;">Academic Progress Update</h1>
    </div>

    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Dear Parent/Guardian,</p>
    
    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
      We wanted to let you know that <strong>${studentName}</strong>'s recent performance shows a change that may benefit from additional support at home.
    </p>

    <div style="background-color: #FEF2F2; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
      <div style="display: flex; justify-content: center; align-items: center; gap: 20px;">
        <div>
          <p style="color: #6b7280; font-size: 12px; margin: 0;">Previous</p>
          <div style="font-size: 32px; font-weight: bold; color: #059669;">${previousGrade}%</div>
        </div>
        <div style="font-size: 24px; color: #DC2626;">→</div>
        <div>
          <p style="color: #6b7280; font-size: 12px; margin: 0;">Current</p>
          <div style="font-size: 32px; font-weight: bold; color: #DC2626;">${currentGrade}%</div>
        </div>
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
        ${nysStandard ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">NYS Standard:</td>
          <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">${nysStandard}</td>
        </tr>
        ` : ''}
      </table>
    </div>

    ${remediationSection}

    <div style="background-color: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #065F46; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">🏠 How You Can Help at Home:</p>
      <ul style="color: #065F46; font-size: 14px; line-height: 1.6; margin: 0; padding-left: 20px;">
        <li>Review the topic with your child and ask them to explain concepts</li>
        <li>Encourage regular practice with homework and study materials</li>
        <li>Consider seeking tutoring or extra help sessions</li>
        <li>Reach out to the teacher for specific resources</li>
      </ul>
    </div>

    <div style="background-color: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #1E40AF; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">📞 Questions?</p>
      <p style="color: #1E40AF; font-size: 14px; line-height: 1.5; margin: 0;">
        If you have questions about your child's progress, please contact ${teacherName || 'the teacher'}.
      </p>
    </div>

    <p style="color: #9ca3af; font-size: 14px; margin-top: 32px; text-align: center;">
      This notification was sent by ${teacherName || 'your child\'s teacher'} via ScanGenius.
    </p>
  </div>
</body>
</html>
  `;
}

async function sendPerformanceDropAlert(request: PerformanceDropAlertRequest): Promise<Response> {
  const { 
    studentId, 
    studentName, 
    previousGrade,
    currentGrade,
    dropAmount,
    topicName, 
    nysStandard,
    teacherEmail, 
    teacherName,
    threshold,
    parentEmail,
    sendToParent,
    includeRemediation,
    remediationTopics
  } = request;

  if (!brevoApiKey) {
    console.error("BREVO_API_KEY not configured");
    return new Response(JSON.stringify({ error: "Email service not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: { teacher: boolean; parent: boolean } = { teacher: false, parent: false };

  // Send email to teacher
  try {
    const teacherSubject = `📉 Performance Drop Alert: ${studentName} dropped ${dropAmount}%`;
    const teacherEmailHtml = generateTeacherEmailHtml(
      studentName, previousGrade, currentGrade, dropAmount, topicName, nysStandard, threshold, teacherName
    );

    console.log("Sending performance drop alert to teacher:", teacherEmail);

    const teacherEmailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "NYCologic AI", email: "noreply@nyclogicai.com" },
        to: [{ email: teacherEmail, name: teacherName || "Teacher" }],
        cc: [{ email: "gfrancois@nyclogicai.com", name: "Gregory Francois" }],
        subject: teacherSubject,
        htmlContent: teacherEmailHtml,
      }),
    });

    if (teacherEmailResponse.ok) {
      console.log("Performance drop alert sent to teacher:", teacherEmail);
      results.teacher = true;
    } else {
      const errorText = await teacherEmailResponse.text();
      console.error("Failed to send teacher email:", errorText);
    }
  } catch (error) {
    console.error("Error sending teacher email:", error);
  }

  // Send email to parent if enabled and parent email exists
  if (sendToParent && parentEmail) {
    try {
      const parentSubject = `📚 Academic Progress Update for ${studentName}`;
      const parentEmailHtml = generateParentEmailHtml(
        studentName, previousGrade, currentGrade, dropAmount, topicName, nysStandard, teacherName,
        includeRemediation || false, remediationTopics || []
      );

      console.log("Sending performance drop alert to parent:", parentEmail);

      const parentEmailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": brevoApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: "NYCologic AI", email: "noreply@nyclogicai.com" },
          to: [{ email: parentEmail, name: "Parent/Guardian" }],
          cc: [{ email: "gfrancois@nyclogicai.com", name: "Gregory Francois" }],
          subject: parentSubject,
          htmlContent: parentEmailHtml,
        }),
      });

      if (parentEmailResponse.ok) {
        console.log("Performance drop alert sent to parent:", parentEmail);
        results.parent = true;
      } else {
        const errorText = await parentEmailResponse.text();
        console.error("Failed to send parent email:", errorText);
      }
    } catch (error) {
      console.error("Error sending parent email:", error);
    }
  }

  return new Response(JSON.stringify({ 
    success: results.teacher || results.parent,
    teacherNotified: results.teacher,
    parentNotified: results.parent
  }), {
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
      const body: PerformanceDropAlertRequest = await req.json();
      console.log("Received performance drop alert request:", {
        studentName: body.studentName,
        dropAmount: body.dropAmount,
        threshold: body.threshold,
      });
      return await sendPerformanceDropAlert(body);
    }

    return new Response(JSON.stringify({ error: "Invalid request method" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in send-performance-drop-alert:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
