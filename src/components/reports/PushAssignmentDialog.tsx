import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Send, Loader2, Users, Target, TrendingDown, AlertCircle, Sparkles, Check, Search, BookOpen } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { usePushToSisterApp } from '@/hooks/usePushToSisterApp';
import { toast } from 'sonner';
import { NYS_SUBJECTS } from '@/data/nysTopics';
import { useStudentNames } from '@/lib/StudentNameContext';

interface PushAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultClassId?: string;
}

interface ClassOption {
  id: string;
  name: string;
  studentCount: number;
}

interface StudentWeakness {
  studentId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  weakTopics: Array<{
    topic: string;
    standard: string | null;
    avgGrade: number;
    attempts: number;
  }>;
}

interface StudentRecord {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
}

export function PushAssignmentDialog({
  const { getDisplayName } = useStudentNames();
  open,
  onOpenChange,
  defaultClassId,
}: PushAssignmentDialogProps) {
  const { user } = useAuth();
  const { pushToSisterApp } = usePushToSisterApp();

  const [activeTab, setActiveTab] = useState<'auto' | 'manual'>('auto');
  const [selectedClassId, setSelectedClassId] = useState<string>(defaultClassId || '');
  const [questionCount, setQuestionCount] = useState(5);
  const [isPushing, setIsPushing] = useState(false);
  const [pushProgress, setPushProgress] = useState({ current: 0, total: 0, studentName: '' });

  // Manual enrichment state
  const [manualTopic, setManualTopic] = useState('');
  const [manualStandard, setManualStandard] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (defaultClassId) setSelectedClassId(defaultClassId);
  }, [defaultClassId]);

  // Reset manual selections when class changes
  useEffect(() => {
    setSelectedStudentIds(new Set());
  }, [selectedClassId]);

  // Fetch classes
  const { data: classes, isLoading: loadingClasses } = useQuery({
    queryKey: ['push-assignment-classes', user?.id],
    queryFn: async () => {
      const { data: classesData, error } = await supabase
        .from('classes')
        .select('id, name')
        .eq('teacher_id', user!.id)
        .is('archived_at', null)
        .order('name');
      if (error) throw error;

      const classOptions: ClassOption[] = [];
      for (const cls of classesData || []) {
        const { count } = await supabase
          .from('students')
          .select('id', { count: 'exact', head: true })
          .eq('class_id', cls.id);
        classOptions.push({ id: cls.id, name: cls.name, studentCount: count || 0 });
      }
      return classOptions;
    },
    enabled: !!user && open,
  });

  // Fetch all students for manual selection
  const { data: allStudents } = useQuery({
    queryKey: ['class-students-for-push', selectedClassId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('id, first_name, last_name, email')
        .eq('class_id', selectedClassId)
        .order('last_name');
      if (error) throw error;
      return data as StudentRecord[];
    },
    enabled: !!selectedClassId && open,
  });

  // Analyze student performance (auto mode only)
  const { data: studentWeaknesses, isLoading: loadingWeaknesses } = useQuery({
    queryKey: ['student-weaknesses-for-push', selectedClassId, user?.id],
    queryFn: async () => {
      const { data: classStudents, error: studentsError } = await supabase
        .from('students')
        .select('id, first_name, last_name, email')
        .eq('class_id', selectedClassId);
      if (studentsError) throw studentsError;
      if (!classStudents || classStudents.length === 0) return [];

      const studentIds = classStudents.map(s => s.id);
      const { data: gradeHistory, error } = await supabase
        .from('grade_history')
        .select('student_id, topic_name, nys_standard, grade')
        .in('student_id', studentIds)
        .not('topic_name', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const studentAnalysis: StudentWeakness[] = [];
      for (const student of classStudents) {
        const studentGrades = (gradeHistory || []).filter(g => g.student_id === student.id);
        const topicMap = new Map<string, { grades: number[]; standard: string | null }>();
        for (const entry of studentGrades) {
          let cleanTopic = (entry.topic_name || '').trim().replace(/^(Q\d+:|Question \d+:)\s*/i, '');
          if (cleanTopic.length > 60) cleanTopic = cleanTopic.substring(0, 60) + '...';
          if (!cleanTopic) continue;
          let cleanStandard: string | null = null;
          if (entry.nys_standard) {
            const match = entry.nys_standard.match(/^([A-Z0-9.\-]+)/);
            if (match) cleanStandard = match[1];
          }
          const existing = topicMap.get(cleanTopic);
          if (existing) { existing.grades.push(entry.grade); }
          else { topicMap.set(cleanTopic, { grades: [entry.grade], standard: cleanStandard }); }
        }
        const weakTopics: StudentWeakness['weakTopics'] = [];
        topicMap.forEach((data, topic) => {
          const avg = data.grades.reduce((a, b) => a + b, 0) / data.grades.length;
          if (avg < 70) {
            weakTopics.push({ topic, standard: data.standard, avgGrade: Math.round(avg), attempts: data.grades.length });
          }
        });
        weakTopics.sort((a, b) => a.avgGrade - b.avgGrade);
        if (weakTopics.length > 0) {
          studentAnalysis.push({
            studentId: student.id,
            firstName: student.first_name,
            lastName: student.last_name,
            email: student.email,
            weakTopics: weakTopics.slice(0, 3),
          });
        }
      }
      return studentAnalysis;
    },
    enabled: !!user && open && !!selectedClassId && activeTab === 'auto',
  });

  const toggleStudent = (id: string) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllStudents = () => {
    if (!allStudents) return;
    if (selectedStudentIds.size === allStudents.length) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(allStudents.map(s => s.id)));
    }
  };

  // Helper: sync a batch of students to Scholar before pushing
  const syncStudentsToScholar = async (students: Array<{ id: string; first_name: string; last_name: string; email: string | null }>, classId: string, className: string) => {
    for (const student of students) {
      await pushToSisterApp({
        class_id: classId,
        title: 'Roster Sync',
        student_id: student.id,
        student_name: `${student.first_name} ${student.last_name}`,
        type: 'student_created',
        first_name: student.first_name,
        last_name: student.last_name,
        student_email: student.email || undefined,
        class_name: className,
      });
    }
  };

  // --- Auto remediation push (existing logic) ---
  const handlePushAutoRemediation = async () => {
    if (!selectedClassId || !studentWeaknesses || studentWeaknesses.length === 0) return;

    setIsPushing(true);
    const selectedClass = classes?.find(c => c.id === selectedClassId);

    // Auto-sync roster to Scholar first
    setPushProgress({ current: 0, total: studentWeaknesses.length, studentName: 'Syncing roster...' });
    const studentsForSync = studentWeaknesses.map(sw => ({
      id: sw.studentId,
      first_name: sw.firstName,
      last_name: sw.lastName,
      email: sw.email,
    }));
    await syncStudentsToScholar(studentsForSync, selectedClassId, selectedClass?.name || '');

    setPushProgress({ current: 0, total: studentWeaknesses.length, studentName: '' });
    let successCount = 0;
    const failedNames: string[] = [];

    try {
      for (let i = 0; i < studentWeaknesses.length; i++) {
        const student = studentWeaknesses[i];
        const primaryWeakness = student.weakTopics[0];
        setPushProgress({ current: i + 1, total: studentWeaknesses.length, studentName: `${student.firstName} ${student.lastName}` });

        const { data: questionData, error: genError } = await supabase.functions.invoke('generate-worksheet-questions', {
          body: {
            topics: [{
              topicName: primaryWeakness.topic,
              standard: primaryWeakness.standard || 'N/A',
              subject: 'Math',
              category: 'Remediation',
            }],
            questionCount,
            difficultyLevels: [primaryWeakness.avgGrade < 40 ? 'medium' : primaryWeakness.avgGrade < 60 ? 'medium' : 'hard'],
            includeHints: true,
          },
        });
        if (genError) { console.error(`Failed to generate questions for ${student.firstName}:`, genError); failedNames.push(`${student.firstName} ${student.lastName}`); continue; }
        const questions = questionData?.questions || [];
        if (questions.length === 0) { failedNames.push(`${student.firstName} ${student.lastName}`); continue; }

        const difficultyLevel = primaryWeakness.avgGrade < 40 ? 'A' : primaryWeakness.avgGrade < 60 ? 'B' : 'C';
        const remediationRecommendations = student.weakTopics.map(wt => `${wt.topic} (${wt.avgGrade}% avg)`);

        const result = await pushToSisterApp({
          type: 'assignment_push',
          source: 'scan_genius',
          class_id: selectedClassId,
          class_name: selectedClass?.name,
          title: `Remediation: ${primaryWeakness.topic}`,
          description: `Personalized practice based on your ${primaryWeakness.avgGrade}% performance on ${primaryWeakness.topic}`,
          topic_name: primaryWeakness.topic,
          standard_code: primaryWeakness.standard || undefined,
          student_id: student.studentId,
          student_name: `${student.firstName} ${student.lastName}`,
          student_email: student.email || undefined,
          first_name: student.firstName,
          last_name: student.lastName,
          xp_reward: questions.length * 15,
          coin_reward: questions.length * 10,
          difficulty_level: difficultyLevel,
          remediation_recommendations: remediationRecommendations,
          questions: questions.map((q: any, idx: number) => ({
            number: idx + 1,
            text: q.text || q.question || q.prompt_text || q.title,
            difficulty: q.difficulty || difficultyLevel,
            hints: q.hints || [],
            answer: q.answer,
            explanation: q.explanation,
          })),
        });
        if (result.success) {
          successCount++;
        } else {
          failedNames.push(`${student.firstName} ${student.lastName}`);
          console.error(`Failed to push to ${student.firstName}:`, result.error);
        }
      }

      if (successCount === studentWeaknesses.length) {
        toast.success(`Personalized assignments sent to all ${successCount} students!`);
      } else if (successCount > 0) {
        toast.warning(`Sent to ${successCount}/${studentWeaknesses.length} students. Not found on Scholar: ${failedNames.join(', ')}`);
      } else {
        toast.error(`Could not send to any students. They may not exist in the Scholar app yet. Students: ${failedNames.join(', ')}`);
      }
      onOpenChange(false);
    } catch (error) {
      console.error('Push assignment error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to push assignments');
    } finally {
      setIsPushing(false);
      setPushProgress({ current: 0, total: 0, studentName: '' });
    }
  };

  // --- Manual enrichment push ---
  const handlePushManualEnrichment = async () => {
    if (!selectedClassId || !manualTopic.trim() || selectedStudentIds.size === 0 || !allStudents) return;

    setIsPushing(true);
    const studentsToSend = allStudents.filter(s => selectedStudentIds.has(s.id));
    const selectedClass = classes?.find(c => c.id === selectedClassId);

    // Auto-sync roster to Scholar first
    setPushProgress({ current: 0, total: studentsToSend.length, studentName: 'Syncing roster...' });
    await syncStudentsToScholar(studentsToSend, selectedClassId, selectedClass?.name || '');

    setPushProgress({ current: 0, total: studentsToSend.length, studentName: '' });
    let successCount = 0;
    const failedNames: string[] = [];

    try {
      for (let i = 0; i < studentsToSend.length; i++) {
        const student = studentsToSend[i];
        setPushProgress({ current: i + 1, total: studentsToSend.length, studentName: getDisplayName(student.id, student.first_name, student.last_name) });

        const { data: questionData, error: genError } = await supabase.functions.invoke('generate-worksheet-questions', {
          body: {
            topics: [{
              topicName: manualTopic.trim(),
              standard: manualStandard.trim() || 'N/A',
              subject: 'Math',
              category: 'Enrichment',
            }],
            questionCount,
            difficultyLevels: ['medium', 'hard'],
            includeHints: false,
          },
        });
        if (genError) { console.error(`Failed to generate for ${student.first_name}:`, genError); continue; }
        const questions = questionData?.questions || [];
        if (questions.length === 0) continue;

        const result = await pushToSisterApp({
          type: 'assignment_push',
          source: 'scan_genius',
          class_id: selectedClassId,
          class_name: selectedClass?.name,
          title: `Enrichment: ${manualTopic.trim()}`,
          description: `Teacher-assigned enrichment practice on ${manualTopic.trim()}`,
          topic_name: manualTopic.trim(),
          standard_code: manualStandard.trim() || undefined,
          student_id: student.id,
          student_name: `${student.first_name} ${student.last_name}`,
          student_email: student.email || undefined,
          first_name: student.first_name,
          last_name: student.last_name,
          xp_reward: questions.length * 20,
          coin_reward: questions.length * 15,
          difficulty_level: 'C',
          remediation_recommendations: [],
          questions: questions.map((q: any, idx: number) => ({
            number: idx + 1,
            text: q.text || q.question || q.prompt_text || q.title,
            difficulty: q.difficulty || 'medium',
            hints: q.hints || [],
            answer: q.answer,
            explanation: q.explanation,
          })),
        });
        if (result.success) {
          successCount++;
        } else {
          failedNames.push(getDisplayName(student.id, student.first_name, student.last_name));
          console.error(`Failed to push to ${student.first_name}:`, result.error);
        }
      }

      if (successCount === studentsToSend.length) {
        toast.success(`Enrichment sent to all ${successCount} students!`);
      } else if (successCount > 0) {
        toast.warning(`Sent to ${successCount}/${studentsToSend.length} students. Not found on Scholar: ${failedNames.join(', ')}`);
      } else {
        toast.error(`Could not send to any students. They may not exist in the Scholar app yet. Students: ${failedNames.join(', ')}`);
      }
      onOpenChange(false);
    } catch (error) {
      console.error('Manual enrichment push error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to send enrichment');
    } finally {
      setIsPushing(false);
      setPushProgress({ current: 0, total: 0, studentName: '' });
    }
  };

  const selectedClass = classes?.find(c => c.id === selectedClassId);
  const studentsNeedingHelp = studentWeaknesses?.length || 0;
  const manualReady = manualTopic.trim().length > 0 && selectedStudentIds.size > 0 && !!selectedClassId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Push Practice to Students
          </DialogTitle>
          <DialogDescription>
            Send personalized practice via auto-detected weaknesses or manually choose students for enrichment
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Class Selection (shared) */}
          <div className="space-y-2">
            <Label>Select Class</Label>
            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger>
                <SelectValue placeholder={loadingClasses ? "Loading classes..." : "Choose a class"} />
              </SelectTrigger>
              <SelectContent>
                {classes?.map(cls => (
                  <SelectItem key={cls.id} value={cls.id}>
                    <div className="flex items-center gap-2">
                      <span>{cls.name}</span>
                      <Badge variant="outline" className="text-xs">
                        <Users className="h-3 w-3 mr-1" />
                        {cls.studentCount}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Mode Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'auto' | 'manual')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="auto" className="flex items-center gap-1.5">
                <TrendingDown className="h-3.5 w-3.5" />
                Auto Remediation
              </TabsTrigger>
              <TabsTrigger value="manual" className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Manual Enrichment
              </TabsTrigger>
            </TabsList>

            {/* Auto Remediation Tab */}
            <TabsContent value="auto" className="mt-3 space-y-3">
              {selectedClassId && (
                <>
                  <Label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <TrendingDown className="h-3.5 w-3.5" />
                    Students with topics below 70% from scanned work
                  </Label>
                  {loadingWeaknesses ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyzing student performance...
                    </div>
                  ) : studentWeaknesses && studentWeaknesses.length > 0 ? (
                    <ScrollArea className="h-48 border rounded-md p-2">
                      <div className="space-y-2">
                        {studentWeaknesses.map(student => (
                          <div key={student.studentId} className="p-2 bg-muted/50 rounded-md">
                            <div className="font-medium text-sm">
                              {student.firstName} {student.lastName}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {student.weakTopics.map((wt, idx) => (
                                <Badge
                                  key={idx}
                                  variant={wt.avgGrade < 50 ? "destructive" : "secondary"}
                                  className="text-xs"
                                >
                                  {wt.topic.length > 25 ? wt.topic.substring(0, 25) + '...' : wt.topic}
                                  <span className="ml-1 opacity-75">({wt.avgGrade}%)</span>
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 border rounded-md px-3">
                      <AlertCircle className="h-4 w-4" />
                      No students need remediation (all above 70%) or no graded work found
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            {/* Manual Enrichment Tab */}
            <TabsContent value="manual" className="mt-3 space-y-3">
              {/* Topic Picker */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <BookOpen className="h-3.5 w-3.5" />
                  Topic
                </Label>
                <TopicSearchPicker
                  value={manualTopic}
                  onSelect={(topic, standard) => {
                    setManualTopic(topic);
                    if (standard) setManualStandard(standard);
                  }}
                  onChange={(val) => setManualTopic(val)}
                />
                {manualTopic && (
                  <Badge variant="outline" className="text-xs">
                    {manualTopic}
                    {manualStandard && <span className="ml-1 font-mono opacity-75">({manualStandard})</span>}
                  </Badge>
                )}
              </div>
              <div className="space-y-2">
                <Label>Standard (optional)</Label>
                <Input
                  placeholder="e.g. A.REI.6"
                  value={manualStandard}
                  onChange={(e) => setManualStandard(e.target.value)}
                />
              </div>

              {/* Student selection */}
              {selectedClassId && allStudents && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5" />
                      Select Students
                    </Label>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={toggleAllStudents}>
                      {selectedStudentIds.size === allStudents.length ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>
                  <ScrollArea className="h-40 border rounded-md p-2">
                    <div className="space-y-1">
                      {allStudents.map(student => (
                        <label
                          key={student.id}
                          className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-sm"
                        >
                          <Checkbox
                            checked={selectedStudentIds.has(student.id)}
                            onCheckedChange={() => toggleStudent(student.id)}
                          />
                          <span>{getDisplayName(student.id, student.first_name, student.last_name)}</span>
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                  {selectedStudentIds.size > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {selectedStudentIds.size} student{selectedStudentIds.size !== 1 ? 's' : ''} selected for enrichment
                    </p>
                  )}
                </div>
              )}
              {!selectedClassId && (
                <p className="text-sm text-muted-foreground">Select a class first to pick students</p>
              )}
            </TabsContent>
          </Tabs>

          {/* Question Count (shared) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Questions per Student</Label>
              <Badge variant="secondary">{questionCount}</Badge>
            </div>
            <Slider
              value={[questionCount]}
              onValueChange={([v]) => setQuestionCount(v)}
              min={3}
              max={10}
              step={1}
            />
          </div>

          {/* Progress */}
          {isPushing && pushProgress.total > 0 && (
            <div className="space-y-2 p-3 bg-muted/50 rounded-md">
              <div className="flex items-center justify-between text-sm">
                <span>Generating for: {pushProgress.studentName}</span>
                <span>{pushProgress.current}/{pushProgress.total}</span>
              </div>
              <Progress value={(pushProgress.current / pushProgress.total) * 100} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPushing}>
            Cancel
          </Button>
          {activeTab === 'auto' ? (
            <Button
              onClick={handlePushAutoRemediation}
              disabled={isPushing || !selectedClassId || studentsNeedingHelp === 0}
            >
              {isPushing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</>
              ) : (
                <><Send className="h-4 w-4 mr-2" /> Push to {studentsNeedingHelp} Student{studentsNeedingHelp !== 1 ? 's' : ''}</>
              )}
            </Button>
          ) : (
            <Button
              onClick={handlePushManualEnrichment}
              disabled={isPushing || !manualReady}
            >
              {isPushing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" /> Send Enrichment to {selectedStudentIds.size} Student{selectedStudentIds.size !== 1 ? 's' : ''}</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Searchable topic picker with NYS curriculum suggestions */
function TopicSearchPicker({
  value,
  onSelect,
  onChange,
}: {
  value: string;
  onSelect: (topic: string, standard: string | null) => void;
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const suggestions = useMemo(() => {
    const results: { subject: string; category: string; name: string; standard: string }[] = [];
    const q = search.toLowerCase();
    for (const subject of NYS_SUBJECTS) {
      for (const cat of subject.categories) {
        for (const topic of cat.topics) {
          if (
            !q ||
            topic.name.toLowerCase().includes(q) ||
            topic.standard.toLowerCase().includes(q) ||
            cat.category.toLowerCase().includes(q) ||
            subject.name.toLowerCase().includes(q)
          ) {
            results.push({
              subject: subject.shortName,
              category: cat.category,
              name: topic.name,
              standard: topic.standard,
            });
          }
        }
      }
      if (results.length > 50) break;
    }
    return results.slice(0, 50);
  }, [search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start text-left font-normal h-9"
          onClick={() => setOpen(true)}
        >
          <Search className="h-3.5 w-3.5 mr-2 shrink-0 opacity-50" />
          {value ? (
            <span className="truncate">{value}</span>
          ) : (
            <span className="text-muted-foreground">Search topics or type your own...</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[350px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search NYS topics..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {search.trim() && (
              <CommandGroup heading="Custom topic">
                <CommandItem
                  onSelect={() => {
                    onChange(search.trim());
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-2 text-primary" />
                  Use "{search.trim()}" as topic
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading={`Curriculum topics${search ? ` matching "${search}"` : ''}`}>
              {suggestions.length === 0 ? (
                <CommandEmpty>No matching topics found</CommandEmpty>
              ) : (
                <ScrollArea className="h-[200px]">
                  {suggestions.map((s, idx) => (
                    <CommandItem
                      key={`${s.name}-${s.standard}-${idx}`}
                      onSelect={() => {
                        onSelect(s.name, s.standard);
                        setOpen(false);
                        setSearch('');
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{s.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 font-mono">{s.standard}</Badge>
                          <span className="opacity-60">{s.subject}</span>
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </ScrollArea>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
