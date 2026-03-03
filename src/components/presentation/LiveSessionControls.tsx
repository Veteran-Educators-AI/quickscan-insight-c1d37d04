import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Play, Square, Send, Clock, CheckCircle2, XCircle, Radio, UserPlus, Copy, Pause, Zap, MinusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useLiveSession, LiveSession, SessionParticipant, SessionAnswer } from '@/hooks/useLiveSession';

interface LiveSessionControlsProps {
  presentationId: string;
  presentationTitle: string;
  topic: string;
  classId: string;
  currentSlideIndex: number;
  currentSlideQuestion?: {
    prompt: string;
    options?: string[];
    answer?: string;
    explanation?: string;
    svg?: string;
    imagePrompt?: string;
  };
  themeAccentHex?: string;
}

export function LiveSessionControls({
  presentationId,
  presentationTitle,
  topic,
  classId,
  currentSlideIndex,
  currentSlideQuestion,
  themeAccentHex = '#fbbf24',
}: LiveSessionControlsProps) {
  const {
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
  } = useLiveSession();

  const [showStartDialog, setShowStartDialog] = useState(false);
  const [participationMode, setParticipationMode] = useState<'individual' | 'pairs'>('individual');
  const [creditAmount, setCreditAmount] = useState('5');
  const [deductionAmount, setDeductionAmount] = useState('5');
  const [timeLimit, setTimeLimit] = useState('30');
  const [showParticipants, setShowParticipants] = useState(false);

  const handleStartSession = async () => {
    const result = await startSession(
      presentationId,
      classId,
      presentationTitle,
      topic,
      participationMode,
      parseInt(creditAmount) || 5,
      parseInt(deductionAmount) || 5
    );
    if (result) {
      setShowStartDialog(false);
    }
  };

  const handlePushQuestion = async () => {
    if (!currentSlideQuestion) {
      toast.error('No question on current slide');
      return;
    }

    await pushQuestion(
      currentSlideIndex,
      currentSlideQuestion.prompt,
      currentSlideQuestion.options || [],
      currentSlideQuestion.answer,
      currentSlideQuestion.explanation,
      parseInt(timeLimit) || 30,
      currentSlideQuestion.svg,
      currentSlideQuestion.imagePrompt
    );
  };

  const copySessionCode = () => {
    if (session) {
      navigator.clipboard.writeText(session.session_code);
      toast.success('Session code copied!');
    }
  };

  const activeParticipants = participants.filter(p => p.status === 'active');
  const answeredCount = answers.length;
  const correctCount = answers.filter(a => a.is_correct).length;

  if (!classId) {
    return null;
  }

  return (
    <>
      {/* Floating control panel */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
      >
        <Card className="border-white/20 bg-black/80 backdrop-blur-xl shadow-2xl">
          <CardContent className="p-3">
            {!session ? (
              <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
                <DialogTrigger asChild>
                  <Button
                    className="gap-2"
                    style={{ backgroundColor: themeAccentHex }}
                  >
                    <Radio className="h-4 w-4" />
                    Go Live
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Radio className="h-5 w-5 text-rose-500" />
                      Start Live Session
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Participation Mode</Label>
                      <RadioGroup
                        value={participationMode}
                        onValueChange={(v) => setParticipationMode(v as 'individual' | 'pairs')}
                        className="flex gap-4"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="individual" id="individual" />
                          <Label htmlFor="individual" className="cursor-pointer">Individual</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="pairs" id="pairs" />
                          <Label htmlFor="pairs" className="cursor-pointer">Pairs</Label>
                        </div>
                      </RadioGroup>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1">
                          <Zap className="h-3 w-3 text-emerald-500" />
                          Credit for Participation
                        </Label>
                        <Input
                          type="number"
                          value={creditAmount}
                          onChange={(e) => setCreditAmount(e.target.value)}
                          min="0"
                          max="20"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1">
                          <MinusCircle className="h-3 w-3 text-rose-500" />
                          Deduction for Non-Participation
                        </Label>
                        <Input
                          type="number"
                          value={deductionAmount}
                          onChange={(e) => setDeductionAmount(e.target.value)}
                          min="0"
                          max="20"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Default Time Limit (seconds)
                      </Label>
                      <Select value={timeLimit} onValueChange={setTimeLimit}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15">15 seconds</SelectItem>
                          <SelectItem value="30">30 seconds</SelectItem>
                          <SelectItem value="45">45 seconds</SelectItem>
                          <SelectItem value="60">60 seconds</SelectItem>
                          <SelectItem value="90">90 seconds</SelectItem>
                          <SelectItem value="120">2 minutes</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowStartDialog(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleStartSession} 
                      disabled={isLoading}
                      className="gap-2"
                    >
                      <Play className="h-4 w-4" />
                      Start Session
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : (
              <div className="flex items-center gap-3">
                {/* Session code */}
                <div 
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-white/10 transition-colors"
                  onClick={copySessionCode}
                  title="Click to copy"
                >
                  <Badge variant="outline" className="text-lg font-mono tracking-widest border-white/30 text-white">
                    {session.session_code}
                  </Badge>
                  <Copy className="h-4 w-4 text-white/60" />
                </div>

                {/* Participant count */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-white/80 hover:text-white hover:bg-white/10"
                  onClick={() => setShowParticipants(!showParticipants)}
                >
                  <Users className="h-4 w-4" />
                  <span>{activeParticipants.length}</span>
                </Button>

                {/* Push question button */}
                {currentSlideQuestion && !activeQuestion && (
                  <Button
                    size="sm"
                    className="gap-2"
                    style={{ backgroundColor: themeAccentHex }}
                    onClick={handlePushQuestion}
                  >
                    <Send className="h-4 w-4" />
                    Push Question
                  </Button>
                )}

                {/* Active question indicator */}
                {activeQuestion && (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-white/80">
                      <div className="relative">
                        <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                      </div>
                      <span className="text-sm">
                        {answeredCount}/{activeParticipants.length} answered
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 border-white/30 text-white hover:bg-white/10"
                      onClick={closeQuestion}
                    >
                      <Square className="h-3 w-3" />
                      Close
                    </Button>
                  </div>
                )}

                {/* End session button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                  onClick={endSession}
                >
                  <Square className="h-4 w-4" />
                  End
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Participants panel */}
      <AnimatePresence>
        {session && showParticipants && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="fixed left-4 top-24 bottom-24 w-72 z-40"
          >
            <Card className="h-full border-white/20 bg-black/80 backdrop-blur-xl overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Participants
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {activeParticipants.length} online
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-y-auto max-h-[calc(100%-60px)] space-y-2">
                {participants.length === 0 ? (
                  <p className="text-white/50 text-sm text-center py-4">
                    Waiting for students to join...
                  </p>
                ) : (
                  participants.map((p) => (
                    <div
                      key={p.id}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-lg",
                        p.status === 'active' ? 'bg-white/5' : 'bg-white/5 opacity-50'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          p.status === 'active' ? 'bg-emerald-500' : 'bg-gray-500'
                        )} />
                        <span className="text-white text-sm">
                          {p.student?.first_name} {p.student?.last_name?.charAt(0)}.
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        {activeQuestion && (
                          answers.find(a => a.participant_id === p.id) ? (
                            answers.find(a => a.participant_id === p.id)?.is_correct ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <XCircle className="h-4 w-4 text-rose-400" />
                            )
                          ) : (
                            <Clock className="h-4 w-4 text-white/30" />
                          )
                        )}
                        <span className="text-white/60">
                          {p.correct_answers}/{p.total_questions_answered}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
