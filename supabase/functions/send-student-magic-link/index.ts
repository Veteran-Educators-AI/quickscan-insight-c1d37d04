import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const brevoApiKey = Deno.env.get("BREVO_API_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const siteUrl = Deno.env.get("SITE_URL") || "https://quickscan-insight.lovable.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate a secure random token
function generateToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let token = '';
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  for (const byte of array) {
    token += chars[byte % chars.length];
  }
  return token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!brevoApiKey) {
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, classCode } = await req.json();

    if (!email || !classCode) {
      return new Response(JSON.stringify({ error: "Email and class code are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find the class
    const { data: classData, error: classError } = await supabase
      .from('classes')
      .select('id, name, teacher_id')
      .eq('join_code', classCode.toUpperCase())
      .single();

    if (classError || !classData) {
      return new Response(JSON.stringify({ error: "Invalid class code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get teacher name for the email
    const { data: teacher } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', classData.teacher_id)
      .single();

    const teacherName = teacher?.full_name || 'Your Teacher';

    // Generate magic link token
    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiry

    // Store the magic link token
    const { error: insertError } = await supabase
      .from('student_magic_links')
      .insert({
        token,
        email: email.toLowerCase().trim(),
        class_id: classData.id,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error("Failed to store magic link:", insertError);
      throw new Error("Failed to create magic link");
    }

    // Build the magic link URL
    const magicLinkUrl = `${siteUrl}/student/magic-callback?token=${token}`;

    // Send the email via Brevo
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f3f4f6;">
  <div style="background-color: white; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: #7c3aed; margin: 0; font-size: 28px;">🎓 Join Your Class</h1>
    </div>
    
    <p style="color: #1f2937; font-size: 16px; line-height: 1.6;">Hi there!</p>
    
    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
      Click the button below to join <strong style="color: #7c3aed;">${classData.name}</strong> with ${teacherName}.
    </p>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${magicLinkUrl}" style="display: inline-block; background-color: #7c3aed; color: white; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
        Join Class Now →
      </a>
    </div>
    
    <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
      This link will expire in 24 hours. If you didn't request this, you can safely ignore this email.
    </p>
    
    <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 24px;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        Sent via NYCLogic AI • Powered by ScanGenius
      </p>
    </div>
  </div>
</body>
</html>
    `;

    const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "NYCologic AI", email: "noreply@nyclogicai.com" },
        to: [{ email: email.toLowerCase().trim() }],
        subject: `Join ${classData.name} - Click to Join!`,
        htmlContent: emailHtml,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Brevo error:", errorText);
      throw new Error("Failed to send email");
    }

    console.log("Magic link sent to:", email, "for class:", classData.name);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error in send-student-magic-link:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
