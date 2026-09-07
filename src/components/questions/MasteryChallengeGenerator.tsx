import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Trophy,
  Star,
  ArrowRight,
  Sparkles,
  Users,
  BookOpen,
  Loader2,
  Printer,
  ChevronDown,
  ChevronUp,
  Check,
  GraduationCap,
  Layers,
  Shuffle,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { fixEncodingCorruption, renderMathText } from '@/lib/mathRenderer';
import { useStudentNames } from '@/lib/StudentNameContext';

interface MasteryChallengeGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MasteryStudent {
  id: string;
  firstName: string;
  lastName: string;
  topicName: string;
  currentLevel: string;
  latestGrade: number | null;
  assessmentDate: string;
  selected: boolean;
}

interface GeneratedQuestion {
  questionNumber: number;
  topic: string;
  standard: string;
  question: string;
  difficulty: string;
  advancementLevel: 'A';
  hint?: string;
}

type ChallengeType = 'deeper' | 'application' | 'next-topic';
type SelectionMode = 'single' | 'multi';

const CHALLENGE_TYPES = {
  deeper: {
    label: 'Deeper Mastery',
    description: 'Advanced problems within the same topic to confirm full understanding',
    icon: Star,
  },
  application: {
    label: 'Real-World Application',
    description: 'Apply concepts to complex, multi-step real-world scenarios',
    icon: Sparkles,
  },
  'next-topic': {
    label: 'Bridge to Next Topic',
    description: 'Preview problems that connect to the next topic in the curriculum',
    icon: ArrowRight,
  },
};

const LEVEL_COLORS: Record<string, string> = {
  A: 'bg-green-100 text-green-800 border-green-300',
  B: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  C: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  D: 'bg-orange-100 text-orange-800 border-orange-300',
  E: 'bg-red-100 text-red-800 border-red-300',
  F: 'bg-gray-100 text-gray-800 border-gray-300',
};

