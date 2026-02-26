import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useStudentNames } from '@/lib/StudentNameContext';
import {
  User,
  AlertTriangle,
  BookOpen,
  ChevronDown,
  TrendingDown,
  FileText,
  Tag,
  Loader2,
  Send,
} from 'lucide-react';

interface MisconceptionPreview {
  name: string;
  topic_name: string | null;
  standard: string | null;
  problem_set: string | null;
  severity: string | null;
  suggested_remedies: string[] | null;
}

interface StudentPreview {
  student_id: string;
  first_name: string;
  last_name: string;
  student_name: string;
  student_email: string | null;
  class_name: string;
  overall_average: number;
  grades_count: number;
  misconceptions: MisconceptionPreview[];
  weak_topics: { topic_name: string; avg_score: number }[];
}

interface ScholarSyncPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId?: string;
  onConfirmSync: () => Promise<void>;
}

export function ScholarSyncPreviewDialog({
  open,
  onOpenChange,
  classId,
  onConfirmSync,
}: ScholarSyncPreviewDialogProps) {
  const { user } = useAuth();
  const { getDisplayName } = useStudentNames();
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const { data: previewData, isLoading } = useQuery({
    queryKey: ['scholar-sync-preview', user?.id, classId],
    queryFn: async () => {
      // Fetch students
      let studentQuery = supabase
        .from('students')
        .select('id, first_name, last_name, email, class_id, classes(name, teacher_id)')
        .eq('classes.teacher_id', user!.id);

      if (classId) {
        studentQuery = studentQuery.eq('class_id', classId);
      }

      const { data: students, error: studentsError } = await studentQuery;
      if (studentsError) throw studentsError;

      if (!students || students.length === 0) {
        return { students: [], totals: { students: 0, grades: 0, misconceptions: 0, weak_topics: 0 } };
      }

      const studentIds = students.map(s => s.id);

      // Fetch grades
      const { data: grades } = await supabase
        .from('grade_history')
        .select('student_id, topic_name, grade, nys_standard')
        .in('student_id', studentIds)
        .eq('teacher_id', user!.id);

      // Fetch misconceptions from analysis_misconceptions (has standards and remedies)
      const { data: analysisMisconceptions } = await supabase
        .from('analysis_misconceptions')
        .select('student_id, topic_name, misconception_text, severity, suggested_remedies, grade_history(nys_standard)')
        .in('student_id', studentIds)
        .eq('teacher_id', user!.id);

      // Fetch worksheets for problem set names
      const { data: worksheets } = await supabase
        .from('worksheets')
        .select('id, title, topics')
        .eq('teacher_id', user!.id);

      // Build preview data
      const studentPreviews: StudentPreview[] = [];
      let totalMisconceptions = 0;
      let totalWeakTopics = 0;
      let totalGrades = 0;

      for (const student of students) {
        const studentGrades = (grades || []).filter(g => g.student_id === student.id);
        const studentMisconceptions = (analysisMisconceptions || []).filter(m => m.student_id === student.id);
        
        totalGrades += studentGrades.length;

        // Calculate average
        const avgGrade = studentGrades.length > 0
          ? Math.round(studentGrades.reduce((sum, g) => sum + g.grade, 0) / studentGrades.length)
          : 0;

        // Calculate weak topics
        const topicScores: Record<string, number[]> = {};
        for (const g of studentGrades) {
          if (!topicScores[g.topic_name]) topicScores[g.topic_name] = [];
          topicScores[g.topic_name].push(g.grade);
        }

        const weakTopics: { topic_name: string; avg_score: number }[] = [];
        for (const [topic, scores] of Object.entries(topicScores)) {
          const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
          if (avg < 70) {
            weakTopics.push({ topic_name: topic, avg_score: avg });
          }
        }
        weakTopics.sort((a, b) => a.avg_score - b.avg_score);
        totalWeakTopics += weakTopics.length;

        // Map misconceptions with standards and problem sets
        const misconceptions: MisconceptionPreview[] = studentMisconceptions.map(m => {
          const gradeHistory = m.grade_history as any;
          const standard = gradeHistory?.nys_standard || null;
          
          // Find associated worksheet
          const associatedWorksheet = (worksheets || []).find(w => {
            const topics = w.topics as string[];
            return topics?.some(t => 
              t.toLowerCase().includes(m.topic_name?.toLowerCase() || '')
            ) || w.title?.toLowerCase().includes(m.topic_name?.toLowerCase() || '');
          });

          return {
            name: m.misconception_text,
            topic_name: m.topic_name,
            standard,
            problem_set: associatedWorksheet?.title || null,
            severity: m.severity,
            suggested_remedies: m.suggested_remedies,
          };
        });

        totalMisconceptions += misconceptions.length;

        const classData = student.classes as any;
        studentPreviews.push({
          student_id: student.id,
          first_name: student.first_name,
          last_name: student.last_name,
          student_name: '', // Rendered via pseudonym
          student_email: student.email,
          class_name: classData?.name || 'Unknown',
          overall_average: avgGrade,
          grades_count: studentGrades.length,
          misconceptions,
          weak_topics: weakTopics,
        });
      }

      // Sort by most misconceptions first
      studentPreviews.sort((a, b) => b.misconceptions.length - a.misconceptions.length);

      return {
        students: studentPreviews,
        totals: {
          students: studentPreviews.length,
          grades: totalGrades,
          misconceptions: totalMisconceptions,
          weak_topics: totalWeakTopics,
        },
      };
    },
    enabled: !!user && open,
  });

  const handleConfirmSync = async () => {
    setIsSyncing(true);
    try {
      await onConfirmSync();
      onOpenChange(false);
    } finally {
      setIsSyncing(false);
    }
  };

  const getSeverityBadge = (severity: string | null) => {
    switch (severity) {
      case 'high':
        return <Badge variant="destructive" className="text-xs">High</Badge>;
      case 'medium':
        return <Badge variant="secondary" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/20">Medium</Badge>;
      case 'low':
        return <Badge variant="outline" className="text-xs">Low</Badge>;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Scholar Sync Preview
          </DialogTitle>
          <DialogDescription>
            Review the data that will be synced to NYCLogic Scholar AI
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !previewData?.students.length ? (
          <div className="text-center py-8">
            <User className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground">No students found to sync</p>
          </div>
        ) : (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-3 py-4">
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-2xl font-bold text-primary">{previewData.totals.students}</p>
                <p className="text-xs text-muted-foreground">Students</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-2xl font-bold text-blue-600">{previewData.totals.grades}</p>
                <p className="text-xs text-muted-foreground">Grades</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-2xl font-bold text-amber-600">{previewData.totals.misconceptions}</p>
                <p className="text-xs text-muted-foreground">Misconceptions</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-2xl font-bold text-red-600">{previewData.totals.weak_topics}</p>
                <p className="text-xs text-muted-foreground">Weak Topics</p>
              </div>
            </div>

            {/* Student List */}
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
                {previewData.students.map((student) => (
                  <Collapsible
                    key={student.student_id}
                    open={expandedStudentId === student.student_id}
                    onOpenChange={() => 
                      setExpandedStudentId(
                        expandedStudentId === student.student_id ? null : student.student_id
                      )
                    }
                  >
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-full bg-primary/10">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{getDisplayName(student.student_id, student.first_name, student.last_name)}</p>
                            <p className="text-xs text-muted-foreground">
                              {student.class_name} • Avg: {student.overall_average}%
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {student.misconceptions.length > 0 && (
                            <Badge variant="secondary" className="bg-amber-500/10 text-amber-600">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              {student.misconceptions.length}
                            </Badge>
                          )}
                          {student.weak_topics.length > 0 && (
                            <Badge variant="secondary" className="bg-red-500/10 text-red-600">
                              <TrendingDown className="h-3 w-3 mr-1" />
                              {student.weak_topics.length}
                            </Badge>
                          )}
                          <ChevronDown 
                            className={`h-4 w-4 transition-transform ${
                              expandedStudentId === student.student_id ? 'rotate-180' : ''
                            }`} 
                          />
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-2 p-4 rounded-lg bg-muted/30 space-y-4">
                        {/* Misconceptions with Standards & Problem Sets */}
                        {student.misconceptions.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4 text-amber-500" />
                              Misconceptions to Sync
                            </h4>
                            <div className="space-y-2">
                              {student.misconceptions.map((m, idx) => (
                                <div 
                                  key={idx} 
                                  className="p-3 rounded-lg bg-background border text-sm space-y-2"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="font-medium flex-1">{m.name}</p>
                                    {getSeverityBadge(m.severity)}
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {m.topic_name && (
                                      <Badge variant="outline" className="text-xs">
                                        <BookOpen className="h-3 w-3 mr-1" />
                                        {m.topic_name}
                                      </Badge>
                                    )}
                                    {m.standard && (
                                      <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/20">
                                        <Tag className="h-3 w-3 mr-1" />
                                        {m.standard}
                                      </Badge>
                                    )}
                                    {m.problem_set && (
                                      <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600 border-purple-500/20">
                                        <FileText className="h-3 w-3 mr-1" />
                                        {m.problem_set}
                                      </Badge>
                                    )}
                                  </div>
                                  {m.suggested_remedies && m.suggested_remedies.length > 0 && (
                                    <div className="text-xs text-muted-foreground">
                                      <span className="font-medium">Remedies: </span>
                                      {m.suggested_remedies.slice(0, 2).join(', ')}
                                      {m.suggested_remedies.length > 2 && '...'}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Weak Topics */}
                        {student.weak_topics.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                              <TrendingDown className="h-4 w-4 text-red-500" />
                              Weak Topics
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {student.weak_topics.map((wt, idx) => (
                                <Badge 
                                  key={idx} 
                                  variant="secondary"
                                  className="bg-red-500/10 text-red-600 border-red-500/20"
                                >
                                  {wt.topic_name}: {wt.avg_score}%
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {student.misconceptions.length === 0 && student.weak_topics.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-2">
                            No misconceptions or weak topics identified
                          </p>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleConfirmSync} 
            disabled={isSyncing || !previewData?.students.length}
            className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
          >
            {isSyncing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Confirm Sync
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
