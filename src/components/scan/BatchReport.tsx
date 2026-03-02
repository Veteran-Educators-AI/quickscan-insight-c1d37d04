import React, { useState, useCallback, Suspense } from 'react';
import { Download, Users, TrendingUp, AlertTriangle, BarChart3, Eye, GitCompare, LayoutGrid, Send, Loader2, Save, CheckCircle, BookOpen, Link, Unlink, FileStack, Upload, FileText, Cloud, ChevronDown, Printer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { BatchItem, BatchSummary } from '@/hooks/useBatchAnalysis';
import { StudentWorkDetailDialog } from './lazy';
import { StudentComparisonView } from './StudentComparisonView';
import { GradedPapersGallery } from './lazy';
import { DifferentiationGroupView } from './DifferentiationGroupView';
import { MissingSubmissionsAlert } from './MissingSubmissionsAlert';
import { PrintStudentErrorReport } from '@/components/print/PrintStudentErrorReport';
import { PushToClassroomDialog } from './PushToClassroomDialog';
import { SaveToDriveDialog } from './SaveToDriveDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { usePushToSisterApp } from '@/hooks/usePushToSisterApp';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useStudentNames } from '@/lib/StudentNameContext';
import { toast } from 'sonner';
import {
  exportGradingReportPDF,
  exportGradingReportWord,
  prepareGradingReportForDrive,
} from '@/lib/gradingReportExport';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ClassroomContext {
  courseId: string;
  courseWorkId: string;
  submissionId: string;
  maxPoints: number;
}

interface StudentInfo {
  id: string;
  first_name: string;
  last_name: string;
  student_id: string | null;
}

interface BatchReportProps {
  items: BatchItem[];
  summary: BatchSummary;
  classId?: string;
  questionId?: string;
  className?: string;
  assignmentName?: string;
  students?: StudentInfo[];
  onExport: () => void;
  onUpdateNotes?: (itemId: string, notes: string) => void;
  onSaveComplete?: () => void;
  onUnlinkContinuation?: (continuationId: string) => void;
  onReanalyzeItem?: (itemId: string) => Promise<BatchItem | null>;
  classroomContextMap?: Record<string, ClassroomContext>; // studentId -> classroom context
  assignmentTitle?: string;
}

export function BatchReport({ items, summary, classId, questionId, className, assignmentName, students, onExport, onUpdateNotes, onSaveComplete, onUnlinkContinuation, onReanalyzeItem, classroomContextMap, assignmentTitle }: BatchReportProps) {
  const { user } = useAuth();
  const { getDisplayName } = useStudentNames();
  const [selectedStudent, setSelectedStudent] = useState<BatchItem | null>(null);
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set());
  const [showComparison, setShowComparison] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [showClassroomPush, setShowClassroomPush] = useState(false);
  const [showSaveToDrive, setShowSaveToDrive] = useState(false);
  const [showErrorReport, setShowErrorReport] = useState(false);
  const [isPushingAll, setIsPushingAll] = useState(false);
  const [isPushingBasicSkills, setIsPushingBasicSkills] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);

  // Helper to get student display name (pseudonym if available) from a batch item
  const getItemStudentDisplayName = useCallback((item: BatchItem): string => {
    if (item.studentId && students && students.length > 0) {
      const student = students.find(s => s.id === item.studentId);
      if (student) {
        return getDisplayName(student.id, student.first_name, student.last_name);
      }
    }
    return item.studentName || 'Unknown';
  }, [students, getDisplayName]);
  const [isExporting, setIsExporting] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [driveFiles, setDriveFiles] = useState<{ blob: Blob; name: string }[]>([]);
  const [savedStudents, setSavedStudents] = useState<Set<string>>(new Set());
  const [pushedStudents, setPushedStudents] = useState<Set<string>>(new Set());
  const [classroomPushed, setClassroomPushed] = useState<Set<string>>(new Set());
  const [basicSkillsPushed, setBasicSkillsPushed] = useState<Set<string>>(new Set());
  const { pushToSisterApp } = usePushToSisterApp();
  const completedItems = items.filter(item => item.status === 'completed' && item.result);
  
  // Get the effective grade for a result - prefer grade field, fallback to totalScore percentage
  // (Defined early so it can be used by lowScoringStudents filter)
  const getEffectiveGrade = (result: BatchItem['result']) => {
    if (!result) return 0;
    // Trust the backend-computed grade directly — no inflation
    if (result.grade !== undefined && result.grade !== null) {
      return result.grade;
    }
    if (result.totalScore.possible > 0) {
      return result.totalScore.percentage;
    }
    return 0;
  };

  // Students scoring below 60%
  const lowScoringStudents = completedItems.filter(item => {
    if (!item.studentId || !item.result) return false;
    const grade = getEffectiveGrade(item.result);
    return grade < 60;
  });
  
  const allBasicSkillsPushed = lowScoringStudents.length > 0 && 
    lowScoringStudents.every(i => basicSkillsPushed.has(i.studentId!));

  const handlePushAllToScholar = async () => {
    if (!classId) {
      toast.error('Class ID required to push to NYClogic Scholar AI');
      return;
    }

    setIsPushingAll(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const item of completedItems) {
        if (!item.studentId || pushedStudents.has(item.studentId)) continue;
        
        const effectiveGrade = getEffectiveGrade(item.result);
        const misconceptions = item.result?.misconceptions || [];
        const topicName = item.result?.problemIdentified || 'General Practice';
        const nysStandard = item.result?.nysStandard || 'N/A';
        
        // Determine difficulty based on grade
        const difficulty = effectiveGrade < 60 ? 'scaffolded' : effectiveGrade < 80 ? 'practice' : 'challenge';
        const xpReward = difficulty === 'challenge' ? 50 : difficulty === 'practice' ? 30 : 20;
        const coinReward = difficulty === 'challenge' ? 25 : difficulty === 'practice' ? 15 : 10;

        const result = await pushToSisterApp({
          class_id: classId,
          title: `Remediation: ${topicName}`,
          description: `Based on scan analysis. Misconceptions: ${misconceptions.slice(0, 2).join(', ') || 'General review needed'}`,
          student_id: item.studentId,
          student_name: item.studentName,
          topic_name: topicName,
          standard_code: nysStandard,
          xp_reward: xpReward,
          coin_reward: coinReward,
          grade: effectiveGrade,
        });

        if (result.success) {
          successCount++;
          setPushedStudents(prev => new Set([...prev, item.studentId!]));
        } else {
          failCount++;
        }
      }

      if (successCount > 0 && failCount === 0) {
        toast.success(`Pushed ${successCount} student remediation(s) to NYClogic Scholar AI!`);
      } else if (successCount > 0) {
        toast.warning(`${successCount} pushed, ${failCount} failed`);
      } else {
        toast.error('Failed to push to NYClogic Scholar AI');
      }
    } catch (err) {
      console.error('Push to Scholar error:', err);
      toast.error('Failed to push to NYClogic Scholar AI');
    } finally {
      setIsPushingAll(false);
    }
  };

  // Push basic skills remediation for students scoring below 60%
  const handlePushBasicSkillsRemediation = async () => {
    if (!classId) {
      toast.error('Class ID required to push to NYClogic Scholar AI');
      return;
    }

    if (lowScoringStudents.length === 0) {
      toast.info('No students scoring below 60% to send basic skills remediation');
      return;
    }

    setIsPushingBasicSkills(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const item of lowScoringStudents) {
        if (!item.studentId || basicSkillsPushed.has(item.studentId)) continue;
        
        const effectiveGrade = getEffectiveGrade(item.result);
        const topicName = item.result?.problemIdentified || 'Basic Skills';
        
        const result = await pushToSisterApp({
          class_id: classId,
          title: `Basic Skills Remediation: ${topicName}`,
          description: `Foundational skills practice to build confidence. Focus on prerequisite concepts and step-by-step problem solving.`,
          student_id: item.studentId,
          student_name: item.studentName,
          topic_name: 'Basic Skills - ' + topicName,
          standard_code: item.result?.nysStandard || 'Foundation',
          xp_reward: 25, // Higher XP for encouragement
          coin_reward: 15,
          grade: effectiveGrade,
        });

        if (result.success) {
          successCount++;
          setBasicSkillsPushed(prev => new Set([...prev, item.studentId!]));
        } else {
          failCount++;
        }
      }

      if (successCount > 0 && failCount === 0) {
        toast.success(`Sent basic skills remediation to ${successCount} student(s)!`, {
          description: 'Students will receive scaffolded practice in NYClogic Scholar AI',
        });
      } else if (successCount > 0) {
        toast.warning(`${successCount} sent, ${failCount} failed`);
      } else {
        toast.error('Failed to send basic skills remediation');
      }
    } catch (err) {
      console.error('Basic skills push error:', err);
      toast.error('Failed to send basic skills remediation');
    } finally {
      setIsPushingBasicSkills(false);
    }
  };

  // Save all results to gradebook (grade_history table)
  const handleSaveAllToGradebook = async () => {
    if (!user) {
      toast.error('You must be logged in to save results');
      return;
    }

    setIsSavingAll(true);
    let successCount = 0;
    let failCount = 0;
    const failedStudentNames: string[] = [];
    const notLinkedStudents: string[] = [];

    try {
      for (const item of completedItems) {
        // Skip if no student ID assigned
        if (!item.studentId) {
          notLinkedStudents.push(item.studentName || 'Unknown');
          continue;
        }
        
        // Skip if already saved
        if (savedStudents.has(item.studentId)) continue;
        
        const effectiveGrade = getEffectiveGrade(item.result);
        const topicName = item.result?.problemIdentified || 'General Assessment';
        const nysStandard = item.result?.nysStandard || null;
        const regentsScore = item.result?.regentsScore ?? null;

        // Save to grade_history
        const { error: gradeError } = await supabase
          .from('grade_history')
          .insert({
            student_id: item.studentId,
            topic_name: topicName,
            grade: effectiveGrade,
            grade_justification: item.result?.gradeJustification || item.result?.feedback || null,
            raw_score_earned: item.result?.totalScore.earned || 0,
            raw_score_possible: item.result?.totalScore.possible || 0,
            teacher_id: user.id,
            regents_score: regentsScore,
            nys_standard: nysStandard,
            regents_justification: item.result?.regentsScoreJustification || null,
          });

        if (gradeError) {
          console.error('Error saving grade for', item.studentName, ':', gradeError);
          failCount++;
          // Check if it's a foreign key error (student doesn't exist in database)
          if (gradeError.code === '23503' || gradeError.message?.includes('foreign key')) {
            failedStudentNames.push(`${item.studentName || 'Unknown'} (not in roster)`);
          } else {
            failedStudentNames.push(item.studentName || 'Unknown');
          }
          continue;
        }

        // Also create an attempt record if we have a questionId
        if (questionId) {
          const { data: attempt, error: attemptError } = await supabase
            .from('attempts')
            .insert({
              student_id: item.studentId,
              question_id: questionId,
              status: 'analyzed',
            })
            .select('id')
            .single();

          if (!attemptError && attempt) {
            // Save attempt image
            await supabase
              .from('attempt_images')
              .insert({
                attempt_id: attempt.id,
                image_url: item.imageDataUrl,
                ocr_text: item.result?.ocrText || '',
              });

            // Save score
            await supabase
              .from('scores')
              .insert({
                attempt_id: attempt.id,
                points_earned: item.result?.totalScore.earned || 0,
                notes: item.result?.feedback || '',
                is_auto_scored: true,
                teacher_override: false,
              });
          }
        }

        successCount++;
        setSavedStudents(prev => new Set([...prev, item.studentId!]));
      }

      // Show detailed feedback
      if (successCount > 0 && failCount === 0 && notLinkedStudents.length === 0) {
        toast.success(`Saved ${successCount} student grade(s) to gradebook!`);
        onSaveComplete?.();
      } else if (successCount > 0) {
        toast.success(`Saved ${successCount} grade(s) to gradebook`, {
          description: failCount > 0 
            ? `${failCount} failed: ${failedStudentNames.slice(0, 3).join(', ')}${failedStudentNames.length > 3 ? '...' : ''}`
            : undefined,
        });
        if (notLinkedStudents.length > 0) {
          toast.warning(`${notLinkedStudents.length} paper(s) not linked to students`, {
            description: `Link students first: ${notLinkedStudents.slice(0, 3).join(', ')}${notLinkedStudents.length > 3 ? '...' : ''}`,
          });
        }
        onSaveComplete?.();
      } else if (failCount > 0) {
        toast.error(`Failed to save ${failCount} grade(s)`, {
          description: failedStudentNames.slice(0, 3).join(', ') + (failedStudentNames.length > 3 ? '...' : ''),
        });
      } else if (notLinkedStudents.length > 0) {
        toast.warning('No grades saved - papers not linked to students', {
          description: 'Use the student dropdown to link each paper to a student from your roster',
        });
      } else {
        toast.info('No new grades to save');
      }
    } catch (err) {
      console.error('Save to gradebook error:', err);
      toast.error('Failed to save to gradebook');
    } finally {
      setIsSavingAll(false);
    }
  };

  const allSaved = completedItems.length > 0 && 
    completedItems.filter(i => i.studentId).every(i => savedStudents.has(i.studentId!));

  const allPushed = completedItems.length > 0 && 
    completedItems.filter(i => i.studentId).every(i => pushedStudents.has(i.studentId!));

  const toggleCompareSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedForCompare(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 2) {
        next.add(id);
      } else {
        // Replace the first selected with new selection
        const arr = Array.from(next);
        next.delete(arr[0]);
        next.add(id);
      }
      return next;
    });
  };

  const canCompare = selectedForCompare.size === 2;

  const comparisonStudents = completedItems
    .filter(item => item.result)
    .map(item => ({
      id: item.id,
      studentName: getItemStudentDisplayName(item),
      imageUrl: item.imageDataUrl,
      result: item.result!,
    }));

  const getScoreColor = (pct: number) => {
    if (pct >= 80) return 'text-green-600';
    if (pct >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getGradeColor = (grade: number) => {
    if (grade >= 90) return 'text-green-600';
    if (grade >= 80) return 'text-blue-600';
    if (grade >= 70) return 'text-yellow-600';
    if (grade >= 60) return 'text-orange-600';
    return 'text-red-600';
  };

  const getLetterGrade = (grade: number) => {
    if (grade >= 90) return 'A';
    if (grade >= 80) return 'B';
    if (grade >= 70) return 'C';
    if (grade >= 60) return 'D';
    return 'F';
  };


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Class Grading Report</h2>
          <p className="text-sm text-muted-foreground">
            {summary.totalStudents} papers analyzed • Click any row to view details
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Save All to Gradebook - Primary Action */}
          <Button 
            onClick={handleSaveAllToGradebook} 
            variant={allSaved ? 'outline' : 'default'}
            disabled={isSavingAll || allSaved || completedItems.filter(i => i.studentId).length === 0}
          >
            {allSaved ? (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                All Saved
              </>
            ) : isSavingAll ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save All to Gradebook
              </>
            )}
          </Button>
          
          {/* Push to NYClogic Scholar AI */}
          {classId && (
            <Button 
              onClick={handlePushAllToScholar} 
              variant={allPushed ? 'outline' : 'hero'}
              disabled={isPushingAll || allPushed || completedItems.filter(i => i.studentId).length === 0}
            >
              {allPushed ? (
                <>✓ All Sent to Scholar</>
              ) : isPushingAll ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Pushing...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Push All to NYClogic Scholar AI
                </>
              )}
            </Button>
          )}
          
          {/* Basic Skills Remediation for Low Scorers */}
          {classId && lowScoringStudents.length > 0 && (
            <Button 
              onClick={handlePushBasicSkillsRemediation} 
              variant={allBasicSkillsPushed ? 'outline' : 'secondary'}
              disabled={isPushingBasicSkills || allBasicSkillsPushed}
              className="border-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/20"
            >
              {allBasicSkillsPushed ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2 text-orange-600" />
                  Basic Skills Sent
                </>
              ) : isPushingBasicSkills ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <BookOpen className="h-4 w-4 mr-2 text-orange-600" />
                  Basic Skills ({lowScoringStudents.length})
                </>
              )}
            </Button>
          )}
          
          {/* Push to Google Classroom */}
          {classroomContextMap && Object.keys(classroomContextMap).length > 0 && (
            <Button 
              onClick={() => setShowClassroomPush(true)} 
              variant="outline"
              className="border-green-300 hover:bg-green-50 dark:hover:bg-green-950/20"
            >
              <Upload className="h-4 w-4 mr-2 text-green-600" />
              Push to Classroom
            </Button>
          )}
          
          <Button onClick={() => setShowGallery(true)} variant="outline">
            <LayoutGrid className="h-4 w-4 mr-2" />
            View All Papers
          </Button>
          <Button onClick={() => setShowErrorReport(true)} variant="outline">
            <Printer className="h-4 w-4 mr-2" />
            Print Error Reports
          </Button>
          {canCompare && (
            <Button onClick={() => setShowComparison(true)} variant="secondary">
              <GitCompare className="h-4 w-4 mr-2" />
              Compare Selected ({selectedForCompare.size})
            </Button>
          )}
          {selectedForCompare.size > 0 && !canCompare && (
            <Badge variant="outline" className="text-xs">
              Select {2 - selectedForCompare.size} more to compare
            </Badge>
          )}
          <Button onClick={onExport} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.totalStudents}</p>
                <p className="text-xs text-muted-foreground">Total Students</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className={`text-2xl font-bold ${getScoreColor(summary.averageScore)}`}>
                  {summary.averageScore}%
                </p>
                <p className="text-xs text-muted-foreground">Class Average</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{summary.passRate}%</p>
                <p className="text-xs text-muted-foreground">Pass Rate (≥60%)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Score Range</p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-lg font-semibold text-red-600">{summary.lowestScore}%</span>
                <span className="text-muted-foreground">—</span>
                <span className="text-lg font-semibold text-green-600">{summary.highestScore}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Missing Submissions Alert - Roster Comparison */}
      {classId && (
        <MissingSubmissionsAlert
          classId={classId}
          analyzedStudentIds={completedItems.map(item => item.studentId).filter(Boolean) as string[]}
          analyzedStudentNames={completedItems.map(item => item.studentName).filter(Boolean) as string[]}
          assignmentName={completedItems[0]?.result?.problemIdentified || 'this assignment'}
        />
      )}

      {/* Score Distribution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Score Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {summary.scoreDistribution.map((dist) => (
              <div key={dist.range} className="flex items-center gap-3">
                <span className="w-20 text-sm font-medium">{dist.range}</span>
                <div className="flex-1">
                  <Progress 
                    value={(dist.count / summary.totalStudents) * 100} 
                    className="h-6"
                  />
                </div>
                <span className="w-12 text-sm text-right">
                  {dist.count} ({Math.round((dist.count / summary.totalStudents) * 100)}%)
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Common Misconceptions - Clean Column Layout */}
      {summary.commonMisconceptions.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Common Misconceptions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border/50">
              {summary.commonMisconceptions.map((item, i) => (
                <div key={i} className="flex items-start justify-between py-2.5 gap-4">
                  <span className="text-sm text-foreground/90 leading-relaxed flex-1">{item.misconception}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{item.count} student(s)</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Differentiation Groups */}
      <DifferentiationGroupView 
        items={items}
        classId={classId}
        getEffectiveGrade={getEffectiveGrade}
      />

      {/* Individual Results Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              Individual Results
              <Badge variant="outline" className="ml-2 text-xs">
                <Eye className="h-3 w-3 mr-1" />
                Click to view details
              </Badge>
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              <GitCompare className="h-3 w-3 mr-1" />
              Check 2 students to compare
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <span className="sr-only">Compare</span>
                </TableHead>
                <TableHead>Student</TableHead>
                <TableHead className="text-center w-[60px]">Pages</TableHead>
                <TableHead className="text-center">Score</TableHead>
                <TableHead className="text-center">Grade</TableHead>
                <TableHead className="hidden md:table-cell">Feedback</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {completedItems.map((item) => (
                <TableRow 
                  key={item.id}
                  className={`cursor-pointer hover:bg-accent/50 transition-colors ${
                    selectedForCompare.has(item.id) ? 'bg-primary/10' : ''
                  }`}
                  onClick={() => setSelectedStudent(item)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedForCompare.has(item.id)}
                      onCheckedChange={() => {
                        setSelectedForCompare(prev => {
                          const next = new Set(prev);
                          if (next.has(item.id)) {
                            next.delete(item.id);
                          } else if (next.size < 2) {
                            next.add(item.id);
                          } else {
                            const arr = Array.from(next);
                            next.delete(arr[0]);
                            next.add(item.id);
                          }
                          return next;
                        });
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        {getItemStudentDisplayName(item)}
                        {item.pageType === 'continuation' && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-600">
                                  <Link className="h-3 w-3 mr-1" />
                                  Linked
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">This page was linked as a continuation</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      {/* Show worksheet topic if available */}
                      {item.worksheetTopic && (
                        <span className="text-xs text-muted-foreground capitalize truncate max-w-[200px]">
                          {item.worksheetTopic}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {(() => {
                      const continuationCount = item.continuationPages?.length || 0;
                      const isContinuation = item.pageType === 'continuation';
                      
                      if (continuationCount > 0) {
                        return (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center justify-center gap-1">
                                  <FileStack className="h-4 w-4 text-blue-600" />
                                  <span className="text-xs font-medium text-blue-600">{continuationCount + 1}</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">{continuationCount + 1} pages combined</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      }
                      if (isContinuation) {
                        return (
                          <Badge variant="outline" className="text-xs">+1</Badge>
                        );
                      }
                      return <span className="text-xs text-muted-foreground">1</span>;
                    })()}
                  </TableCell>
                  <TableCell className="text-center">
                    {(() => {
                      const effectiveGrade = getEffectiveGrade(item.result);
                      return (
                        <span className={`font-semibold ${getGradeColor(effectiveGrade)}`}>
                          {effectiveGrade}%
                        </span>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-center">
                    {(() => {
                      const effectiveGrade = getEffectiveGrade(item.result);
                      return (
                        <Badge variant={effectiveGrade >= 60 ? 'default' : 'destructive'}>
                          {getLetterGrade(effectiveGrade)}
                        </Badge>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-xs truncate">
                    {item.result!.feedback || 'No feedback'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {/* Unlink button for continuation pages */}
                      {item.pageType === 'continuation' && onUnlinkContinuation && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUnlinkContinuation(item.id);
                                  toast.success('Page unlinked', { description: 'This page is now a separate paper' });
                                }}
                              >
                                <Unlink className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">Unlink this page (was linked by accident)</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedStudent(item);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Student Work Detail Dialog */}
      {selectedStudent && selectedStudent.result && (
        <Suspense fallback={null}>
          <StudentWorkDetailDialog
            open={!!selectedStudent}
            onOpenChange={(open) => !open && setSelectedStudent(null)}
            studentName={getItemStudentDisplayName(selectedStudent)}
            imageUrl={selectedStudent.imageDataUrl}
            result={selectedStudent.result}
            isReanalyzing={isReanalyzing}
            onReanalyze={onReanalyzeItem ? async () => {
              setIsReanalyzing(true);
              try {
                const result = await onReanalyzeItem(selectedStudent.id);
                if (result?.result) {
                  // Update the selected student with new result
                  setSelectedStudent(result);
                }
              } finally {
                setIsReanalyzing(false);
              }
            } : undefined}
          />
        </Suspense>
      )}

      {/* Graded Papers Gallery */}
      <Suspense fallback={null}>
        <GradedPapersGallery
          open={showGallery}
          onOpenChange={setShowGallery}
          items={items}
          onUpdateNotes={onUpdateNotes}
        />
      </Suspense>

      {/* Student Comparison View */}
      {showComparison && comparisonStudents.length >= 2 && (
        <StudentComparisonView
          open={showComparison}
          onOpenChange={setShowComparison}
          students={comparisonStudents}
          initialStudentIds={Array.from(selectedForCompare) as [string, string]}
        />
      )}

      {/* Push to Google Classroom Dialog */}
      {classroomContextMap && (
        <PushToClassroomDialog
          open={showClassroomPush}
          onOpenChange={setShowClassroomPush}
          assignmentTitle={assignmentTitle}
          gradesToSync={completedItems
            .filter(item => item.studentId && classroomContextMap[item.studentId] && !classroomPushed.has(item.studentId!))
            .map(item => {
              const context = classroomContextMap[item.studentId!];
              const effectiveGrade = getEffectiveGrade(item.result);
              const maxPoints = context.maxPoints || 100;
              const scaledGrade = Math.round((effectiveGrade / 100) * maxPoints);
              
              return {
                studentName: item.studentName || 'Unknown',
                studentEmail: undefined,
                courseId: context.courseId,
                courseWorkId: context.courseWorkId,
                submissionId: context.submissionId,
                grade: scaledGrade,
                maxPoints,
                percentage: effectiveGrade,
              };
            })}
          onSyncComplete={(successCount) => {
            if (successCount > 0) {
              // Mark synced students
              completedItems.forEach(item => {
                if (item.studentId && classroomContextMap[item.studentId]) {
                  setClassroomPushed(prev => new Set([...prev, item.studentId!]));
                }
              });
            }
          }}
        />
      )}

      {/* Print Student Error Reports */}
      <PrintStudentErrorReport
        open={showErrorReport}
        onOpenChange={setShowErrorReport}
        items={items}
        assignmentName={assignmentName || assignmentTitle || className}
      />
    </div>
  );
}
