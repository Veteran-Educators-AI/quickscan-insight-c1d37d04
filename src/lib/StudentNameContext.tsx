import { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from 'react';
import { getStudentPseudonym, getPseudonymInitials } from './studentPseudonyms';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const COUNTDOWN_INTERVAL_MS = 1000; // 1 second

interface StudentNameContextType {
  revealRealNames: boolean;
  toggleRevealNames: () => void;
  getDisplayName: (studentId: string, firstName: string, lastName: string) => string;
  getDisplayInitials: (studentId: string, firstName: string, lastName: string) => string;
  getDisplayEmail: (studentId: string, email: string | null) => string;
  remainingSeconds: number | null;
}

const StudentNameContext = createContext<StudentNameContextType | undefined>(undefined);

export function StudentNameProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [revealRealNames, setRevealRealNames] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  // Log audit event to database
  const logAuditEvent = useCallback(async (action: string) => {
    try {
      if (!user) return;

      await supabase.from('ferpa_audit_log').insert({
        teacher_id: user.id,
        action,
        user_agent: navigator.userAgent,
      });
    } catch (error) {
      console.error('Failed to log audit event:', error);
    }
  }, [user]);

  const resetToPrivate = useCallback(() => {
    setRevealRealNames(false);
    setRemainingSeconds(null);
    logAuditEvent('auto_reverted_to_pseudonyms');
  }, [logAuditEvent]);

  const updateCountdown = useCallback(() => {
    const elapsed = Date.now() - lastActivityRef.current;
    const remaining = Math.max(0, Math.ceil((INACTIVITY_TIMEOUT_MS - elapsed) / 1000));
    setRemainingSeconds(remaining);
    
    if (remaining <= 0) {
      resetToPrivate();
    }
  }, [resetToPrivate]);

  const resetInactivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    setRemainingSeconds(Math.ceil(INACTIVITY_TIMEOUT_MS / 1000));
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(resetToPrivate, INACTIVITY_TIMEOUT_MS);
  }, [resetToPrivate]);

  // Set up activity listeners when real names are visible
  useEffect(() => {
    if (!revealRealNames) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      setRemainingSeconds(null);
      return;
    }

    // Start the inactivity timer and countdown
    resetInactivityTimer();
    countdownRef.current = setInterval(updateCountdown, COUNTDOWN_INTERVAL_MS);

    // Activity events to track
    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    
    const handleActivity = () => {
      resetInactivityTimer();
    };

    activityEvents.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [revealRealNames, resetInactivityTimer, updateCountdown]);

  const toggleRevealNames = useCallback(() => {
    setRevealRealNames(prev => {
      const newValue = !prev;
      logAuditEvent(newValue ? 'revealed_real_names' : 'hidden_real_names');
      return newValue;
    });
  }, [logAuditEvent]);

  const getDisplayName = useCallback((studentId: string, firstName: string, lastName: string) => {
    if (revealRealNames) {
      return `${firstName} ${lastName}`;
    }
    return getStudentPseudonym(studentId);
  }, [revealRealNames]);

  const getDisplayInitials = useCallback((studentId: string, firstName: string, lastName: string) => {
    if (revealRealNames) {
      return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    }
    const pseudonym = getStudentPseudonym(studentId);
    return getPseudonymInitials(pseudonym);
  }, [revealRealNames]);

  const getDisplayEmail = useCallback((studentId: string, email: string | null) => {
    if (revealRealNames) {
      return email || 'No email';
    }
    // Generate a deterministic masked email from the pseudonym
    const pseudonym = getStudentPseudonym(studentId);
    const slug = pseudonym.toLowerCase().replace(/\s+/g, '.');
    return `${slug}@student.protected`;
  }, [revealRealNames]);

  return (
    <StudentNameContext.Provider value={{ 
      revealRealNames, 
      toggleRevealNames, 
      getDisplayName, 
      getDisplayInitials,
      getDisplayEmail,
      remainingSeconds
    }}>
      {children}
    </StudentNameContext.Provider>
  );
}

export function useStudentNames() {
  const context = useContext(StudentNameContext);
  if (context === undefined) {
    throw new Error('useStudentNames must be used within a StudentNameProvider');
  }
  return context;
}
