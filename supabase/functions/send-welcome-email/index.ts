import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WelcomeEmailRequest {
  student_id: string;
  student_name: string;
  student_email: string;
  class_name?: string;
  teacher_name?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    if (!brevoApiKey) {
      throw new Error("BREVO_API_KEY not configured");
    }

    const { student_id, student_name, student_email, class_name, teacher_name }: WelcomeEmailRequest = await req.json();

    if (!student_email) {
      return new Response(
        JSON.stringify({ error: "No email provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const firstName = student_name?.split(" ")[0] || "Scholar";

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ScholarQuest!</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">🎓 Welcome to ScholarQuest!</h1>
              <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 16px;">Your learning adventure begins now</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; font-size: 18px; color: #18181b;">Hey ${firstName}! 👋</p>
              
              <p style="margin: 0 0 20px; font-size: 16px; color: #52525b; line-height: 1.6;">
                You've just joined an awesome learning community where studying pays off—literally! 
                Complete assignments, master standards, and earn coins & XP along the way.
              </p>

              ${class_name ? `
              <div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
                <p style="margin: 0; color: #166534; font-size: 14px; font-weight: 600;">📚 Your Class</p>
                <p style="margin: 8px 0 0; color: #15803d; font-size: 16px;">${class_name}${teacher_name ? ` with ${teacher_name}` : ''}</p>
              </div>
              ` : ''}

              <h2 style="margin: 30px 0 15px; font-size: 18px; color: #18181b;">🚀 Getting Started</h2>
              
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e4e4e7;">
                    <table role="presentation" style="border-collapse: collapse;">
                      <tr>
                        <td style="width: 40px; vertical-align: top;">
                          <span style="display: inline-block; width: 28px; height: 28px; background-color: #ddd6fe; color: #7c3aed; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 600;">1</span>
                        </td>
                        <td style="vertical-align: top;">
                          <p style="margin: 0; font-size: 15px; color: #18181b; font-weight: 500;">Check Your Dashboard</p>
                          <p style="margin: 4px 0 0; font-size: 14px; color: #71717a;">See your grades, streak, and progress toward rewards</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e4e4e7;">
                    <table role="presentation" style="border-collapse: collapse;">
                      <tr>
                        <td style="width: 40px; vertical-align: top;">
                          <span style="display: inline-block; width: 28px; height: 28px; background-color: #ddd6fe; color: #7c3aed; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 600;">2</span>
                        </td>
                        <td style="vertical-align: top;">
                          <p style="margin: 0; font-size: 15px; color: #18181b; font-weight: 500;">Practice to Earn Points</p>
                          <p style="margin: 4px 0 0; font-size: 14px; color: #71717a;">Complete practice sets and games to earn XP and coins</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0;">
                    <table role="presentation" style="border-collapse: collapse;">
                      <tr>
                        <td style="width: 40px; vertical-align: top;">
                          <span style="display: inline-block; width: 28px; height: 28px; background-color: #ddd6fe; color: #7c3aed; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 600;">3</span>
                        </td>
                        <td style="vertical-align: top;">
                          <p style="margin: 0; font-size: 15px; color: #18181b; font-weight: 500;">Build Your Streak</p>
                          <p style="margin: 4px 0 0; font-size: 14px; color: #71717a;">Study daily to keep your streak alive and unlock badges</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <div style="text-align: center; margin: 35px 0 20px;">
                <a href="https://scholar-quest-rewards.lovable.app/student" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">Start Learning Now →</a>
              </div>

              <p style="margin: 30px 0 0; font-size: 14px; color: #a1a1aa; text-align: center;">
                Questions? Talk to your teacher or reply to this email.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f4f4f5; padding: 20px 30px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #71717a;">
                ScholarQuest • Making learning rewarding 🏆
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    // Send email via Brevo
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "api-key": brevoApiKey,
      },
      body: JSON.stringify({
        sender: {
          name: "NYCologic AI",
          email: "noreply@nyclogicai.com",
        },
        to: [{ email: student_email, name: student_name }],
        subject: `🎓 Welcome to ScholarQuest, ${firstName}!`,
        htmlContent,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Brevo error:", errorData);
      throw new Error(`Failed to send email: ${response.status}`);
    }

    const result = await response.json();
    console.log("Welcome email sent successfully:", result);

    return new Response(
      JSON.stringify({ success: true, messageId: result.messageId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error sending welcome email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