export function MasteryChallengeGenerator({ open, onOpenChange }: MasteryChallengeGeneratorProps) {
  const { getDisplayName } = useStudentNames();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [step, setStep] = useState<'topic' | 'students' | 'configure' | 'preview'>('topic');
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('single');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<MasteryStudent[]>([]);
  const [challengeType, setChallengeType] = useState<ChallengeType>('deeper');
  const [questionCount, setQuestionCount] = useState('5');
  const [includeHints, setIncludeHints] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[]>([]);
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());

  // Fetch students with Level A on any topic (high achievers)
  const { data: masteryStudents, isLoading } = useQuery({
    queryKey: ['mastery-students', user?.id],
    queryFn: async () => {
      // Get diagnostic results with Level A
      const { data: diagnostics, error: diagError } = await supabase
        .from('diagnostic_results')
        .select(`
          id,
          student_id,
          topic_name,
          recommended_level,
          created_at,
          students!inner(id, first_name, last_name, class_id)
        `)
        .eq('teacher_id', user?.id)
        .eq('recommended_level', 'A')
        .order('created_at', { ascending: false });

      if (diagError) throw diagError;

      // Also get grade history for students with 100%
      const { data: grades, error: gradeError } = await supabase
        .from('grade_history')
        .select(`
          id,
          student_id,
          topic_name,
          grade,
          created_at,
          students!inner(id, first_name, last_name, class_id)
        `)
        .eq('teacher_id', user?.id)
        .gte('grade', 95)
        .order('created_at', { ascending: false });

      if (gradeError) throw gradeError;

      // Combine and dedupe by student+topic
      const studentTopicMap = new Map<string, MasteryStudent>();

      diagnostics?.forEach((d: any) => {
        const key = `${d.student_id}-${d.topic_name}`;
        if (!studentTopicMap.has(key)) {
          studentTopicMap.set(key, {
            id: d.student_id,
            firstName: d.students.first_name,
            lastName: d.students.last_name,
            topicName: d.topic_name,
            currentLevel: 'A',
            latestGrade: null,
            assessmentDate: d.created_at,
            selected: false,
          });
        }
      });

      grades?.forEach((g: any) => {
        const key = `${g.student_id}-${g.topic_name}`;
        if (!studentTopicMap.has(key)) {
          studentTopicMap.set(key, {
            id: g.student_id,
            firstName: g.students.first_name,
            lastName: g.students.last_name,
            topicName: g.topic_name,
            currentLevel: 'A',
            latestGrade: g.grade,
            assessmentDate: g.created_at,
            selected: false,
          });
        } else {
          const existing = studentTopicMap.get(key)!;
          if (!existing.latestGrade || g.grade > existing.latestGrade) {
            existing.latestGrade = g.grade;
          }
        }
      });

      return Array.from(studentTopicMap.values());
    },
    enabled: open && !!user?.id,
  });

  // Group students by topic
  const studentsByTopic = useMemo(() => {
    if (!masteryStudents) return {};
    
    const grouped: Record<string, MasteryStudent[]> = {};
    masteryStudents.forEach(student => {
      if (!grouped[student.topicName]) {
        grouped[student.topicName] = [];
      }
      grouped[student.topicName].push(student);
    });
    
    return grouped;
  }, [masteryStudents]);

  // Group topics by subject area (extract subject from topic name pattern)
  const topicsBySubject = useMemo(() => {
    const topics = Object.keys(studentsByTopic);
    const grouped: Record<string, string[]> = {};
    
    topics.forEach(topic => {
      // Try to extract subject area from topic name
      // Common patterns: "Algebra - Linear Equations", "Geometry: Triangles", "Number Sense", etc.
      let subject = 'General Mathematics';
      
      if (topic.includes(' - ')) {
        subject = topic.split(' - ')[0].trim();
      } else if (topic.includes(': ')) {
        subject = topic.split(': ')[0].trim();
      } else if (topic.toLowerCase().includes('algebra')) {
        subject = 'Algebra';
      } else if (topic.toLowerCase().includes('geometry')) {
        subject = 'Geometry';
      } else if (topic.toLowerCase().includes('number')) {
        subject = 'Number Sense';
      } else if (topic.toLowerCase().includes('ratio') || topic.toLowerCase().includes('proportion')) {
        subject = 'Ratios & Proportions';
      } else if (topic.toLowerCase().includes('statistics') || topic.toLowerCase().includes('probability')) {
        subject = 'Statistics & Probability';
      } else if (topic.toLowerCase().includes('function')) {
        subject = 'Functions';
      }
      
      if (!grouped[subject]) {
        grouped[subject] = [];
      }
      grouped[subject].push(topic);
    });
    
    return grouped;
  }, [studentsByTopic]);

  // Single topic selection
  const handleSelectTopic = (topic: string) => {
    if (selectionMode === 'single') {
      setSelectedTopics([topic]);
      // Auto-select all students in this topic
      const topicStudents = studentsByTopic[topic] || [];
      setSelectedStudents(topicStudents.map(s => ({ ...s, selected: true })));
      setStep('students');
    }
  };

  // Multi-topic toggle
  const toggleTopicSelection = (topic: string) => {
    setSelectedTopics(prev => {
      if (prev.includes(topic)) {
        return prev.filter(t => t !== topic);
      }
      return [...prev, topic];
    });
  };

  // Select all topics in a subject area
  const handleSelectAllSubjectTopics = (subject: string) => {
    const subjectTopics = topicsBySubject[subject] || [];
    // Get all students from all topics in this subject
    const allStudents: MasteryStudent[] = [];
    subjectTopics.forEach(topic => {
      const topicStudents = studentsByTopic[topic] || [];
      topicStudents.forEach(s => {
        if (!allStudents.some(existing => existing.id === s.id && existing.topicName === s.topicName)) {
          allStudents.push({ ...s, selected: true });
        }
      });
    });
    
    setSelectedTopics(subjectTopics);
    setSelectedStudents(allStudents);
    setStep('students');
  };

  // Proceed with multi-topic selection
  const handleProceedWithMultiTopics = () => {
    if (selectedTopics.length === 0) return;
    
    // Get all students from selected topics
    const allStudents: MasteryStudent[] = [];
    selectedTopics.forEach(topic => {
      const topicStudents = studentsByTopic[topic] || [];
      topicStudents.forEach(s => {
        if (!allStudents.some(existing => existing.id === s.id && existing.topicName === s.topicName)) {
          allStudents.push({ ...s, selected: true });
        }
      });
    });
    
    setSelectedStudents(allStudents);
    setStep('students');
  };

  const toggleStudent = (studentId: string, topicName?: string) => {
    setSelectedStudents(prev => {
      const exists = prev.find(s => s.id === studentId && (!topicName || s.topicName === topicName));
      if (exists) {
        return prev.filter(s => !(s.id === studentId && (!topicName || s.topicName === topicName)));
      }
      
      // Find the student in masteryStudents
      const student = masteryStudents?.find(s => 
        s.id === studentId && (!topicName || s.topicName === topicName)
      );
      if (student) {
        return [...prev, { ...student, selected: true }];
      }
      return prev;
    });
  };

  const toggleAllStudents = () => {
    // Get all students from selected topics
    const allStudents: MasteryStudent[] = [];
    selectedTopics.forEach(topic => {
      const topicStudents = studentsByTopic[topic] || [];
      topicStudents.forEach(s => {
        if (!allStudents.some(existing => existing.id === s.id && existing.topicName === s.topicName)) {
          allStudents.push(s);
        }
      });
    });
    
    const allSelected = allStudents.every(s => 
      selectedStudents.some(sel => sel.id === s.id && sel.topicName === s.topicName)
    );

    if (allSelected) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(allStudents.map(s => ({ ...s, selected: true })));
    }
  };

  const toggleSubjectExpanded = (subject: string) => {
    setExpandedSubjects(prev => {
      const next = new Set(prev);
      if (next.has(subject)) {
        next.delete(subject);
      } else {
        next.add(subject);
      }
      return next;
    });
  };

  const handleGenerate = async () => {
    if (selectedStudents.length === 0) {
      toast({
        title: 'No students selected',
        description: 'Please select at least one student to generate a challenge worksheet.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);

    try {
      // Get unique topics from selected students
      const topics = [...new Set(selectedStudents.map(s => s.topicName))];
      
      const challengePrompt = challengeType === 'deeper' 
        ? 'Create advanced-level questions that test deep understanding and edge cases within the topic.'
        : challengeType === 'application'
        ? 'Create real-world application problems that require students to apply concepts in complex, multi-step scenarios.'
        : 'Create bridge problems that connect this topic to related advanced concepts and preview the next curriculum topic.';

      const { data, error } = await supabase.functions.invoke('generate-worksheet-questions', {
        body: {
          topics: topics.map(t => ({
            topicName: t,
            standard: '',
            subject: 'Mathematics',
            category: 'Mastery Challenge',
          })),
          questionCount: parseInt(questionCount),
          difficultyLevels: ['challenging', 'hard'],
          worksheetMode: 'practice',
          includeHints,
          customInstructions: `${challengePrompt} These students have demonstrated mastery (Level A or 95%+) on this topic. Create questions that will truly challenge them and confirm their command of the material. Questions should be significantly harder than standard practice problems.`,
        },
      });

      if (error) throw error;

      const questions = (data?.questions || []).map((q: any, idx: number) => ({
        ...q,
        questionNumber: idx + 1,
        advancementLevel: 'A' as const,
      }));

      setGeneratedQuestions(questions);
      setStep('preview');
      
      toast({
        title: 'Mastery challenge generated!',
        description: `Created ${questions.length} advanced questions for ${selectedStudents.length} student(s).`,
      });
    } catch (error: any) {
      console.error('Error generating mastery challenge:', error);
      toast({
        title: 'Generation failed',
        description: error.message || 'Failed to generate mastery challenge questions.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClose = () => {
    setStep('topic');
    setSelectionMode('single');
    setSelectedTopics([]);
    setSelectedStudents([]);
    setGeneratedQuestions([]);
    setExpandedSubjects(new Set());
    onOpenChange(false);
  };

  // Get students for selected topics
  const studentsForSelectedTopics = useMemo(() => {
    const allStudents: MasteryStudent[] = [];
    selectedTopics.forEach(topic => {
      const topicStudents = studentsByTopic[topic] || [];
      topicStudents.forEach(s => {
        if (!allStudents.some(existing => existing.id === s.id && existing.topicName === s.topicName)) {
          allStudents.push(s);
        }
      });
    });
    return allStudents;
  }, [selectedTopics, studentsByTopic]);

  const topics = Object.keys(studentsByTopic);
  const subjects = Object.keys(topicsBySubject);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Trophy className="h-5 w-5 text-amber-500" />
            Mastery Challenge Generator
          </DialogTitle>
          <DialogDescription>
            Generate advanced worksheets for students who have achieved Level A or scored 95%+ to test their command of the topic
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Select Topic */}
        {step === 'topic' && (
          <>
            <ScrollArea className="flex-1 pr-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : topics.length === 0 ? (
                <Card className="text-center py-12">
                  <CardContent>
                    <GraduationCap className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                    <h3 className="font-medium text-lg mb-2">No Mastery Topics Yet</h3>
                    <p className="text-muted-foreground">
                      Topics will appear here once students achieve Level A on diagnostic assessments or score 95%+ on topic assessments.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {/* Mode Toggle */}
                  <div className="flex gap-2 mb-4">
                    <Button
                      variant={selectionMode === 'single' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setSelectionMode('single');
                        setSelectedTopics([]);
                      }}
                    >
                      Single Topic
                    </Button>
                    <Button
                      variant={selectionMode === 'multi' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setSelectionMode('multi');
                        setSelectedTopics([]);
                      }}
                      className="gap-1"
                    >
                      <Layers className="h-4 w-4" />
                      Multi-Topic
                    </Button>
                  </div>

                  <div className="mb-4">
                    <h3 className="font-medium text-base mb-1">
                      Step 1: {selectionMode === 'single' ? 'Select a Topic' : 'Select Multiple Topics'}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {selectionMode === 'single' 
                        ? 'Choose a topic where students have demonstrated mastery.'
                        : 'Select multiple topics or use "Mix All" to combine all subtopics in a subject area.'}
                    </p>
                  </div>

                  {/* Topics grouped by subject */}
                  <div className="space-y-3">
                    {subjects.map((subject) => {
                      const subjectTopics = topicsBySubject[subject] || [];
                      const isExpanded = expandedSubjects.has(subject);
                      const totalStudents = subjectTopics.reduce((sum, t) => sum + (studentsByTopic[t]?.length || 0), 0);
                      const selectedInSubject = subjectTopics.filter(t => selectedTopics.includes(t)).length;
                      
                      return (
                        <Card key={subject} className="overflow-hidden">
                          <Collapsible open={isExpanded} onOpenChange={() => toggleSubjectExpanded(subject)}>
                            <CollapsibleTrigger className="w-full">
                              <CardHeader className="py-3 px-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    {isExpanded ? (
                                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                    )}
                                    <div className="text-left">
                                      <CardTitle className="text-sm font-semibold">{subject}</CardTitle>
                                      <CardDescription className="text-xs">
                                        {subjectTopics.length} topic{subjectTopics.length !== 1 ? 's' : ''} • {totalStudents} student{totalStudents !== 1 ? 's' : ''}
                                      </CardDescription>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {selectionMode === 'multi' && selectedInSubject > 0 && (
                                      <Badge variant="secondary" className="text-xs">
                                        {selectedInSubject} selected
                                      </Badge>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="gap-1 text-xs"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSelectAllSubjectTopics(subject);
                                      }}
                                    >
                                      <Shuffle className="h-3 w-3" />
                                      Mix All
                                    </Button>
                                  </div>
                                </div>
                              </CardHeader>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <CardContent className="pt-0 pb-3 px-4">
                                <div className="grid gap-2">
                                  {subjectTopics.map((topic) => {
                                    const studentCount = studentsByTopic[topic]?.length || 0;
                                    const isSelected = selectedTopics.includes(topic);
                                    
                                    return (
                                      <div
                                        key={topic}
                                        className={cn(
                                          'flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors',
                                          isSelected 
                                            ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700'
                                            : 'hover:bg-muted/50 border border-transparent'
                                        )}
                                        onClick={() => {
                                          if (selectionMode === 'single') {
                                            handleSelectTopic(topic);
                                          } else {
                                            toggleTopicSelection(topic);
                                          }
                                        }}
                                      >
                                        <div className="flex items-center gap-3">
                                          {selectionMode === 'multi' && (
                                            <Checkbox
                                              checked={isSelected}
                                              onCheckedChange={() => toggleTopicSelection(topic)}
                                            />
                                          )}
                                          <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                                            <BookOpen className="h-4 w-4 text-amber-600" />
                                          </div>
                                          <div>
                                            <h4 className="font-medium text-sm">{topic}</h4>
                                            <p className="text-xs text-muted-foreground">
                                              {studentCount} student{studentCount !== 1 ? 's' : ''} at mastery
                                            </p>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Badge className={cn('text-xs', LEVEL_COLORS['A'])}>
                                            Level A
                                          </Badge>
                                          {selectionMode === 'single' && (
                                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                          )}
                                          {isSelected && selectionMode === 'multi' && (
                                            <Check className="h-4 w-4 text-amber-600" />
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </CardContent>
                            </CollapsibleContent>
                          </Collapsible>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}
            </ScrollArea>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              {selectionMode === 'multi' && selectedTopics.length > 0 && (
                <Button 
                  onClick={handleProceedWithMultiTopics}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  <Users className="h-4 w-4 mr-2" />
                  Continue ({selectedTopics.length} topics)
                </Button>
              )}
            </DialogFooter>
          </>
        )}

        {/* Step 2: Select Students from Topic(s) */}
        {step === 'students' && selectedTopics.length > 0 && (
          <>
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-4">
                <div className="mb-4">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {selectedTopics.map(topic => (
                      <Badge key={topic} className="bg-amber-500">{topic}</Badge>
                    ))}
                    <Badge variant="outline">{studentsForSelectedTopics.length} students total</Badge>
                  </div>
                  <h3 className="font-medium text-base mb-1">Step 2: Select Students</h3>
                  <p className="text-sm text-muted-foreground">
                    All students who mastered the selected topic(s) are pre-selected. Uncheck any you want to exclude.
                  </p>
                </div>

                <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedStudents.length === studentsForSelectedTopics.length}
                          onCheckedChange={toggleAllStudents}
                        />
                        <span className="font-medium">Select All ({studentsForSelectedTopics.length})</span>
                      </div>
                      <Badge variant="secondary">
                        {selectedStudents.length} selected
                      </Badge>
                    </div>
                    
                    {/* Group students by topic for multi-topic mode */}
                    {selectedTopics.length > 1 ? (
                      <div className="space-y-4">
                        {selectedTopics.map(topic => {
                          const topicStudents = studentsByTopic[topic] || [];
                          if (topicStudents.length === 0) return null;
                          
                          return (
                            <div key={topic}>
                              <p className="text-xs font-medium text-muted-foreground mb-2">{topic}</p>
                              <div className="grid gap-2">
                                {topicStudents.map(student => {
                                  const isSelected = selectedStudents.some(
                                    s => s.id === student.id && s.topicName === student.topicName
                                  );
                                  
                                  return (
                                    <div
                                      key={`${student.id}-${student.topicName}`}
                                      className={cn(
                                        'flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors',
                                        isSelected 
                                          ? 'bg-white dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700'
                                          : 'bg-muted/30 hover:bg-muted/50'
                                      )}
                                      onClick={() => toggleStudent(student.id, student.topicName)}
                                    >
                                      <div className="flex items-center gap-3">
                                        <Checkbox
                                          checked={isSelected}
                                          onCheckedChange={() => toggleStudent(student.id, student.topicName)}
                                        />
                                        <div>
                                          <p className="font-medium">
                                            {getDisplayName(student.id, student.firstName, student.lastName)}
                                          </p>
                                          <p className="text-sm text-muted-foreground">
                                            {student.latestGrade !== null ? `Score: ${student.latestGrade}%` : 'Level A achieved'}
                                          </p>
                                        </div>
                                      </div>
                                      {isSelected && (
                                        <Check className="h-5 w-5 text-amber-600" />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="grid gap-2">
                        {studentsForSelectedTopics.map(student => {
                          const isSelected = selectedStudents.some(s => s.id === student.id);
                          
                          return (
                            <div
                              key={student.id}
                              className={cn(
                                'flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors',
                                isSelected 
                                  ? 'bg-white dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700'
                                  : 'bg-muted/30 hover:bg-muted/50'
                              )}
                              onClick={() => toggleStudent(student.id)}
                            >
                              <div className="flex items-center gap-3">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleStudent(student.id)}
                                />
                                <div>
                                  <p className="font-medium">
                                    {getDisplayName(student.id, student.firstName, student.lastName)}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {student.latestGrade !== null ? `Score: ${student.latestGrade}%` : 'Level A achieved'}
                                  </p>
                                </div>
                              </div>
                              {isSelected && (
                                <Check className="h-5 w-5 text-amber-600" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>

            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setStep('topic');
                setSelectedTopics([]);
                setSelectedStudents([]);
              }}>
                Back
              </Button>
              <Button 
                onClick={() => setStep('configure')}
                disabled={selectedStudents.length === 0}
                className="bg-amber-600 hover:bg-amber-700"
              >
                <Users className="h-4 w-4 mr-2" />
                Configure Challenge ({selectedStudents.length})
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'configure' && (
          <>
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-6">
                {/* Selected Summary */}
                <Card className="bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Trophy className="h-5 w-5 text-amber-500" />
                      <span className="font-medium">Challenge for {selectedStudents.length} student(s)</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {selectedTopics.map(topic => (
                        <Badge key={topic} variant="outline" className="text-xs">
                          {topic}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Challenge Type Selection */}
                <div className="space-y-3">
                  <Label className="text-base font-medium">Challenge Type</Label>
                  <div className="grid gap-3">
                    {Object.entries(CHALLENGE_TYPES).map(([key, config]) => {
                      const Icon = config.icon;
                      return (
                        <Card 
                          key={key}
                          className={cn(
                            'cursor-pointer transition-all',
                            challengeType === key 
                              ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20' 
                              : 'hover:border-muted-foreground/50'
                          )}
                          onClick={() => setChallengeType(key as ChallengeType)}
                        >
                          <CardContent className="p-4 flex items-start gap-3">
                            <div className={cn(
                              'p-2 rounded-lg',
                              challengeType === key ? 'bg-amber-100 text-amber-700' : 'bg-muted'
                            )}>
                              <Icon className="h-5 w-5" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <h4 className="font-medium">{config.label}</h4>
                                {challengeType === key && (
                                  <Check className="h-4 w-4 text-amber-600" />
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {config.description}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>

                <Separator />

                {/* Options */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Number of Questions</Label>
                    <Select value={questionCount} onValueChange={setQuestionCount}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3 questions</SelectItem>
                        <SelectItem value="5">5 questions</SelectItem>
                        <SelectItem value="8">8 questions</SelectItem>
                        <SelectItem value="10">10 questions</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <Label htmlFor="hints" className="cursor-pointer">Include Hints</Label>
                    <Checkbox
                      id="hints"
                      checked={includeHints}
                      onCheckedChange={(checked) => setIncludeHints(!!checked)}
                    />
                  </div>
                </div>

                {/* Info Box */}
                <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                  <CardContent className="p-4">
                    <div className="flex gap-3">
                      <BookOpen className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-green-800 dark:text-green-200">
                          What happens next?
                        </p>
                        <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                          Students who complete the mastery challenge successfully can move on to a new topic or receive enrichment materials. 
                          Those who struggle may need additional review before progressing.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('students')}>
                Back
              </Button>
              <Button 
                onClick={handleGenerate}
                disabled={isGenerating}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Challenge
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'preview' && (
          <>
            <ScrollArea className="flex-1 pr-4">
              <div className="mastery-challenge-worksheet bg-white text-black p-6 rounded-lg border">
                {/* Header */}
                <div className="border-b-2 border-black pb-4 mb-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h1 className="text-xl font-bold">Mastery Challenge</h1>
                      <p className="text-sm text-gray-600">{selectedTopics.join(', ')}</p>
                    </div>
                    <Badge className={cn('text-sm', LEVEL_COLORS['A'])}>
                      Level A - Advanced
                    </Badge>
                  </div>
                  {selectedStudents.length === 1 && (
                    <p className="mt-2">
                      <strong>Student:</strong> {getDisplayName(selectedStudents[0].id, selectedStudents[0].firstName, selectedStudents[0].lastName)}
                    </p>
                  )}
                  <div className="flex gap-4 mt-2 text-sm text-gray-600">
                    <span>Date: _______________</span>
                    <span>Period: ________</span>
                  </div>
                </div>

                {/* Instructions */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-sm">
                  <strong>Instructions:</strong> This is an advanced challenge worksheet. 
                  Show all your work and explain your reasoning. These problems are designed to test 
                  your complete mastery of the topic.
                </div>

                {/* Questions */}
                <div className="space-y-6">
                  {generatedQuestions.map((q, idx) => (
                    <div key={idx} className="border rounded-lg p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="bg-amber-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                          {q.questionNumber}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {q.difficulty}
                        </Badge>
                      </div>
                      <p className="text-base mb-4" style={{ fontFamily: 'Georgia, serif' }}>
                        {renderMathText(fixEncodingCorruption(q.question))}
                      </p>
                      {includeHints && q.hint && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mb-4 text-sm">
                          <span className="font-semibold text-yellow-700">💡 Hint:</span>{' '}
                          <span className="text-yellow-800 italic">
                            {renderMathText(fixEncodingCorruption(q.hint))}
                          </span>
                        </div>
                      )}
                      <div className="border-2 border-dashed border-gray-300 rounded p-4 min-h-[120px]">
                        <p className="text-xs text-gray-400">Show your work:</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="mt-6 pt-4 border-t text-center text-xs text-gray-500">
                  Mastery Challenge • {selectedTopics[0] || 'Mathematics'}{selectedTopics.length > 1 ? ` (+${selectedTopics.length - 1} more)` : ''}
                </div>
              </div>
            </ScrollArea>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('configure')}>
                Back
              </Button>
              <Button onClick={() => window.print()} className="gap-2">
                <Printer className="h-4 w-4" />
                Print Worksheet
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}