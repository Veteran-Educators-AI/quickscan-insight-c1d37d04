import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, LogOut, CheckCircle2, Clock, Send, Loader2, Users, Zap, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { useStudentLiveSession } from '@/hooks/useLiveSession';
import nyclogicLogo from '@/assets/nyclogic-presents-logo.png';

export default function StudentLiveSession() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const {
    session,
    participant,
    currentQuestion,
    hasAnswered,
    isLoading,
    joinSession,
    submitAnswer,
    leaveSession,
  } = useStudentLiveSession();

  const [sessionCode, setSessionCode] = useState(searchParams.get('code') || '');
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  // Auto-join if code is in URL
  useEffect(() => {
    const code = searchParams.get('code');
    if (code && user && !session) {
      joinSession(code);
    }
  }, [searchParams, user, session, joinSession]);

  // Timer for questions
  useEffect(() => {
    if (!currentQuestion?.time_limit_seconds || !currentQuestion.activated_at || hasAnswered) {
      setTimeRemaining(null);
      return;
    }

    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - new Date(currentQuestion.activated_at!).getTime()) / 1000);
      const remaining = Math.max(0, currentQuestion.time_limit_seconds! - elapsed);
      setTimeRemaining(remaining);

      if (remaining === 0 && !hasAnswered) {
        // Time's up - could auto-submit or show message
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [currentQuestion, hasAnswered]);

  // Handle answer submission
  const handleSubmit = async () => {
    if (!selectedAnswer) return;
    await submitAnswer(selectedAnswer);
    setShowResult(true);
  };

  // Handle leaving
  const handleLeave = async () => {
    await leaveSession();
    navigate('/student/dashboard');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-white animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-white/10 bg-white/5 backdrop-blur-lg">
          <CardContent className="pt-6 text-center">
            <p className="text-white/80 mb-4">Please log in to join a live session</p>
            <Button onClick={() => navigate('/student/login')}>
              Log In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Join screen
  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-8">
            <img 
              src={nyclogicLogo} 
              alt="NYClogic" 
              className="h-20 w-20 mx-auto mb-4 drop-shadow-2xl"
            />
            <h1 className="text-2xl font-bold text-white mb-2">Join Live Session</h1>
            <p className="text-white/60">Enter the code your teacher shared</p>
          </div>

          <Card className="border-white/10 bg-white/5 backdrop-blur-lg">
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label className="text-white/80">Session Code</Label>
                <Input
                  value={sessionCode}
                  onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
                  placeholder="XXXXXX"
                  className="text-center text-2xl font-mono tracking-widest bg-white/10 border-white/20 text-white placeholder:text-white/30"
                  maxLength={6}
                />
              </div>

              <Button
                className="w-full gap-2"
                size="lg"
                disabled={sessionCode.length !== 6 || isLoading}
                onClick={() => joinSession(sessionCode)}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Radio className="h-4 w-4" />
                )}
                Join Session
              </Button>
            </CardContent>
          </Card>

          <Button
            variant="ghost"
            className="w-full mt-4 text-white/60 hover:text-white"
            onClick={() => navigate('/student/dashboard')}
          >
            Back to Dashboard
          </Button>
        </motion.div>
      </div>
    );
  }

  // Active session view
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <img src={nyclogicLogo} alt="NYClogic" className="h-10 w-10" />
          <div>
            <p className="text-white font-medium text-sm">{session.title}</p>
            <p className="text-white/60 text-xs">{session.topic}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge 
            variant="outline" 
            className={cn(
              "border-emerald-500/50 text-emerald-400",
              session.status !== 'active' && "border-amber-500/50 text-amber-400"
            )}
          >
            <div className="w-2 h-2 rounded-full bg-current mr-2 animate-pulse" />
            {session.status === 'active' ? 'Live' : session.status}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="text-white/60 hover:text-white"
            onClick={handleLeave}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <AnimatePresence mode="wait">
          {currentQuestion ? (
            <motion.div
              key="question"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl"
            >
              {/* Timer */}
              {timeRemaining !== null && (
                <div className="flex justify-center mb-4">
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-lg px-4 py-1",
                      timeRemaining <= 10 
                        ? "border-rose-500/50 text-rose-400" 
                        : "border-white/30 text-white"
                    )}
                  >
                    <Clock className="h-4 w-4 mr-2" />
                    {timeRemaining}s
                  </Badge>
                </div>
              )}

              {/* Question card */}
              <Card className="border-white/10 bg-white/5 backdrop-blur-lg mb-4">
                <CardHeader>
                  {/* Geometry shape / diagram */}
                  {(currentQuestion as any).svg && (
                    <div
                      className="flex justify-center mb-4 [&_svg]:max-w-full [&_svg]:h-auto [&_svg]:max-h-64"
                      dangerouslySetInnerHTML={{ __html: (currentQuestion as any).svg }}
                    />
                  )}
                  <CardTitle className="text-white text-xl text-center">
                    {currentQuestion.question_prompt}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {hasAnswered ? (
                    <div className="text-center py-8">
                      <CheckCircle2 className="h-16 w-16 text-emerald-400 mx-auto mb-4" />
                      <p className="text-white text-lg font-medium">Answer Submitted!</p>
                      <p className="text-white/60 mt-2">Waiting for others...</p>
                    </div>
                  ) : (
                    <>
                      {(currentQuestion.options as string[] || []).map((option, idx) => {
                        const letters = ['A', 'B', 'C', 'D'];
                        const isSelected = selectedAnswer === option;

                        return (
                          <motion.button
                            key={idx}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setSelectedAnswer(option)}
                            className={cn(
                              "w-full flex items-center gap-4 p-4 rounded-xl text-left transition-all",
                              "border-2",
                              isSelected
                                ? "border-amber-400 bg-amber-500/20"
                                : "border-white/20 bg-white/5 hover:border-white/40"
                            )}
                          >
                            <span className={cn(
                              "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold",
                              isSelected ? "bg-amber-400 text-black" : "bg-white/10 text-white"
                            )}>
                              {letters[idx]}
                            </span>
                            <span className="text-white">{option}</span>
                          </motion.button>
                        );
                      })}

                      <Button
                        className="w-full mt-4 gap-2"
                        size="lg"
                        disabled={!selectedAnswer}
                        onClick={handleSubmit}
                      >
                        <Send className="h-4 w-4" />
                        Submit Answer
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="waiting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <div className="relative mb-6">
                <div className="w-32 h-32 rounded-full bg-white/5 flex items-center justify-center mx-auto">
                  <HelpCircle className="h-16 w-16 text-white/20" />
                </div>
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-amber-400/30"
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Waiting for Question</h2>
              <p className="text-white/60">Your teacher will push a question soon...</p>
              
              {/* Stats */}
              {participant && (
                <div className="flex justify-center gap-6 mt-8">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-emerald-400">{participant.correct_answers}</p>
                    <p className="text-white/60 text-sm">Correct</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-white">{participant.total_questions_answered}</p>
                    <p className="text-white/60 text-sm">Answered</p>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <footer className="p-4 text-center">
        <p className="text-white/40 text-xs">
          {session.participation_mode === 'pairs' ? '👥 Pair Mode' : '👤 Individual Mode'} • 
          +{session.credit_for_participation} credit for participation
        </p>
      </footer>
    </div>
  );
}
