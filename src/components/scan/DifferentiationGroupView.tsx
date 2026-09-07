import { useState, useMemo } from 'react';
import { Users, TrendingUp, TrendingDown, Target, Send, BookOpen, Loader2, CheckCircle, ChevronDown, ChevronUp, Zap, Award, AlertTriangle, Edit2, RefreshCw, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BatchItem } from '@/hooks/useBatchAnalysis';
import { usePushToSisterApp } from '@/hooks/usePushToSisterApp';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ReassessmentCriteria {
  id: string;
  label: string;
  description: string;
  gradeAdjustment: number;
}

const REASSESSMENT_CRITERIA: ReassessmentCriteria[] = [
  {
    id: 'showed_work',
    label: 'Showed Work',
    description: 'Student showed their problem-solving process',
    gradeAdjustment: 5,
  },
  {
    id: 'partial_understanding',
    label: 'Partial Understanding',
    description: 'Demonstrated partial understanding of concepts',
    gradeAdjustment: 8,
  },
  {
    id: 'computational_error',
    label: 'Computational Error Only',
    description: 'Correct approach but arithmetic/calculation error',
    gradeAdjustment: 10,
  },
  {
    id: 'misread_problem',
    label: 'Misread Problem',
    description: 'Would have been correct if problem was read correctly',
    gradeAdjustment: 12,
  },
  {
    id: 'effort_evident',
    label: 'Effort Evident',
    description: 'Clear effort was made despite incorrect answer',
    gradeAdjustment: 5,
  },
  {
    id: 'close_answer',
    label: 'Close Answer',
    description: 'Answer was very close to correct',
    gradeAdjustment: 7,
  },
];

interface StudentGroup {
  level: 'struggling' | 'developing' | 'proficient';
  label: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
  students: BatchItem[];
  remediationType: string;
  xpReward: number;
  coinReward: number;
}

interface DifferentiationGroupViewProps {
  items: BatchItem[];
  classId?: string;
  getEffectiveGrade: (result: BatchItem['result']) => number;
  onBulkGradeOverride?: (studentIds: string[], newGrade: number, justification: string) => void;
}

