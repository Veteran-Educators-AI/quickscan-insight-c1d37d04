import { useState } from 'react';
import { Loader2, Mail, Users, Send, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useStudentNames } from '@/lib/StudentNameContext';

interface StrugglingStudent {
  id: string;
  firstName: string;
  lastName: string;
  classId: string;
  className: string;
  averageGrade: number;
  weakTopicCount: number;
  email?: string;
  parentEmail?: string;
  weakTopics?: string[];
}

interface BatchRemediationEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: StrugglingStudent[];
}

interface SendResult {
  studentId: string;
  studentName: string;
  status: 'success' | 'failed' | 'no-email';
  message: string;
}

export function BatchRemediationEmailDialog({
  open,
  onOpenChange,
  students,
}: BatchRemediationEmailDialogProps) {
  const { toast } = useToast();
  const { getDisplayName } = useStudentNames();
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set(students.map(s => s.id)));
  const [recipientType, setRecipientType] = useState<'student' | 'parent' | 'both'>('both');
  const [includeHints, setIncludeHints] = useState(true);
  const [questionsPerStudent, setQuestionsPerStudent] = useState(5);
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(0);
  const [sendResults, setSendResults] = useState<SendResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  const toggleStudent = (studentId: string) => {
    const newSelected = new Set(selectedStudents);
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId);
    } else {
      newSelected.add(studentId);
    }
    setSelectedStudents(newSelected);
  };

  const selectAll = () => {
    setSelectedStudents(new Set(students.map(s => s.id)));
  };

  const selectNone = () => {
    setSelectedStudents(new Set());
  };

  const handleSend = async () => {
    if (selectedStudents.size === 0) {
      toast({
        title: 'No students selected',
        description: 'Please select at least one student to send remediation emails.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    setSendProgress(0);
    setSendResults([]);
    setShowResults(false);

    const selectedList = students.filter(s => selectedStudents.has(s.id));
    const results: SendResult[] = [];

    for (let i = 0; i < selectedList.length; i++) {
      const student = selectedList[i];
      // Raw name goes in the email addressed to the student; teacher-facing rows use the pseudonym.
      const studentName = `${student.firstName} ${student.lastName}`;
      const displayName = getDisplayName(student.id, student.firstName, student.lastName);
      
      try {
        // First generate remediation questions based on weak topics
        const weakTopics = student.weakTopics || [];
        const topicName = weakTopics.length > 0 ? weakTopics[0] : 'Math Practice';

        // Generate questions
        const { data: questionsData, error: questionsError } = await supabase.functions.invoke(
          'generate-remediation-questions',
          {
            body: {
              misconceptions: weakTopics.length > 0 
                ? weakTopics.map(t => `Struggling with ${t}`)
                : ['General math practice needed'],
              topicName,
              studentLevel: student.averageGrade < 50 ? 'basic' : student.averageGrade < 70 ? 'intermediate' : 'advanced',
              questionCount: questionsPerStudent,
            },
          }
        );

        if (questionsError || !questionsData?.questions) {
          throw new Error(questionsError?.message || 'Failed to generate questions');
        }

        // Send the email with generated questions
        const { data: emailData, error: emailError } = await supabase.functions.invoke(
          'send-remediation-email',
          {
            body: {
              studentId: student.id,
              questions: questionsData.questions,
              topicName,
              recipientType,
              includeHints,
            },
          }
        );

        if (emailError) {
          throw new Error(emailError.message);
        }

        if (emailData?.error) {
          if (emailData.missingEmails) {
            results.push({
              studentId: student.id,
              studentName: displayName,
              status: 'no-email',
              message: `Missing: ${emailData.missingEmails.join(', ')}`,
            });
          } else {
            throw new Error(emailData.error);
          }
        } else {
          results.push({
            studentId: student.id,
            studentName: displayName,
            status: 'success',
            message: `Sent to ${emailData?.emailsSent?.join(', ') || 'recipient'}`,
          });
        }
      } catch (error) {
        console.error(`Error sending to ${displayName}:`, error);
        results.push({
          studentId: student.id,
          studentName: displayName,
          status: 'failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      setSendProgress(Math.round(((i + 1) / selectedList.length) * 100));
      setSendResults([...results]);
    }

    setIsSending(false);
    setShowResults(true);

    const successCount = results.filter(r => r.status === 'success').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    const noEmailCount = results.filter(r => r.status === 'no-email').length;

    if (successCount === results.length) {
      toast({
        title: 'All emails sent!',
        description: `Successfully sent remediation emails to ${successCount} student(s).`,
      });
    } else if (successCount > 0) {
      toast({
        title: 'Partially completed',
        description: `Sent: ${successCount}, Failed: ${failedCount}, No email: ${noEmailCount}`,
        variant: 'default',
      });
    } else {
      toast({
        title: 'Failed to send emails',
        description: 'No emails were sent successfully. Check student email addresses.',
        variant: 'destructive',
      });
    }
  };

  const resetDialog = () => {
    setShowResults(false);
    setSendResults([]);
    setSendProgress(0);
    setSelectedStudents(new Set(students.map(s => s.id)));
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      resetDialog();
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Batch Remediation Emails
          </DialogTitle>
          <DialogDescription>
            Send personalized practice worksheets to multiple struggling students at once
          </DialogDescription>
        </DialogHeader>

        {showResults ? (
          // Results View
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 text-center">
                <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-1" />
                <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                  {sendResults.filter(r => r.status === 'success').length}
                </div>
                <div className="text-xs text-green-600">Sent</div>
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-950/30 rounded-lg p-3 text-center">
                <AlertTriangle className="h-6 w-6 text-yellow-600 mx-auto mb-1" />
                <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">
                  {sendResults.filter(r => r.status === 'no-email').length}
                </div>
                <div className="text-xs text-yellow-600">No Email</div>
              </div>
              <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3 text-center">
                <XCircle className="h-6 w-6 text-red-600 mx-auto mb-1" />
                <div className="text-2xl font-bold text-red-700 dark:text-red-400">
                  {sendResults.filter(r => r.status === 'failed').length}
                </div>
                <div className="text-xs text-red-600">Failed</div>
              </div>
            </div>

            <ScrollArea className="flex-1 border rounded-lg">
              <div className="p-3 space-y-2">
                {sendResults.map((result) => (
                  <div
                    key={result.studentId}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border",
                      result.status === 'success' && "bg-green-50 dark:bg-green-950/20 border-green-200",
                      result.status === 'no-email' && "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200",
                      result.status === 'failed' && "bg-red-50 dark:bg-red-950/20 border-red-200"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {result.status === 'success' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                      {result.status === 'no-email' && <AlertTriangle className="h-4 w-4 text-yellow-600" />}
                      {result.status === 'failed' && <XCircle className="h-4 w-4 text-red-600" />}
                      <span className="font-medium text-sm">{result.studentName}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{result.message}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => handleClose(false)}>
                Close
              </Button>
              <Button onClick={resetDialog}>
                Send More
              </Button>
            </DialogFooter>
          </div>
        ) : isSending ? (
          // Sending Progress View
          <div className="flex-1 flex flex-col items-center justify-center py-8">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium mb-2">Sending Remediation Emails...</p>
            <p className="text-sm text-muted-foreground mb-4">
              {Math.round((sendProgress / 100) * selectedStudents.size)} of {selectedStudents.size} students
            </p>
            <div className="w-full max-w-xs">
              <Progress value={sendProgress} className="h-2" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">{sendProgress}% complete</p>
          </div>
        ) : (
          // Selection View
          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            {/* Student Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Students ({selectedStudents.size}/{students.length})
                </Label>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAll}>
                    Select All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={selectNone}>
                    Clear
                  </Button>
                </div>
              </div>
              <ScrollArea className="h-48 border rounded-lg">
                <div className="p-2 space-y-1">
                  {students.map((student) => (
                    <div
                      key={student.id}
                      className={cn(
                        "flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors",
                        selectedStudents.has(student.id) && "bg-primary/5"
                      )}
                    >
                      <Checkbox
                        id={`student-${student.id}`}
                        checked={selectedStudents.has(student.id)}
                        onCheckedChange={() => toggleStudent(student.id)}
                      />
                      <Label
                        htmlFor={`student-${student.id}`}
                        className="flex-1 flex items-center justify-between cursor-pointer"
                      >
                        <div>
                          <span className="font-medium text-sm">
                            {getDisplayName(student.id, student.firstName, student.lastName)}
                          </span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {student.className}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {student.averageGrade}%
                          </Badge>
                          {student.weakTopicCount > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {student.weakTopicCount} weak
                            </Badge>
                          )}
                        </div>
                      </Label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Email Options */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <Label>Send To</Label>
                <RadioGroup
                  value={recipientType}
                  onValueChange={(v) => setRecipientType(v as 'student' | 'parent' | 'both')}
                  className="space-y-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="student" id="student" />
                    <Label htmlFor="student" className="text-sm cursor-pointer">Students Only</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="parent" id="parent" />
                    <Label htmlFor="parent" className="text-sm cursor-pointer">Parents Only</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="both" id="both" />
                    <Label htmlFor="both" className="text-sm cursor-pointer">Both</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-3">
                <Label>Options</Label>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="hints" className="text-sm">Include Hints</Label>
                    <Switch
                      id="hints"
                      checked={includeHints}
                      onCheckedChange={setIncludeHints}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Questions per Student</Label>
                    <div className="flex items-center gap-2">
                      {[3, 5, 7, 10].map((num) => (
                        <Button
                          key={num}
                          variant={questionsPerStudent === num ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setQuestionsPerStudent(num)}
                        >
                          {num}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={selectedStudents.size === 0}
                className="gap-2"
              >
                <Send className="h-4 w-4" />
                Send to {selectedStudents.size} Student{selectedStudents.size !== 1 ? 's' : ''}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
