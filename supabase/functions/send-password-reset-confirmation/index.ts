import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PasswordResetPayload {
  email: string;
  name?: string;
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

    const payload: PasswordResetPayload = await req.json();
    const { email, name } = payload;

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const htmlContent = `
      <html>
        <body style="font-family: 'Nunito', Arial, sans-serif; background-color: #f8f9fa; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #dc2626; margin: 0;">🔐 Password Changed</h1>
            </div>
            <p style="font-size: 18px; color: #374151; text-align: center;">
              Hi${name ? ` <strong>${name}</strong>` : ""},
            </p>
            <p style="font-size: 16px; color: #374151; text-align: center;">
              Your password for NYCologic Scholar has been successfully changed.
            </p>
            <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center;">
              <p style="color: #166534; margin: 0; font-weight: bold;">
                ✅ Your account is secure
              </p>
            </div>
            <p style="color: #6b7280; text-align: center; font-size: 14px;">
              If you did not make this change, please contact us immediately or reset your password again.
            </p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="color: #9ca3af; text-align: center; font-size: 12px;">
              This email was sent by NYCologic Scholar. Do not reply to this email.
            </p>
          </div>
        </body>
      </html>
    `;

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": brevoApiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: "NYCologic Scholar",
          email: "notifications@scholarquest.app",
        },
        to: [{ email, name: name || "User" }],
        subject: "🔐 Your password has been changed",
        htmlContent,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Brevo API error:", errorText);
      throw new Error(`Brevo API error: ${response.status}`);
    }

    const result = await response.json();
    console.log("Password reset confirmation email sent to:", email);

    return new Response(
      JSON.stringify({ success: true, message: "Confirmation email sent" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in send-password-reset-confirmation:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};

serve(handler);
