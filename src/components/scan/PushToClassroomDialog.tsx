import { useState } from 'react';
import { Upload, Loader2, CheckCircle, AlertCircle, BookOpen, ArrowRight, MessageSquare, Edit3 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { useGoogleClassroom } from '@/hooks/useGoogleClassroom';
import { useStudentNames } from '@/lib/StudentNameContext';

interface GradeToSync {
  studentName: string;
  studentEmail?: string;
  courseId: string;
  courseWorkId: string;
  submissionId: string;
  grade: number;
  maxPoints: number;
  percentage: number;
  feedback?: string;
  justification?: string;
}

interface PushToClassroomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gradesToSync: GradeToSync[];
  assignmentTitle?: string;
  onSyncComplete?: (successCount: number, failCount: number) => void;
}

export function PushToClassroomDialog({
  open,
  onOpenChange,
  gradesToSync,
  assignmentTitle,
  onSyncComplete,
}: PushToClassroomDialogProps) {
  const { pushGradeToClassroom, hasClassroomAccess } = useGoogleClassroom();
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [autoReturn, setAutoReturn] = useState(false);
  const [includeFeedback, setIncludeFeedback] = useState(true);
  const [feedbackComments, setFeedbackComments] = useState<Record<string, string>>({});
  const [syncResults, setSyncResults] = useState<{ studentName: string; success: boolean; error?: string }[]>([]);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [step, setStep] = useState<'preview' | 'syncing' | 'complete'>('preview');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Initialize feedback comments from grade justifications
  useState(() => {
    if (gradesToSync.length > 0) {
      const initialComments: Record<string, string> = {};
      gradesToSync.forEach((grade) => {
        const key = `${grade.courseId}-${grade.submissionId}`;
        initialComments[key] = grade.feedback || grade.justification || '';
      });
      setFeedbackComments(initialComments);
    }
  });

  // Check access when dialog opens
  useState(() => {
    if (open) {
      hasClassroomAccess().then(setHasAccess);
    }
  });

  const handleSync = async () => {
    if (gradesToSync.length === 0) {
      toast.error('No grades to sync');
      return;
    }

    setIsSyncing(true);
    setStep('syncing');
    setSyncProgress(0);
    setSyncResults([]);

    const results: { studentName: string; success: boolean; error?: string }[] = [];

    for (let i = 0; i < gradesToSync.length; i++) {
      const grade = gradesToSync[i];
      const feedbackKey = `${grade.courseId}-${grade.submissionId}`;
      const feedback = includeFeedback ? feedbackComments[feedbackKey] : undefined;
      
      try {
        const success = await pushGradeToClassroom(
          grade.courseId,
          grade.courseWorkId,
          grade.submissionId,
          grade.grade,
          autoReturn,
          feedback
        );

        results.push({
          studentName: grade.studentName,
          success,
          error: success ? undefined : 'Failed to update grade',
        });
      } catch (error) {
        results.push({
          studentName: grade.studentName,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      setSyncProgress(Math.round(((i + 1) / gradesToSync.length) * 100));
      setSyncResults([...results]);
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    setIsSyncing(false);
    setStep('complete');

    if (successCount > 0 && failCount === 0) {
      toast.success(`Successfully synced ${successCount} grade(s) to Google Classroom`);
    } else if (successCount > 0) {
      toast.warning(`Synced ${successCount} grade(s), ${failCount} failed`);
    } else {
      toast.error('Failed to sync grades to Google Classroom');
    }

    onSyncComplete?.(successCount, failCount);
  };

  const toggleCard = (key: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedCards(newExpanded);
  };

  const updateFeedback = (key: string, value: string) => {
    setFeedbackComments(prev => ({ ...prev, [key]: value }));
  };

  const getGradeColor = (percentage: number) => {
    if (percentage >= 90) return 'text-green-600 dark:text-green-400';
    if (percentage >= 80) return 'text-blue-600 dark:text-blue-400';
    if (percentage >= 70) return 'text-yellow-600 dark:text-yellow-400';
    if (percentage >= 60) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  const renderContent = () => {
    if (hasAccess === false) {
      return (
        <div className="space-y-6 text-center py-8">
          <div className="mx-auto w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-orange-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Google Classroom Not Connected</h3>
            <p className="text-muted-foreground mt-2">
              To push grades to Google Classroom, you need to sign in with your Google account 
              and grant Classroom access.
            </p>
          </div>
          <Alert>
            <AlertDescription>
              Go to Settings → Integrations and connect your Google account with Classroom permissions.
            </AlertDescription>
          </Alert>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      );
    }

    switch (step) {
      case 'preview':
        return (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold">Grades to Sync</h3>
              <p className="text-sm text-muted-foreground">
                {gradesToSync.length} grade(s) will be pushed to Google Classroom
                {assignmentTitle && ` for "${assignmentTitle}"`}
              </p>
            </div>

            <ScrollArea className="h-[300px] border rounded-lg p-3">
              <div className="space-y-2">
                {gradesToSync.map((grade, index) => {
                  const feedbackKey = `${grade.courseId}-${grade.submissionId}`;
                  const isExpanded = expandedCards.has(feedbackKey);
                  const currentFeedback = feedbackComments[feedbackKey] || '';
                  
                  return (
                    <Collapsible key={index} open={isExpanded} onOpenChange={() => toggleCard(feedbackKey)}>
                      <Card className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-sm">{grade.studentName}</p>
                            {grade.studentEmail && (
                              <p className="text-xs text-muted-foreground">
                                {revealRealNames ? grade.studentEmail : 'Email hidden'}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className={`font-bold ${getGradeColor(grade.percentage)}`}>
                                {grade.grade}/{grade.maxPoints}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {grade.percentage.toFixed(0)}%
                              </p>
                            </div>
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <Edit3 className={`h-4 w-4 transition-colors ${currentFeedback ? 'text-primary' : 'text-muted-foreground'}`} />
                              </Button>
                            </CollapsibleTrigger>
                          </div>
                        </div>
                        
                        <CollapsibleContent className="mt-3 pt-3 border-t">
                          <div className="space-y-2">
                            <Label className="text-xs flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              Feedback Comment
                            </Label>
                            <Textarea
                              placeholder="Add personalized feedback for this student..."
                              value={currentFeedback}
                              onChange={(e) => updateFeedback(feedbackKey, e.target.value)}
                              rows={3}
                              className="text-sm resize-none"
                            />
                            {grade.justification && !currentFeedback && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                onClick={() => updateFeedback(feedbackKey, grade.justification || '')}
                              >
                                Use AI Justification
                              </Button>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Card>
                    </Collapsible>
                  );
                })}
              </div>
            </ScrollArea>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="include-feedback" className="flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Include feedback comments
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Add written feedback as private comments
                  </p>
                </div>
                <Switch
                  id="include-feedback"
                  checked={includeFeedback}
                  onCheckedChange={setIncludeFeedback}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-return">Auto-return to students</Label>
                  <p className="text-xs text-muted-foreground">
                    Immediately return graded work to students
                  </p>
                </div>
                <Switch
                  id="auto-return"
                  checked={autoReturn}
                  onCheckedChange={setAutoReturn}
                />
              </div>
            </div>

            <Alert>
              <BookOpen className="h-4 w-4" />
              <AlertDescription>
                Grades will be synced as the assigned grade in Google Classroom.
                {includeFeedback && ' Feedback will be added as private comments.'}
                {autoReturn 
                  ? ' Students will be notified immediately.' 
                  : ' You can return them to students later from Classroom.'}
              </AlertDescription>
            </Alert>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSync} className="flex-1 gap-2">
                <Upload className="h-4 w-4" />
                Push {gradesToSync.length} Grade(s)
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );

      case 'syncing':
        return (
          <div className="space-y-6 text-center py-8">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Syncing Grades</h3>
              <p className="text-muted-foreground mt-2">
                Pushing grades to Google Classroom...
              </p>
            </div>
            <Progress value={syncProgress} className="w-full max-w-xs mx-auto" />
            <p className="text-sm text-muted-foreground">
              {syncResults.length} of {gradesToSync.length} complete
            </p>
          </div>
        );

      case 'complete':
        const successCount = syncResults.filter(r => r.success).length;
        const failCount = syncResults.filter(r => !r.success).length;

        return (
          <div className="space-y-4">
            <div className="text-center">
              <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
                failCount === 0 ? 'bg-green-500/10' : 'bg-yellow-500/10'
              }`}>
                {failCount === 0 ? (
                  <CheckCircle className="h-8 w-8 text-green-500" />
                ) : (
                  <AlertCircle className="h-8 w-8 text-yellow-500" />
                )}
              </div>
              <h3 className="text-lg font-semibold">
                {failCount === 0 ? 'Sync Complete!' : 'Sync Completed with Errors'}
              </h3>
              <p className="text-muted-foreground mt-2">
                {successCount} synced successfully
                {failCount > 0 && `, ${failCount} failed`}
              </p>
            </div>

            <ScrollArea className="h-[200px] border rounded-lg p-3">
              <div className="space-y-2">
                {syncResults.map((result, index) => (
                  <div
                    key={index}
                    className={`flex items-center gap-3 p-2 rounded-lg ${
                      result.success ? 'bg-green-500/5' : 'bg-red-500/5'
                    }`}
                  >
                    {result.success ? (
                      <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{result.studentName}</p>
                      {result.error && (
                        <p className="text-xs text-red-500">{result.error}</p>
                      )}
                    </div>
                    <Badge variant={result.success ? 'default' : 'destructive'} className="text-xs">
                      {result.success ? 'Synced' : 'Failed'}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex gap-3">
              {failCount > 0 && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep('preview');
                    setSyncResults([]);
                  }}
                >
                  Retry Failed
                </Button>
              )}
              <Button onClick={() => onOpenChange(false)} className="flex-1">
                Done
              </Button>
            </div>
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Push Grades to Google Classroom
          </DialogTitle>
          <DialogDescription>
            Sync AI-graded results back to Google Classroom
          </DialogDescription>
        </DialogHeader>
        
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}
