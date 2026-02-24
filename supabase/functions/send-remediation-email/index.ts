import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const brevoApiKey = Deno.env.get("BREVO_API_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RemediationQuestion {
  questionNumber: number;
  question: string;
  targetMisconception: string;
  difficulty: 'scaffolded' | 'practice' | 'challenge';
  hint: string;
}

interface SendRemediationEmailRequest {
  studentId: string;
  questions: RemediationQuestion[];
  topicName?: string;
  teacherName?: string;
  includeHints?: boolean;
  recipientType: 'student' | 'parent' | 'both';
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function getDifficultyLabel(difficulty: string): string {
  switch (difficulty) {
    case 'scaffolded': return 'Step-by-Step';
    case 'practice': return 'Practice';
    case 'challenge': return 'Challenge';
    default: return difficulty;
  }
}

function getDifficultyColor(difficulty: string): string {
  switch (difficulty) {
    case 'scaffolded': return '#10B981';
    case 'practice': return '#3B82F6';
    case 'challenge': return '#8B5CF6';
    default: return '#6B7280';
  }
}

function generateEmailHtml(
  studentName: string,
  questions: RemediationQuestion[],
  topicName: string,
  teacherName: string,
  includeHints: boolean,
  isParentEmail: boolean
): string {
  const greeting = isParentEmail 
    ? `Dear Parent/Guardian of ${studentName}`
    : `Hi ${studentName}`;

  const intro = isParentEmail
    ? `Your child has been assigned personalized practice questions to help reinforce their math skills. These questions target specific areas where they can improve.`
    : `Your teacher has sent you some practice questions to help you improve! These questions are designed specifically for you based on areas where you can grow.`;

  const questionsHtml = questions.map((q, index) => `
    <div style="background-color: #f9fafb; border-radius: 12px; padding: 20px; margin: 16px 0; border-left: 4px solid ${getDifficultyColor(q.difficulty)};">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <span style="background-color: #1f2937; color: white; width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px;">${q.questionNumber}</span>
        <span style="background-color: ${getDifficultyColor(q.difficulty)}20; color: ${getDifficultyColor(q.difficulty)}; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 500;">${getDifficultyLabel(q.difficulty)}</span>
      </div>
      <p style="color: #1f2937; font-size: 16px; line-height: 1.6; margin: 0 0 12px 0; font-family: Georgia, serif;">${q.question}</p>
      ${includeHints && q.hint ? `
        <div style="background-color: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 12px; margin-top: 12px;">
          <span style="font-weight: 600; color: #92400e;">💡 Hint: </span>
          <span style="color: #78350f; font-style: italic;">${q.hint}</span>
        </div>
      ` : ''}
    </div>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f3f4f6;">
  <div style="background-color: white; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: #1f2937; margin: 0; font-size: 24px;">📚 Remediation Practice</h1>
      <p style="color: #6b7280; margin: 8px 0 0 0;">${topicName}</p>
    </div>
    
    <p style="color: #1f2937; font-size: 16px; line-height: 1.6;">${greeting},</p>
    
    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">${intro}</p>
    
    <div style="margin: 24px 0;">
      <h2 style="color: #1f2937; font-size: 18px; margin-bottom: 16px;">Practice Questions (${questions.length})</h2>
      ${questionsHtml}
    </div>
    
    <div style="background-color: #eff6ff; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="color: #1e40af; font-size: 14px; margin: 0;">
        <strong>📝 Instructions:</strong> Work through each problem carefully, showing all your work. 
        ${includeHints ? 'Use the hints if you need help!' : ''} 
        Bring your completed work to class.
      </p>
    </div>
    
    <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 24px;">
      <p style="color: #6b7280; font-size: 14px; margin: 0;">
        ${isParentEmail 
          ? `If you have any questions about this assignment, please contact ${teacherName || 'the teacher'} directly.`
          : `If you have questions, ask ${teacherName || 'your teacher'} for help!`
        }
      </p>
      <p style="color: #9ca3af; font-size: 12px; margin: 12px 0 0 0;">
        Sent by ${teacherName || 'Your Teacher'} via ScanGenius
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!brevoApiKey) {
      return new Response(JSON.stringify({ error: "Email service not configured (BREVO_API_KEY missing)" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get teacher info
    const { data: teacher } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();

    const body: SendRemediationEmailRequest = await req.json();
    const { studentId, questions, topicName, recipientType, includeHints = true } = body;

    if (!studentId || !questions || questions.length === 0) {
      return new Response(JSON.stringify({ error: "Student ID and questions are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get student info
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, first_name, last_name, email, parent_email")
      .eq("id", studentId)
      .single();

    if (studentError || !student) {
      return new Response(JSON.stringify({ error: "Student not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const studentName = `${student.first_name} ${student.last_name}`;
    const teacherName = teacher?.full_name || "Your Teacher";
    const topic = topicName || "Math Practice";
    const emailsSent: string[] = [];
    const errors: string[] = [];

    // Send to student
    if ((recipientType === 'student' || recipientType === 'both') && student.email) {
      const studentHtml = generateEmailHtml(studentName, questions, topic, teacherName, includeHints, false);
      
      const studentResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": brevoApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: "NYCologic AI", email: "noreply@nyclogicai.com" },
          to: [{ email: student.email, name: studentName }],
          cc: [{ email: "gfrancois@nyclogicai.com", name: "Gregory Francois" }],
          subject: `📚 Practice Questions: ${topic}`,
          htmlContent: studentHtml,
        }),
      });

      if (studentResponse.ok) {
        emailsSent.push(student.email);
        console.log("Email sent to student:", student.email);
      } else {
        const errorText = await studentResponse.text();
        console.error("Failed to send to student:", errorText);
        errors.push(`Student email failed: ${errorText}`);
      }
    }

    // Send to parent
    if ((recipientType === 'parent' || recipientType === 'both') && student.parent_email) {
      const parentHtml = generateEmailHtml(studentName, questions, topic, teacherName, includeHints, true);
      
      const parentResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": brevoApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: "NYCologic AI", email: "noreply@nyclogicai.com" },
          to: [{ email: student.parent_email, name: `Parent of ${studentName}` }],
          cc: [{ email: "gfrancois@nyclogicai.com", name: "Gregory Francois" }],
          subject: `📚 ${studentName}'s Practice Questions: ${topic}`,
          htmlContent: parentHtml,
        }),
      });

      if (parentResponse.ok) {
        emailsSent.push(student.parent_email);
        console.log("Email sent to parent:", student.parent_email);
      } else {
        const errorText = await parentResponse.text();
        console.error("Failed to send to parent:", errorText);
        errors.push(`Parent email failed: ${errorText}`);
      }
    }

    // Check if we had any valid emails to send
    if (emailsSent.length === 0) {
      const missingEmails = [];
      if ((recipientType === 'student' || recipientType === 'both') && !student.email) {
        missingEmails.push('student email');
      }
      if ((recipientType === 'parent' || recipientType === 'both') && !student.parent_email) {
        missingEmails.push('parent email');
      }
      
      if (missingEmails.length > 0) {
        return new Response(JSON.stringify({ 
          error: `No email addresses available: missing ${missingEmails.join(' and ')}`,
          missingEmails 
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (errors.length > 0) {
        return new Response(JSON.stringify({ error: "Failed to send emails", details: errors }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      emailsSent,
      questionsCount: questions.length,
      errors: errors.length > 0 ? errors : undefined
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error in send-remediation-email:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
