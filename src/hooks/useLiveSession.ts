import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { usePushToSisterApp } from '@/hooks/usePushToSisterApp';

export interface LiveSession {
  id: string;
  presentation_id: string;
  teacher_id: string;
  class_id: string;
  title: string;
  topic: string;
  current_slide_index: number;
  status: 'active' | 'paused' | 'ended';
  participation_mode: 'individual' | 'pairs';
  session_code: string;
  credit_for_participation: number;
  deduction_for_non_participation: number;
  created_at: string;
  ended_at: string | null;
}

export interface SessionParticipant {
  id: string;
  session_id: string;
  student_id: string;
  partner_student_id: string | null;
  joined_at: string;
  last_active_at: string;
  total_questions_answered: number;
  correct_answers: number;
  credit_awarded: number;
  status: 'active' | 'disconnected' | 'left';
  student?: {
    first_name: string;
    last_name: string;
  };
}

export interface SessionQuestion {
  id: string;
  session_id: string;
  slide_index: number;
  question_prompt: string;
  options: string[];
  correct_answer: string | null;
  explanation: string | null;
  is_active: boolean;
  time_limit_seconds: number | null;
  created_at: string;
  activated_at: string | null;
  closed_at: string | null;
  svg: string | null;
  image_prompt: string | null;
}

export interface SessionAnswer {
  id: string;
  question_id: string;
  participant_id: string;
  selected_answer: string;
  is_correct: boolean | null;
  answered_at: string;
  time_taken_seconds: number | null;
}

function generateSessionCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function useLiveSession() {
  const { user } = useAuth();
  const { pushToSisterApp } = usePushToSisterApp();
  const [session, setSession] = useState<LiveSession | null>(null);
  const [participants, setParticipants] = useState<SessionParticipant[]>([]);
  const [activeQuestion, setActiveQuestion] = useState<SessionQuestion | null>(null);
  const [answers, setAnswers] = useState<SessionAnswer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [allSessionAnswers, setAllSessionAnswers] = useState<SessionAnswer[]>([]);

  // Start a new live session
  const startSession = useCallback(async (
    presentationId: string,
    classId: string,
    title: string,
    topic: string,
    participationMode: 'individual' | 'pairs' = 'individual',
    creditAmount: number = 5,
    deductionAmount: number = 5
  ) => {
    if (!user) return null;
    setIsLoading(true);

    try {
      const sessionCode = generateSessionCode();
      
      const { data, error } = await supabase
        .from('live_presentation_sessions')
        .insert({
          presentation_id: presentationId,
          teacher_id: user.id,
          class_id: classId,
          title,
          topic,
          session_code: sessionCode,
          participation_mode: participationMode,
          credit_for_participation: creditAmount,
          deduction_for_non_participation: deductionAmount,
        })
        .select()
        .single();

      if (error) throw error;
      setSession(data as LiveSession);
      toast.success(`Live session started! Code: ${sessionCode}`);
      return data as LiveSession;
    } catch (error) {
      console.error('Error starting session:', error);
      toast.error('Failed to start live session');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Update current slide
  const updateCurrentSlide = useCallback(async (slideIndex: number) => {
    if (!session) return;

    try {
      const { error } = await supabase
        .from('live_presentation_sessions')
        .update({ current_slide_index: slideIndex })
        .eq('id', session.id);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating slide:', error);
    }
  }, [session]);

  // Push a question to students
  const pushQuestion = useCallback(async (
    slideIndex: number,
    questionPrompt: string,
    options: string[],
    correctAnswer?: string,
    explanation?: string,
    timeLimitSeconds?: number,
    svg?: string,
    imagePrompt?: string
  ) => {
    if (!session) return null;

    try {
      // Deactivate any existing active question
      await supabase
        .from('live_session_questions')
        .update({ is_active: false, closed_at: new Date().toISOString() })
        .eq('session_id', session.id)
        .eq('is_active', true);

      // Create new question
      const { data, error } = await supabase
        .from('live_session_questions')
        .insert({
          session_id: session.id,
          slide_index: slideIndex,
          question_prompt: questionPrompt,
          options: options,
          correct_answer: correctAnswer || null,
          explanation: explanation || null,
          is_active: true,
          time_limit_seconds: timeLimitSeconds || null,
          activated_at: new Date().toISOString(),
          svg: svg || null,
          image_prompt: imagePrompt || null,
        })
        .select()
        .single();

      if (error) throw error;
      setActiveQuestion(data as SessionQuestion);
      toast.success('Question pushed to students!');
      return data as SessionQuestion;
    } catch (error) {
      console.error('Error pushing question:', error);
      toast.error('Failed to push question');
      return null;
    }
  }, [session]);

  // Close active question
  const closeQuestion = useCallback(async () => {
    if (!activeQuestion) return;

    try {
      const { error } = await supabase
        .from('live_session_questions')
        .update({ is_active: false, closed_at: new Date().toISOString() })
        .eq('id', activeQuestion.id);

      if (error) throw error;
      setActiveQuestion(null);
    } catch (error) {
      console.error('Error closing question:', error);
    }
  }, [activeQuestion]);

  // End the session and sync results to sister app
  const endSession = useCallback(async () => {
    if (!session) return;

    try {
      // Fetch all answers for this session before ending
      const { data: sessionQuestions } = await supabase
        .from('live_session_questions')
        .select('id')
        .eq('session_id', session.id);

      let allAnswers: SessionAnswer[] = [];
      if (sessionQuestions && sessionQuestions.length > 0) {
        const questionIds = sessionQuestions.map(q => q.id);
        const { data: answersData } = await supabase
          .from('live_session_answers')
          .select('*')
          .in('question_id', questionIds);
        allAnswers = (answersData || []) as SessionAnswer[];
      }

      const { error } = await supabase
        .from('live_presentation_sessions')
        .update({ 
          status: 'ended', 
          ended_at: new Date().toISOString() 
        })
        .eq('id', session.id);

      if (error) throw error;
      
      // Calculate credits for participants who didn't answer
      const nonParticipants = participants.filter(p => p.total_questions_answered === 0);
      if (nonParticipants.length > 0 && session.deduction_for_non_participation > 0) {
        toast.info(`${nonParticipants.length} student(s) didn't participate and will lose ${session.deduction_for_non_participation} credit`);
      }

      // Push session results to sister app
      try {
        const participantResults = participants.map(p => ({
          student_id: p.student_id,
          student_name: p.student ? `${p.student.first_name} ${p.student.last_name}` : 'Unknown',
          total_questions_answered: p.total_questions_answered,
          correct_answers: p.correct_answers,
          accuracy: p.total_questions_answered > 0 
            ? Math.round((p.correct_answers / p.total_questions_answered) * 100) 
            : 0,
          credit_awarded: p.credit_awarded,
          participated: p.total_questions_answered > 0,
          answers: allAnswers
            .filter(a => a.participant_id === p.id)
            .map(a => ({
              selected_answer: a.selected_answer,
              is_correct: a.is_correct,
              time_taken_seconds: a.time_taken_seconds,
            })),
        }));

        await pushToSisterApp({
          class_id: session.class_id,
          title: session.title,
          description: `Live session on ${session.topic}`,
          // @ts-ignore - extended type for live_session_completed
          type: 'live_session_completed',
          topic_name: session.topic,
          session_code: session.session_code,
          participation_mode: session.participation_mode,
          credit_for_participation: session.credit_for_participation,
          deduction_for_non_participation: session.deduction_for_non_participation,
          total_participants: participants.length,
          active_participants: participants.filter(p => p.total_questions_answered > 0).length,
          participant_results: participantResults,
        });
        console.log('Live session results synced to sister app');
      } catch (syncError) {
        console.error('Failed to sync session results to sister app:', syncError);
        // Don't fail the session end if sync fails
      }
      
      toast.success('Live session ended');
      setSession(null);
      setParticipants([]);
      setActiveQuestion(null);
      setAllSessionAnswers([]);
    } catch (error) {
      console.error('Error ending session:', error);
      toast.error('Failed to end session');
    }
  }, [session, participants, pushToSisterApp]);

  // Subscribe to real-time updates for teacher
  useEffect(() => {
    if (!session) return;

    // Subscribe to participant updates
    const participantsChannel = supabase
      .channel(`participants-${session.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_session_participants',
          filter: `session_id=eq.${session.id}`,
        },
        async () => {
          // Refresh participants list
          const { data } = await supabase
            .from('live_session_participants')
            .select(`
              *,
              student:students(first_name, last_name)
            `)
            .eq('session_id', session.id);
          
          if (data) {
            setParticipants(data as unknown as SessionParticipant[]);
          }
        }
      )
      .subscribe();

    // Subscribe to answer updates
    const answersChannel = supabase
      .channel(`answers-${session.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_session_answers',
        },
        async (payload) => {
          if (activeQuestion && payload.new.question_id === activeQuestion.id) {
            setAnswers(prev => [...prev, payload.new as SessionAnswer]);
          }
        }
      )
      .subscribe();

    // Initial fetch of participants
    const fetchParticipants = async () => {
      const { data } = await supabase
        .from('live_session_participants')
        .select(`
          *,
          student:students(first_name, last_name)
        `)
        .eq('session_id', session.id);
      
      if (data) {
        setParticipants(data as unknown as SessionParticipant[]);
      }
    };
    fetchParticipants();

    return () => {
      supabase.removeChannel(participantsChannel);
      supabase.removeChannel(answersChannel);
    };
  }, [session, activeQuestion]);

  // Fetch answers when active question changes
  useEffect(() => {
    if (!activeQuestion) {
      setAnswers([]);
      return;
    }

    const fetchAnswers = async () => {
      const { data } = await supabase
        .from('live_session_answers')
        .select('*')
        .eq('question_id', activeQuestion.id);
      
      if (data) {
        setAnswers(data as SessionAnswer[]);
      }
    };
    fetchAnswers();
  }, [activeQuestion?.id]);

  return {
    session,
    participants,
    activeQuestion,
    answers,
    isLoading,
    startSession,
    updateCurrentSlide,
    pushQuestion,
    closeQuestion,
    endSession,
    setSession,
  };
}

// Hook for students to join and participate
export function useStudentLiveSession() {
  const { user } = useAuth();
  const [session, setSession] = useState<LiveSession | null>(null);
  const [participant, setParticipant] = useState<SessionParticipant | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<SessionQuestion | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Join a session by code
  const joinSession = useCallback(async (sessionCode: string) => {
    if (!user) return null;
    setIsLoading(true);

    try {
      // Find the session
      const { data: sessionData, error: sessionError } = await supabase
        .from('live_presentation_sessions')
        .select('*')
        .eq('session_code', sessionCode.toUpperCase())
        .eq('status', 'active')
        .single();

      if (sessionError || !sessionData) {
        toast.error('Session not found or already ended');
        return null;
      }

      // Get student record
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .eq('class_id', sessionData.class_id)
        .single();

      if (studentError || !studentData) {
        toast.error('You are not enrolled in this class');
        return null;
      }

      // Join or update participation
      const { data: participantData, error: participantError } = await supabase
        .from('live_session_participants')
        .upsert({
          session_id: sessionData.id,
          student_id: studentData.id,
          status: 'active',
          last_active_at: new Date().toISOString(),
        }, {
          onConflict: 'session_id,student_id',
        })
        .select()
        .single();

      if (participantError) throw participantError;

      setSession(sessionData as LiveSession);
      setParticipant(participantData as SessionParticipant);
      toast.success('Joined the live session!');
      return sessionData as LiveSession;
    } catch (error) {
      console.error('Error joining session:', error);
      toast.error('Failed to join session');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Submit an answer
  const submitAnswer = useCallback(async (answer: string) => {
    if (!currentQuestion || !participant || hasAnswered) return;

    try {
      const isCorrect = currentQuestion.correct_answer 
        ? answer === currentQuestion.correct_answer 
        : null;

      const timeTaken = currentQuestion.activated_at
        ? Math.floor((Date.now() - new Date(currentQuestion.activated_at).getTime()) / 1000)
        : null;

      const { error } = await supabase
        .from('live_session_answers')
        .insert({
          question_id: currentQuestion.id,
          participant_id: participant.id,
          selected_answer: answer,
          is_correct: isCorrect,
          time_taken_seconds: timeTaken,
        });

      if (error) throw error;

      // Update participant stats
      await supabase
        .from('live_session_participants')
        .update({
          total_questions_answered: participant.total_questions_answered + 1,
          correct_answers: participant.correct_answers + (isCorrect ? 1 : 0),
          last_active_at: new Date().toISOString(),
        })
        .eq('id', participant.id);

      setHasAnswered(true);
      toast.success('Answer submitted!');
    } catch (error) {
      console.error('Error submitting answer:', error);
      toast.error('Failed to submit answer');
    }
  }, [currentQuestion, participant, hasAnswered]);

  // Leave session
  const leaveSession = useCallback(async () => {
    if (!participant) return;

    try {
      await supabase
        .from('live_session_participants')
        .update({ status: 'left' })
        .eq('id', participant.id);

      setSession(null);
      setParticipant(null);
      setCurrentQuestion(null);
    } catch (error) {
      console.error('Error leaving session:', error);
    }
  }, [participant]);

  // Subscribe to real-time updates for student
  useEffect(() => {
    if (!session) return;

    // Subscribe to session updates (slide changes, status)
    const sessionChannel = supabase
      .channel(`session-${session.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_presentation_sessions',
          filter: `id=eq.${session.id}`,
        },
        (payload) => {
          const updated = payload.new as LiveSession;
          setSession(updated);
          if (updated.status === 'ended') {
            toast.info('The live session has ended');
          }
        }
      )
      .subscribe();

    // Subscribe to question updates
    const questionsChannel = supabase
      .channel(`questions-${session.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_session_questions',
          filter: `session_id=eq.${session.id}`,
        },
        async (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const question = payload.new as SessionQuestion;
            if (question.is_active) {
              setCurrentQuestion(question);
              setHasAnswered(false);
            } else if (currentQuestion?.id === question.id) {
              setCurrentQuestion(null);
            }
          }
        }
      )
      .subscribe();

    // Check for active question on join
    const checkActiveQuestion = async () => {
      const { data } = await supabase
        .from('live_session_questions')
        .select('*')
        .eq('session_id', session.id)
        .eq('is_active', true)
        .single();

      if (data) {
        setCurrentQuestion(data as SessionQuestion);
        
        // Check if already answered
        if (participant) {
          const { data: answerData } = await supabase
            .from('live_session_answers')
            .select('id')
            .eq('question_id', data.id)
            .eq('participant_id', participant.id)
            .single();
          
          setHasAnswered(!!answerData);
        }
      }
    };
    checkActiveQuestion();

    return () => {
      supabase.removeChannel(sessionChannel);
      supabase.removeChannel(questionsChannel);
    };
  }, [session, participant, currentQuestion?.id]);

  return {
    session,
    participant,
    currentQuestion,
    hasAnswered,
    isLoading,
    joinSession,
    submitAnswer,
    leaveSession,
  };
}
