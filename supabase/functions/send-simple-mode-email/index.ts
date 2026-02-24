import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const resend = new Resend(resendApiKey);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const siteUrl = Deno.env.get("SITE_URL") || "https://quickscan-insight.lovable.app";

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { suggestionId, approvalToken } = await req.json();

    // Get the suggestion
    const { data: suggestion, error: suggestionError } = await supabase
      .from("simple_mode_suggestions")
      .select("*")
      .eq("id", suggestionId)
      .eq("teacher_id", user.id)
      .single();

    if (suggestionError || !suggestion) {
      throw new Error("Suggestion not found");
    }

    // Get teacher profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();

    const teacherName = profile?.full_name || "Teacher";
    const teacherEmail = profile?.email || user.email;

    const approveUrl = `${siteUrl}/simple-mode/respond?token=${approvalToken}&action=approve`;
    const rejectUrl = `${siteUrl}/simple-mode/respond?token=${approvalToken}&action=reject`;

    const sourceData = suggestion.source_data as { avg_grade?: number; attempt_count?: number };

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">📚 Today's Lesson Suggestion</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Simple Mode - ScanGenius</p>
    </div>
    
    <div style="padding: 30px;">
      <p style="color: #374151; font-size: 16px; margin: 0 0 20px 0;">
        Hi ${teacherName},
      </p>
      
      <p style="color: #374151; font-size: 16px; margin: 0 0 20px 0;">
        Based on your students' recent performance, here's today's recommended lesson:
      </p>
      
      <div style="background: #f0f9ff; border: 2px solid #3b82f6; border-radius: 12px; padding: 20px; margin: 20px 0;">
        <h2 style="color: #1e40af; margin: 0 0 10px 0; font-size: 20px;">
          ${suggestion.suggested_topic}
        </h2>
        ${suggestion.suggested_standard ? `<p style="color: #6b7280; margin: 0 0 10px 0; font-size: 14px;">Standard: ${suggestion.suggested_standard}</p>` : ''}
        <p style="color: #374151; margin: 0; font-size: 14px;">
          ${suggestion.reason}
        </p>
        ${sourceData?.avg_grade ? `
        <div style="margin-top: 15px; display: flex; gap: 20px;">
          <div style="background: white; padding: 10px 15px; border-radius: 8px;">
            <span style="color: #ef4444; font-weight: bold; font-size: 18px;">${sourceData.avg_grade}%</span>
            <span style="color: #6b7280; font-size: 12px; display: block;">Class Average</span>
          </div>
          <div style="background: white; padding: 10px 15px; border-radius: 8px;">
            <span style="color: #3b82f6; font-weight: bold; font-size: 18px;">${sourceData.attempt_count || 0}</span>
            <span style="color: #6b7280; font-size: 12px; display: block;">Attempts</span>
          </div>
        </div>
        ` : ''}
      </div>
      
      <p style="color: #374151; font-size: 16px; margin: 20px 0;">
        Approve this suggestion and we'll automatically generate a complete lesson plan and practice worksheet for you.
      </p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${approveUrl}" style="display: inline-block; background: #22c55e; color: white; padding: 14px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; margin: 0 10px 10px 0;">
          ✓ Approve & Generate
        </a>
        <a href="${rejectUrl}" style="display: inline-block; background: #ef4444; color: white; padding: 14px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
          ✗ Try Another Topic
        </a>
      </div>
      
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 20px 0 0 0;">
        This link expires in 24 hours. Need help? Reply to this email.
      </p>
    </div>
  </div>
</body>
</html>
    `;

    const { error: emailError } = await resend.emails.send({
      from: "NYCologic AI <noreply@nyclogicai.com>",
      to: [teacherEmail!],
      subject: `📚 Today's Lesson: ${suggestion.suggested_topic}`,
      html: emailHtml,
    });

    if (emailError) {
      console.error("Email error:", emailError);
      throw new Error("Failed to send email");
    }

    return new Response(
      JSON.stringify({ success: true, message: "Email sent successfully" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-simple-mode-email:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
