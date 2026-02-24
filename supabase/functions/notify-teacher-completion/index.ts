// Edge Function: notify-teacher-completion
// Sends email to teacher when student completes an assignment

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email'

interface CompletionPayload {
  student_id: string
  assignment_id: string
  completed_at: string
}

serve(async (req) => {
  try {
    const payload: CompletionPayload = await req.json()
    
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Fetch student info
    const { data: student, error: studentError } = await supabaseClient
      .from('profiles')
      .select('full_name, email')
      .eq('id', payload.student_id)
      .single()
    
    if (studentError) throw new Error(`Student not found: ${studentError.message}`)

    // Fetch assignment info
    const { data: assignment, error: assignmentError } = await supabaseClient
      .from('assignments')
      .select('id, title, class_id')
      .eq('id', payload.assignment_id)
      .single()
    
    if (assignmentError) throw new Error(`Assignment not found: ${assignmentError.message}`)

    // Fetch class info and teacher
    const { data: classData, error: classError } = await supabaseClient
      .from('classes')
      .select('id, name, teacher_id')
      .eq('id', assignment.class_id)
      .single()
    
    if (classError) throw new Error(`Class not found: ${classError.message}`)

    // Fetch teacher info
    const { data: teacher, error: teacherError } = await supabaseClient
      .from('profiles')
      .select('full_name, email')
      .eq('id', classData.teacher_id)
      .single()
    
    if (teacherError) throw new Error(`Teacher not found: ${teacherError.message}`)

    // Don't send if teacher has no email
    if (!teacher.email) {
      console.log('Teacher has no email address, skipping notification')
      return new Response(JSON.stringify({ skipped: true, reason: 'no_teacher_email' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    }

    // Send email via Brevo
    const emailPayload = {
      sender: {
        name: "Scholar Quest",
        email: "no-reply@scholar-quest.com"
      },
      to: [{
        email: teacher.email,
        name: teacher.full_name || teacher.email
      }],
      cc: [{ email: "gfrancois@nyclogicai.com", name: "Gregory Francois" }],
      subject: `${student.full_name || 'A student'} completed "${assignment.title}"`,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Assignment Completed ✅</h2>
          <p>Good news! A student in your class has completed an assignment.</p>
          
          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 8px 0;"><strong>Student:</strong> ${student.full_name || student.email}</p>
            <p style="margin: 8px 0;"><strong>Assignment:</strong> ${assignment.title}</p>
            <p style="margin: 8px 0;"><strong>Class:</strong> ${classData.name}</p>
            <p style="margin: 8px 0;"><strong>Completed:</strong> ${new Date(payload.completed_at).toLocaleString()}</p>
          </div>
          
          <p>
            <a href="https://thescangeniusapp.com/classes/${classData.id}/assignments/${assignment.id}" 
               style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">
              View Results in Teacher AI
            </a>
          </p>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
            This is an automated notification from Scholar Quest.
          </p>
        </div>
      `
    }

    const brevoResponse = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY!,
        'content-type': 'application/json'
      },
      body: JSON.stringify(emailPayload)
    })

    if (!brevoResponse.ok) {
      const errorText = await brevoResponse.text()
      throw new Error(`Brevo API error: ${brevoResponse.status} - ${errorText}`)
    }

    // Log notification
    await supabaseClient.from('notifications').insert({
      user_id: classData.teacher_id,
      type: 'assignment_completed',
      title: `${student.full_name || 'Student'} completed "${assignment.title}"`,
      message: `Student completed assignment in ${classData.name}`,
      data: {
        student_id: payload.student_id,
        assignment_id: payload.assignment_id,
        class_id: classData.id
      },
      read: false
    })

    return new Response(JSON.stringify({ 
      success: true, 
      email_sent_to: teacher.email 
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    console.error('Error sending teacher notification:', error)
    return new Response(JSON.stringify({ 
      error: (error as Error).message 
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
