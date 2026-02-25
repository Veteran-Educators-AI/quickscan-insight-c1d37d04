// Edge Function: notify-student-new-assignment
// Sends email to all students in a class when teacher posts new assignment

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email'

interface NewAssignmentPayload {
  assignment_id: string
  class_id: string
  teacher_id: string
}

serve(async (req) => {
  try {
    const payload: NewAssignmentPayload = await req.json()
    
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Fetch assignment details
    const { data: assignment, error: assignmentError } = await supabaseClient
      .from('assignments')
      .select('id, title, description, subject, due_at, xp_reward, coin_reward')
      .eq('id', payload.assignment_id)
      .single()
    
    if (assignmentError) throw new Error(`Assignment not found: ${assignmentError.message}`)

    // Fetch class info
    const { data: classData, error: classError } = await supabaseClient
      .from('classes')
      .select('id, name, teacher_id')
      .eq('id', payload.class_id)
      .single()
    
    if (classError) throw new Error(`Class not found: ${classError.message}`)

    // Fetch teacher name
    const { data: teacher, error: teacherError } = await supabaseClient
      .from('profiles')
      .select('full_name')
      .eq('id', classData.teacher_id)
      .single()
    
    if (teacherError) console.warn('Could not fetch teacher name')

    // Fetch all students in the class
    const { data: enrollments, error: enrollmentError } = await supabaseClient
      .from('student_classes')
      .select('student_id, profiles(email, full_name)')
      .eq('class_id', payload.class_id)
    
    if (enrollmentError) throw new Error(`Failed to fetch students: ${enrollmentError.message}`)

    if (!enrollments || enrollments.length === 0) {
      console.log('No students enrolled in class, skipping notifications')
      return new Response(JSON.stringify({ 
        skipped: true, 
        reason: 'no_students' 
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    }

    // Filter students with valid emails
    const studentsWithEmail = enrollments.filter(e => 
      e.profiles && (e.profiles as any).email
    )

    if (studentsWithEmail.length === 0) {
      console.log('No students have email addresses')
      return new Response(JSON.stringify({ 
        skipped: true, 
        reason: 'no_student_emails' 
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    }

    // Format due date
    const dueDate = assignment.due_at 
      ? new Date(assignment.due_at).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      : 'No due date'

    // Prepare email recipients
    const recipients = studentsWithEmail.map(e => ({
      email: (e.profiles as any).email,
      name: (e.profiles as any).full_name || (e.profiles as any).email
    }))

    // Send email via Brevo (batch send)
    const emailPayload = {
      sender: {
        name: teacher?.full_name || "Your Teacher",
        email: "no-reply@scholar-quest.com"
      },
      to: recipients,
      subject: `New Assignment: ${assignment.title}`,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">New Assignment Posted 📚</h2>
          <p>Your teacher has posted a new assignment in <strong>${classData.name}</strong>!</p>
          
          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">${assignment.title}</h3>
            ${assignment.description ? `<p style="color: #4b5563;">${assignment.description}</p>` : ''}
            
            <div style="margin-top: 16px;">
              <p style="margin: 8px 0;"><strong>Subject:</strong> ${assignment.subject || 'General'}</p>
              <p style="margin: 8px 0;"><strong>Due Date:</strong> ${dueDate}</p>
              ${assignment.xp_reward ? `<p style="margin: 8px 0;"><strong>Rewards:</strong> ${assignment.xp_reward} XP${assignment.coin_reward ? ` + ${assignment.coin_reward} coins` : ''}</p>` : ''}
            </div>
          </div>
          
          <p>
            <a href="https://scholar-quest-rewards.lovable.app/assignments/${assignment.id}" 
               style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">
              Start Assignment
            </a>
          </p>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
            Good luck! 🎯
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

    // Log notifications for each student
    const notificationInserts = studentsWithEmail.map(e => ({
      user_id: e.student_id,
      type: 'new_assignment',
      title: `New Assignment: ${assignment.title}`,
      message: `Posted in ${classData.name}`,
      data: {
        assignment_id: assignment.id,
        class_id: classData.id,
        teacher_id: classData.teacher_id
      },
      read: false
    }))

    await supabaseClient.from('notifications').insert(notificationInserts)

    return new Response(JSON.stringify({ 
      success: true, 
      emails_sent: recipients.length,
      recipients: recipients.map(r => r.email)
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    console.error('Error sending student notifications:', error)
    return new Response(JSON.stringify({ 
      error: (error as Error).message 
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