export function DifferentiationGroupView({ items, classId, getEffectiveGrade, onBulkGradeOverride }: DifferentiationGroupViewProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['struggling', 'developing']));
  const [pushingGroups, setPushingGroups] = useState<Set<string>>(new Set());
  const [pushedGroups, setPushedGroups] = useState<Set<string>>(new Set());
  const [selectedStudents, setSelectedStudents] = useState<Map<string, Set<string>>>(new Map());
  const [bulkAdjustDialogOpen, setBulkAdjustDialogOpen] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [activeGroupForAdjust, setActiveGroupForAdjust] = useState<StudentGroup | null>(null);
  const [selectedCriteria, setSelectedCriteria] = useState<string[]>([]);
  const [manualAdjustment, setManualAdjustment] = useState(0);
  const [justification, setJustification] = useState('');
  const { pushToSisterApp } = usePushToSisterApp();

  const completedItems = items.filter(item => item.status === 'completed' && item.result);

  // Group students by performance level
  const strugglingStudents = completedItems.filter(item => {
    const grade = getEffectiveGrade(item.result);
    return grade < 60;
  });

  const developingStudents = completedItems.filter(item => {
    const grade = getEffectiveGrade(item.result);
    return grade >= 60 && grade < 80;
  });

  const proficientStudents = completedItems.filter(item => {
    const grade = getEffectiveGrade(item.result);
    return grade >= 80;
  });

  const groups: StudentGroup[] = [
    {
      level: 'struggling',
      label: 'Needs Support',
      description: 'Students scoring below 60% - require foundational skill building',
      color: 'text-red-600',
      bgColor: 'bg-red-50 dark:bg-red-950/30',
      borderColor: 'border-red-200 dark:border-red-800',
      icon: <AlertTriangle className="h-5 w-5 text-red-600" />,
      students: strugglingStudents,
      remediationType: 'Basic Skills - Scaffolded Practice',
      xpReward: 25,
      coinReward: 15,
    },
    {
      level: 'developing',
      label: 'Approaching Mastery',
      description: 'Students scoring 60-79% - need targeted practice on specific concepts',
      color: 'text-amber-600',
      bgColor: 'bg-amber-50 dark:bg-amber-950/30',
      borderColor: 'border-amber-200 dark:border-amber-800',
      icon: <Target className="h-5 w-5 text-amber-600" />,
      students: developingStudents,
      remediationType: 'Concept Reinforcement',
      xpReward: 35,
      coinReward: 20,
    },
    {
      level: 'proficient',
      label: 'Proficient',
      description: 'Students scoring 80%+ - ready for challenge problems and extensions',
      color: 'text-green-600',
      bgColor: 'bg-green-50 dark:bg-green-950/30',
      borderColor: 'border-green-200 dark:border-green-800',
      icon: <Award className="h-5 w-5 text-green-600" />,
      students: proficientStudents,
      remediationType: 'Challenge Extensions',
      xpReward: 50,
      coinReward: 30,
    },
  ];

  const toggleGroup = (level: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  };

  const toggleStudentSelection = (groupLevel: string, studentId: string) => {
    setSelectedStudents(prev => {
      const next = new Map(prev);
      const groupSet = next.get(groupLevel) || new Set();
      if (groupSet.has(studentId)) {
        groupSet.delete(studentId);
      } else {
        groupSet.add(studentId);
      }
      next.set(groupLevel, groupSet);
      return next;
    });
  };

  const toggleSelectAllInGroup = (group: StudentGroup) => {
    setSelectedStudents(prev => {
      const next = new Map(prev);
      const currentSet = next.get(group.level) || new Set();
      const studentIds = group.students.map(s => s.id);
      
      if (currentSet.size === studentIds.length) {
        // Deselect all
        next.set(group.level, new Set());
      } else {
        // Select all
        next.set(group.level, new Set(studentIds));
      }
      return next;
    });
  };

  const getSelectedCount = (groupLevel: string) => {
    return selectedStudents.get(groupLevel)?.size || 0;
  };

  const isStudentSelected = (groupLevel: string, studentId: string) => {
    return selectedStudents.get(groupLevel)?.has(studentId) || false;
  };

  const isAllSelectedInGroup = (group: StudentGroup) => {
    const selected = selectedStudents.get(group.level);
    return selected && selected.size === group.students.length && group.students.length > 0;
  };

  const openBulkAdjustDialog = (group: StudentGroup) => {
    setActiveGroupForAdjust(group);
    setSelectedCriteria([]);
    setManualAdjustment(0);
    setJustification('');
    setBulkAdjustDialogOpen(true);
  };

  const handleCriteriaToggle = (criteriaId: string) => {
    setSelectedCriteria(prev => {
      const newCriteria = prev.includes(criteriaId)
        ? prev.filter(id => id !== criteriaId)
        : [...prev, criteriaId];
      
      // Auto-generate justification based on selected criteria
      const selectedLabels = newCriteria.map(id => 
        REASSESSMENT_CRITERIA.find(c => c.id === id)?.label
      ).filter(Boolean);
      
      if (selectedLabels.length > 0) {
        setJustification(`Bulk grade adjusted based on: ${selectedLabels.join(', ')}`);
      } else {
        setJustification('');
      }
      
      return newCriteria;
    });
  };

  const calculateTotalAdjustment = () => {
    const criteriaAdjustment = selectedCriteria.reduce((sum, id) => {
      const criteria = REASSESSMENT_CRITERIA.find(c => c.id === id);
      return sum + (criteria?.gradeAdjustment || 0);
    }, 0);
    return criteriaAdjustment + manualAdjustment;
  };

  // Get preview data for confirmation step
  const getPreviewData = useMemo(() => {
    if (!activeGroupForAdjust) return [];
    const selectedInGroup = selectedStudents.get(activeGroupForAdjust.level);
    if (!selectedInGroup) return [];
    
    const totalAdjustment = calculateTotalAdjustment();
    
    return activeGroupForAdjust.students
      .filter(s => selectedInGroup.has(s.id))
      .map(item => {
        const currentGrade = getEffectiveGrade(item.result);
        const newGrade = Math.min(100, Math.max(0, currentGrade + totalAdjustment));
        return {
          id: item.id,
          studentId: item.studentId,
          studentName: item.studentName,
          currentGrade,
          newGrade,
          adjustment: totalAdjustment,
        };
      });
  }, [activeGroupForAdjust, selectedStudents, selectedCriteria, manualAdjustment, getEffectiveGrade]);

  const handleProceedToConfirmation = () => {
    if (!justification.trim()) {
      toast.error('Please provide a justification');
      return;
    }
    setShowConfirmation(true);
  };

  const handleBackToAdjustment = () => {
    setShowConfirmation(false);
  };

  const handleApplyBulkAdjustment = () => {
    if (!activeGroupForAdjust || !justification.trim()) return;

    const selectedInGroup = selectedStudents.get(activeGroupForAdjust.level);
    if (!selectedInGroup || selectedInGroup.size === 0) {
      toast.error('No students selected');
      return;
    }

    const totalAdjustment = calculateTotalAdjustment();
    const selectedStudentItems = activeGroupForAdjust.students.filter(s => selectedInGroup.has(s.id));

    if (onBulkGradeOverride) {
      // For each selected student, calculate new grade and apply
      selectedStudentItems.forEach(item => {
        if (!item.studentId) return;
        const currentGrade = getEffectiveGrade(item.result);
        const newGrade = Math.min(100, Math.max(0, currentGrade + totalAdjustment));
        onBulkGradeOverride([item.studentId], newGrade, justification);
      });

      toast.success(`Applied ${totalAdjustment >= 0 ? '+' : ''}${totalAdjustment}% adjustment to ${selectedInGroup.size} student(s)`);
    } else {
      toast.info(`Would apply ${totalAdjustment >= 0 ? '+' : ''}${totalAdjustment}% to ${selectedInGroup.size} students (handler not provided)`);
    }

    // Clear selections after applying
    setSelectedStudents(prev => {
      const next = new Map(prev);
      next.set(activeGroupForAdjust.level, new Set());
      return next;
    });
    setShowConfirmation(false);
    setBulkAdjustDialogOpen(false);
  };

  const handlePushGroup = async (group: StudentGroup) => {
    if (!classId) {
      toast.error('Class ID required to push to Nyclogic Scholar Ai');
      return;
    }

    if (group.students.length === 0) {
      toast.info(`No students in the ${group.label} group`);
      return;
    }

    setPushingGroups(prev => new Set([...prev, group.level]));
    let successCount = 0;
    let failCount = 0;

    try {
      for (const item of group.students) {
        if (!item.studentId) continue;

        const effectiveGrade = getEffectiveGrade(item.result);
        const topicName = item.result?.problemIdentified || 'General Practice';
        const misconceptions = item.result?.misconceptions || [];

        const difficulty = group.level === 'struggling' ? 'scaffolded' : 
                          group.level === 'developing' ? 'practice' : 'challenge';

        // Generate actual questions based on the student's level
        let generatedQuestions = [];
        try {
          if (group.level === 'proficient') {
            // Generate mastery challenge questions for proficient students
            const { data: questionsData, error: questionsError } = await supabase.functions.invoke('generate-worksheet-questions', {
              body: {
                topics: [{
                  topicName: topicName,
                  standard: item.result?.nysStandard || '',
                  subject: 'Mathematics',
                  category: 'Mastery Challenge',
                }],
                questionCount: 3,
                difficultyLevels: ['challenging', 'hard'],
                worksheetMode: 'practice',
                includeHints: true,
                customInstructions: `Create advanced mastery challenge problems for a student who scored ${effectiveGrade}% on ${topicName}. These should be extension problems that go beyond standard curriculum, requiring deeper understanding and application. Include real-world scenarios and multi-step problems.`,
              },
            });

            if (!questionsError && questionsData?.questions) {
              generatedQuestions = questionsData.questions;
            }
          } else {
            // Generate remediation questions for struggling/developing students
            const { data: questionsData, error: questionsError } = await supabase.functions.invoke('generate-remediation-questions', {
              body: {
                misconceptions: misconceptions.length > 0 ? misconceptions : [`Needs practice on ${topicName}`],
                topicName: topicName,
                questionsPerMisconception: group.level === 'struggling' ? 3 : 2,
                difficulty: difficulty,
                standard: item.result?.nysStandard,
              },
            });

            if (!questionsError && questionsData?.questions) {
              generatedQuestions = questionsData.questions;
            }
          }
        } catch (genError) {
          console.error('Error generating questions:', genError);
          // Continue with push even if question generation fails
        }

        // Build remediation recommendations from misconceptions
        const remediationRecommendations = misconceptions.map(m => `Address: ${m}`);
        if (topicName) {
          remediationRecommendations.push(`Practice ${topicName}`);
        }
        if (item.result?.nysStandard) {
          remediationRecommendations.push(`Review ${item.result.nysStandard} concepts`);
        }

        // Determine difficulty level based on student group
        const difficultyLevel = group.level === 'proficient' ? 'E' : group.level === 'developing' ? 'C' : 'A';

        const result = await pushToSisterApp({
          type: 'assignment_push',
          source: 'scan_genius',
          class_id: classId,
          title: `${group.remediationType}: ${topicName}`,
          description: group.level === 'proficient' 
            ? `Challenge problems to extend understanding. Ready for advanced applications.`
            : `${group.remediationType}. Focus areas: ${misconceptions.slice(0, 2).join(', ') || 'General review'}`,
          student_id: item.studentId,
          student_name: item.studentRealName || item.studentName,
          topic_name: `${group.remediationType} - ${topicName}`,
          standard_code: item.result?.nysStandard || 'N/A',
          xp_reward: group.xpReward,
          coin_reward: group.coinReward,
          grade: effectiveGrade,
          questions: generatedQuestions,
          remediation_recommendations: remediationRecommendations,
          difficulty_level: difficultyLevel,
        });

        if (result.success) {
          successCount++;
        } else {
          failCount++;
        }
      }

      if (successCount > 0 && failCount === 0) {
        toast.success(`Sent ${group.remediationType} with ${group.level === 'proficient' ? 'mastery challenges' : 'remediation questions'} to ${successCount} student(s)!`);
        setPushedGroups(prev => new Set([...prev, group.level]));
      } else if (successCount > 0) {
        toast.warning(`${successCount} sent, ${failCount} failed`);
      } else {
        toast.error(`Failed to send ${group.remediationType}`);
      }
    } catch (err) {
      console.error('Push group error:', err);
      toast.error('Failed to send to Nyclogic Scholar Ai');
    } finally {
      setPushingGroups(prev => {
        const next = new Set(prev);
        next.delete(group.level);
        return next;
      });
    }
  };

  // Get common misconceptions for a group
  const getGroupMisconceptions = (students: BatchItem[]) => {
    const misconceptionCounts: Record<string, number> = {};
    students.forEach(item => {
      item.result?.misconceptions?.forEach(m => {
        misconceptionCounts[m] = (misconceptionCounts[m] || 0) + 1;
      });
    });
    return Object.entries(misconceptionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([m, count]) => ({ misconception: m, count }));
  };

  if (completedItems.length === 0) {
    return null;
  }

  const totalAdjustment = calculateTotalAdjustment();

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Differentiation Groups
            <Badge variant="secondary" className="ml-2">
              {completedItems.length} students
            </Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Students grouped by performance level with targeted remediation options. Select students to apply bulk grade adjustments.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {groups.map((group) => {
            const isPushing = pushingGroups.has(group.level);
            const isPushed = pushedGroups.has(group.level);
            const isExpanded = expandedGroups.has(group.level);
            const misconceptions = getGroupMisconceptions(group.students);
            const selectedCount = getSelectedCount(group.level);
            const allSelected = isAllSelectedInGroup(group);

            return (
              <Collapsible
                key={group.level}
                open={isExpanded}
                onOpenChange={() => toggleGroup(group.level)}
              >
                <Card className={`${group.bgColor} ${group.borderColor} border`}>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-4 cursor-pointer hover:opacity-90 transition-opacity">
                      <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-full ${group.bgColor} flex items-center justify-center border ${group.borderColor}`}>
                          {group.icon}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className={`font-semibold ${group.color}`}>{group.label}</h3>
                            <Badge variant="outline" className={group.color}>
                              {group.students.length} student{group.students.length !== 1 ? 's' : ''}
                            </Badge>
                            {selectedCount > 0 && (
                              <Badge variant="default" className="bg-primary">
                                {selectedCount} selected
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{group.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedCount > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              openBulkAdjustDialog(group);
                            }}
                            className="text-xs gap-1"
                          >
                            <Edit2 className="h-3 w-3" />
                            Adjust Grades
                          </Button>
                        )}
                        {classId && group.students.length > 0 && (
                          <Button
                            size="sm"
                            variant={isPushed ? 'outline' : 'secondary'}
                            disabled={isPushing || isPushed}
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePushGroup(group);
                            }}
                            className="text-xs"
                          >
                            {isPushed ? (
                              <>
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Sent
                              </>
                            ) : isPushing ? (
                              <>
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                Sending...
                              </>
                            ) : (
                              <>
                                <Send className="h-3 w-3 mr-1" />
                                Send {group.remediationType.split(' ')[0]}
                              </>
                            )}
                          </Button>
                        )}
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <div className="px-4 pb-4 space-y-3">
                      {/* Select All Toggle */}
                      {group.students.length > 0 && (
                        <div className="flex items-center gap-2 pb-2 border-b">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={() => toggleSelectAllInGroup(group)}
                            id={`select-all-${group.level}`}
                          />
                          <Label 
                            htmlFor={`select-all-${group.level}`}
                            className="text-sm cursor-pointer"
                          >
                            Select all students in this group
                          </Label>
                        </div>
                      )}

                      {/* Student List with Per-Student Focus Areas */}
                      {group.students.length > 0 ? (
                        <div className="divide-y divide-border/30">
                          {group.students.map((item, index) => {
                            const grade = getEffectiveGrade(item.result);
                            const isSelected = isStudentSelected(group.level, item.id);
                            const isEven = index % 2 === 0;
                            const studentMisconceptions = item.result?.misconceptions || [];
                            return (
                              <div
                                key={item.id}
                                className={`py-2.5 px-2 cursor-pointer transition-colors ${
                                  isSelected 
                                    ? 'bg-primary/10' 
                                    : isEven 
                                      ? 'bg-background/40' 
                                      : 'bg-muted/30'
                                } hover:bg-accent/50`}
                                onClick={() => toggleStudentSelection(group.level, item.id)}
                              >
                                <div className="flex items-center gap-3">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleStudentSelection(group.level, item.id)}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <span className="text-sm font-medium flex-1">{item.studentName}</span>
                                  <span className={`text-sm font-semibold tabular-nums ${group.color}`}>
                                    {grade}%
                                  </span>
                                </div>
                                {/* Per-student focus areas */}
                                {studentMisconceptions.length > 0 && (
                                  <div className="ml-8 mt-1 flex flex-wrap gap-1">
                                    {studentMisconceptions.slice(0, 3).map((m, i) => (
                                      <span key={i} className="text-xs text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">
                                        {m}
                                      </span>
                                    ))}
                                    {studentMisconceptions.length > 3 && (
                                      <span className="text-xs text-muted-foreground">
                                        +{studentMisconceptions.length - 3} more
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground italic text-center py-2">
                          No students in this group
                        </p>
                      )}

                      {/* Group Summary - Aggregated Focus Areas */}
                      {misconceptions.length > 0 && (
                        <div className="pt-3 mt-3 border-t border-border/50">
                          <p className="text-xs font-medium text-muted-foreground mb-2">
                            Most frequent focus areas across this group (individual topics vary per student):
                          </p>
                          <div className="space-y-1.5">
                            {misconceptions.map((m, i) => (
                              <div key={i} className="flex items-start gap-2 text-sm">
                                <span className="text-muted-foreground shrink-0">•</span>
                                <span className="flex-1 text-foreground/80">{m.misconception}</span>
                                <span className="text-xs text-muted-foreground shrink-0">({m.count})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Remediation Details */}
                      <div className="flex items-center gap-4 pt-2 border-t text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Zap className="h-3 w-3 text-purple-500" />
                          +{group.xpReward} XP per student
                        </span>
                        <span className="flex items-center gap-1">
                          <Award className="h-3 w-3 text-amber-500" />
                          +{group.coinReward} coins per student
                        </span>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </CardContent>
      </Card>

      {/* Bulk Grade Adjustment Dialog */}
      <Dialog open={bulkAdjustDialogOpen} onOpenChange={setBulkAdjustDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Bulk Grade Adjustment
            </DialogTitle>
            <DialogDescription>
              {showConfirmation 
                ? `Review and confirm the grade adjustments for ${getPreviewData.length} student(s).`
                : `Apply the same grade adjustment to ${activeGroupForAdjust ? getSelectedCount(activeGroupForAdjust.level) : 0} selected student(s) in the ${activeGroupForAdjust?.label} group.`
              }
            </DialogDescription>
          </DialogHeader>

          {showConfirmation ? (
            /* Confirmation Preview Step */
            <div className="space-y-4 py-4">
              <div className="p-3 bg-muted/50 rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Total Adjustment</p>
                  <p className="text-xs text-muted-foreground">{justification}</p>
                </div>
                <span className={`text-2xl font-bold ${totalAdjustment >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {totalAdjustment >= 0 ? '+' : ''}{totalAdjustment}%
                </span>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Preview of Changes
                  <Badge variant="secondary">{getPreviewData.length} students</Badge>
                </Label>
                <ScrollArea className="h-[250px] border rounded-lg">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead className="text-center">Current</TableHead>
                        <TableHead className="text-center w-[50px]"></TableHead>
                        <TableHead className="text-center">New</TableHead>
                        <TableHead className="text-center">Change</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getPreviewData.map((student) => (
                        <TableRow key={student.id}>
                          <TableCell className="font-medium">{student.studentName}</TableCell>
                          <TableCell className="text-center">
                            <span className={`font-semibold ${
                              student.currentGrade >= 80 ? 'text-green-600' :
                              student.currentGrade >= 60 ? 'text-yellow-600' : 'text-red-600'
                            }`}>
                              {Math.round(student.currentGrade)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <ArrowRight className="h-4 w-4 text-muted-foreground mx-auto" />
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`font-bold ${
                              student.newGrade >= 80 ? 'text-green-600' :
                              student.newGrade >= 60 ? 'text-yellow-600' : 'text-red-600'
                            }`}>
                              {Math.round(student.newGrade)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge 
                              variant={student.adjustment >= 0 ? 'default' : 'destructive'}
                              className="text-xs"
                            >
                              {student.adjustment >= 0 ? '+' : ''}{student.adjustment}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>Note:</strong> This will update the grades for all students listed above. 
                  This action can be reversed by manually adjusting grades individually.
                </p>
              </div>
            </div>
          ) : (
            /* Adjustment Selection Step */
            <div className="space-y-4 py-4">
              {/* Quick Reassessment Criteria */}
              <div className="space-y-2">
                <Label>Select applicable criteria:</Label>
                <div className="grid grid-cols-1 gap-2 max-h-[180px] overflow-y-auto">
                  {REASSESSMENT_CRITERIA.map(criteria => (
                    <div
                      key={criteria.id}
                      className={`flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                        selectedCriteria.includes(criteria.id)
                          ? 'bg-primary/10 border-primary'
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => handleCriteriaToggle(criteria.id)}
                    >
                      <Checkbox
                        checked={selectedCriteria.includes(criteria.id)}
                        onCheckedChange={() => handleCriteriaToggle(criteria.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-none">
                          {criteria.label}
                          <span className="ml-1 text-xs text-green-600">
                            +{criteria.gradeAdjustment}%
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {criteria.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Additional Manual Adjustment */}
              <div className="space-y-2">
                <Label>Additional Manual Adjustment</Label>
                <div className="flex items-center gap-3">
                  <Slider
                    value={[manualAdjustment]}
                    onValueChange={([value]) => setManualAdjustment(value)}
                    min={-20}
                    max={20}
                    step={1}
                    className="flex-1"
                  />
                  <span className={`text-lg font-bold min-w-[60px] text-right ${manualAdjustment >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {manualAdjustment >= 0 ? '+' : ''}{manualAdjustment}%
                  </span>
                </div>
              </div>

              {/* Total Adjustment Preview */}
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total Adjustment:</span>
                  <span className={`text-xl font-bold ${totalAdjustment >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {totalAdjustment >= 0 ? '+' : ''}{totalAdjustment}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Will be applied to each selected student's current grade (capped at 0-100%)
                </p>
              </div>

              {/* Justification */}
              <div className="space-y-2">
                <Label htmlFor="bulk-justification">Justification (required)</Label>
                <Textarea
                  id="bulk-justification"
                  placeholder="Explain the grade adjustment for these students..."
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {showConfirmation ? (
              <>
                <Button variant="outline" onClick={handleBackToAdjustment}>
                  Back
                </Button>
                <Button onClick={handleApplyBulkAdjustment}>
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Confirm & Apply
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setBulkAdjustDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleProceedToConfirmation} 
                  disabled={!justification.trim() || totalAdjustment === 0}
                >
                  <ArrowRight className="h-4 w-4 mr-1" />
                  Preview Changes
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
