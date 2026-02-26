import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Users,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  BookOpen,
  TrendingDown,
  FileText,
  Search,
  Database,
  CheckCircle2,
  Send,
  GraduationCap,
  Target,
  Lightbulb,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useStudentNames } from '@/lib/StudentNameContext';

interface GradeEntry {
  topic_name: string;
  grade: number;
  regents_score: number | null;
  nys_standard: string | null;
  created_at: string;
}

interface MisconceptionEntry {
  name: string;
  topic_name: string | null;
  severity: string | null;
  suggested_remedies: string[] | null;
}

interface StudentSyncData {
  student_id: string;
  first_name: string;
  last_name: string;
  student_name: string;
  student_email: string | null;
  class_id: string;
  class_name: string;
  overall_average: number;
  grades: GradeEntry[];
  misconceptions: MisconceptionEntry[];
  weak_topics: { topic_name: string; avg_score: number }[];
  remediation_recommendations: string[];
  xp_potential: number;
  coin_potential: number;
}

interface ScholarSyncDataDetailsProps {
  classId?: string;
}

export function ScholarSyncDataDetails({ classId }: ScholarSyncDataDetailsProps) {
  const { user } = useAuth();
  const { getDisplayName } = useStudentNames();
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['scholar-sync-data-details', user?.id, classId],
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
        return { students: [], totals: { students: 0, grades: 0, misconceptions: 0, weak_topics: 0, with_grades: 0 } };
      }

      const studentIds = students.map(s => s.id);

      // Fetch grades
      const { data: grades } = await supabase
        .from('grade_history')
        .select('student_id, topic_name, grade, regents_score, nys_standard, created_at')
        .in('student_id', studentIds)
        .eq('teacher_id', user!.id)
        .order('created_at', { ascending: false });

      // Fetch misconceptions
      const { data: analysisMisconceptions } = await supabase
        .from('analysis_misconceptions')
        .select('student_id, topic_name, misconception_text, severity, suggested_remedies')
        .in('student_id', studentIds)
        .eq('teacher_id', user!.id);

      // Build comprehensive data for each student
      const studentSyncData: StudentSyncData[] = [];
      let totalGrades = 0;
      let totalMisconceptions = 0;
      let totalWeakTopics = 0;
      let studentsWithGrades = 0;

      for (const student of students) {
        const studentGrades = (grades || []).filter(g => g.student_id === student.id);
        const studentMisconceptions = (analysisMisconceptions || []).filter(m => m.student_id === student.id);

        if (studentGrades.length > 0) {
          studentsWithGrades++;
        }

        totalGrades += studentGrades.length;
        totalMisconceptions += studentMisconceptions.length;

        // Calculate average
        const avgGrade = studentGrades.length > 0
          ? Math.round(studentGrades.reduce((sum, g) => sum + g.grade, 0) / studentGrades.length)
          : 0;

        // Calculate weak topics (avg < 70%)
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

        // Build remediation recommendations
        const remediationRecommendations: string[] = [];
        for (const wt of weakTopics.slice(0, 5)) {
          remediationRecommendations.push(`Practice: ${wt.topic_name} (current: ${wt.avg_score}%)`);
        }
        for (const m of studentMisconceptions.slice(0, 3)) {
          if (m.topic_name && !remediationRecommendations.some(r => r.includes(m.topic_name!))) {
            remediationRecommendations.push(`Address misconception: ${m.misconception_text} in ${m.topic_name}`);
          }
        }

        // Calculate XP/coin potential
        const improvementPotential = Math.max(0, 100 - avgGrade);
        const xpPotential = Math.round(improvementPotential * 2);
        const coinPotential = Math.round(improvementPotential);

        const classData = student.classes as any;
        studentSyncData.push({
          student_id: student.id,
          first_name: student.first_name,
          last_name: student.last_name,
          student_name: '', // Will be computed via pseudonym at render time
          student_email: student.email,
          class_id: student.class_id,
          class_name: classData?.name || 'Unknown',
          overall_average: avgGrade,
          grades: studentGrades.map(g => ({
            topic_name: g.topic_name,
            grade: g.grade,
            regents_score: g.regents_score,
            nys_standard: g.nys_standard,
            created_at: g.created_at,
          })),
          misconceptions: studentMisconceptions.map(m => ({
            name: m.misconception_text,
            topic_name: m.topic_name,
            severity: m.severity,
            suggested_remedies: m.suggested_remedies,
          })),
          weak_topics: weakTopics,
          remediation_recommendations: remediationRecommendations,
          xp_potential: xpPotential,
          coin_potential: coinPotential,
        });
      }

      // Sort by most grades first
      studentSyncData.sort((a, b) => b.grades.length - a.grades.length);

      return {
        students: studentSyncData,
        totals: {
          students: studentSyncData.length,
          grades: totalGrades,
          misconceptions: totalMisconceptions,
          weak_topics: totalWeakTopics,
          with_grades: studentsWithGrades,
        },
      };
    },
    enabled: !!user,
  });

  const filteredStudents = useMemo(() => {
    if (!data?.students) return [];
    if (!searchTerm.trim()) return data.students;
    
    const term = searchTerm.toLowerCase();
    return data.students.filter(s => {
      const displayName = getDisplayName(s.student_id, s.first_name, s.last_name);
      return displayName.toLowerCase().includes(term) ||
        s.class_name.toLowerCase().includes(term) ||
        s.grades.some(g => g.topic_name.toLowerCase().includes(term));
    });
  }, [data?.students, searchTerm, getDisplayName]);

  const toggleStudentSelection = (studentId: string) => {
    const newSelected = new Set(selectedStudents);
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId);
    } else {
      newSelected.add(studentId);
    }
    setSelectedStudents(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedStudents.size === filteredStudents.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(filteredStudents.map(s => s.student_id)));
    }
  };

  const handleSyncSelected = async () => {
    if (selectedStudents.size === 0) {
      toast.error('No students selected', { description: 'Select at least one student to sync' });
      return;
    }

    setIsSyncing(true);
    try {
      const response = await supabase.functions.invoke('sync-grades-to-scholar', {
        body: { student_ids: Array.from(selectedStudents) },
      });

      if (response.error) throw new Error(response.error.message);

      const data = response.data;
      if (data && !data.success) {
        toast.error(data.error || 'Sync failed');
        return;
      }

      toast.success(`Synced ${data?.synced_students || selectedStudents.size} students to Scholar AI`);
      setSelectedStudents(new Set());
    } catch (err) {
      console.error('Sync error:', err);
      toast.error('Failed to sync selected students');
    } finally {
      setIsSyncing(false);
    }
  };

  const getSeverityColor = (severity: string | null) => {
    switch (severity) {
      case 'high': return 'text-red-600 bg-red-500/10 border-red-500/20';
      case 'medium': return 'text-amber-600 bg-amber-500/10 border-amber-500/20';
      case 'low': return 'text-blue-600 bg-blue-500/10 border-blue-500/20';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  const getGradeColor = (grade: number) => {
    if (grade >= 85) return 'text-emerald-600';
    if (grade >= 70) return 'text-amber-600';
    return 'text-red-600';
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                <CardTitle className="flex items-center gap-2">
                  Sync Data Details
                  <Badge variant="secondary" className="ml-2">
                    {data?.totals.with_grades || 0} students with data
                  </Badge>
                </CardTitle>
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
            <CardDescription>
              Detailed view of all student data being sent to Scholar AI for remediation
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-6">
            {/* Summary Stats */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-xl font-bold">{data?.totals.students || 0}</span>
                </div>
                <p className="text-xs text-muted-foreground">Total Students</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <GraduationCap className="h-4 w-4 text-emerald-600" />
                  <span className="text-xl font-bold">{data?.totals.with_grades || 0}</span>
                </div>
                <p className="text-xs text-muted-foreground">With Grades</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <span className="text-xl font-bold">{data?.totals.grades || 0}</span>
                </div>
                <p className="text-xs text-muted-foreground">Grade Entries</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-xl font-bold">{data?.totals.misconceptions || 0}</span>
                </div>
                <p className="text-xs text-muted-foreground">Misconceptions</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <TrendingDown className="h-4 w-4 text-red-600" />
                  <span className="text-xl font-bold">{data?.totals.weak_topics || 0}</span>
                </div>
                <p className="text-xs text-muted-foreground">Weak Topics</p>
              </div>
            </div>

            {/* Search and Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search students, classes, or topics..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleSelectAll}
                  className="whitespace-nowrap"
                >
                  {selectedStudents.size === filteredStudents.length && filteredStudents.length > 0 
                    ? 'Deselect All' 
                    : 'Select All'}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSyncSelected}
                  disabled={selectedStudents.size === 0 || isSyncing}
                  className="whitespace-nowrap"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Syncing...' : `Sync Selected (${selectedStudents.size})`}
                </Button>
              </div>
            </div>

            {/* Student List */}
            {filteredStudents.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground">
                  {searchTerm ? 'No students match your search' : 'No students found'}
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[500px]">
                <div className="space-y-2 pr-4">
                  {filteredStudents.map((student) => (
                    <Collapsible
                      key={student.student_id}
                      open={expandedStudent === student.student_id}
                      onOpenChange={(open) => setExpandedStudent(open ? student.student_id : null)}
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={selectedStudents.has(student.student_id)}
                          onCheckedChange={() => toggleStudentSelection(student.student_id)}
                          onClick={(e) => e.stopPropagation()}
                          className="data-[state=checked]:bg-primary"
                        />
                        <CollapsibleTrigger asChild>
                          <div className="flex-1 flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors">
                            <div className="flex items-center gap-3">
                              {expandedStudent === student.student_id ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                              <div>
                                <p className="font-medium">{getDisplayName(student.student_id, student.first_name, student.last_name)}</p>
                              <p className="text-xs text-muted-foreground">{student.class_name}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className={`font-semibold ${getGradeColor(student.overall_average)}`}>
                                {student.overall_average}%
                              </p>
                              <p className="text-xs text-muted-foreground">Average</p>
                            </div>
                            <div className="flex gap-2">
                              <Badge variant="outline" className="text-xs">
                                <FileText className="h-3 w-3 mr-1" />
                                {student.grades.length}
                              </Badge>
                              {student.misconceptions.length > 0 && (
                                <Badge variant="secondary" className="text-xs bg-amber-500/10 text-amber-600">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  {student.misconceptions.length}
                                </Badge>
                              )}
                              {student.weak_topics.length > 0 && (
                                <Badge variant="secondary" className="text-xs bg-red-500/10 text-red-600">
                                  <TrendingDown className="h-3 w-3 mr-1" />
                                  {student.weak_topics.length}
                                </Badge>
                              )}
                            </div>
                              <Badge variant="outline" className="text-xs">
                                {student.xp_potential} XP / {student.coin_potential} 🪙
                              </Badge>
                            </div>
                          </div>
                        </CollapsibleTrigger>
                      </div>

                      <CollapsibleContent>
                        <div className="ml-8 mt-2 space-y-4 pb-4">
                          {/* Grades Table */}
                          {student.grades.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                                <GraduationCap className="h-4 w-4 text-emerald-600" />
                                Grade Entries ({student.grades.length})
                              </h4>
                              <div className="border rounded-lg overflow-hidden">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="bg-muted/50">
                                      <TableHead className="text-xs">Topic</TableHead>
                                      <TableHead className="text-xs">Grade</TableHead>
                                      <TableHead className="text-xs">Regents</TableHead>
                                      <TableHead className="text-xs">Standard</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {student.grades.slice(0, 10).map((grade, idx) => (
                                      <TableRow key={idx}>
                                        <TableCell className="text-xs py-2">{grade.topic_name}</TableCell>
                                        <TableCell className={`text-xs py-2 font-medium ${getGradeColor(grade.grade)}`}>
                                          {grade.grade}%
                                        </TableCell>
                                        <TableCell className="text-xs py-2">
                                          {grade.regents_score !== null ? `${grade.regents_score}/6` : '-'}
                                        </TableCell>
                                        <TableCell className="text-xs py-2">
                                          {grade.nys_standard ? (
                                            <Badge variant="outline" className="text-xs">{grade.nys_standard}</Badge>
                                          ) : '-'}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                                {student.grades.length > 10 && (
                                  <p className="text-xs text-muted-foreground p-2 text-center border-t">
                                    + {student.grades.length - 10} more grades
                                  </p>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Weak Topics */}
                          {student.weak_topics.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                                <TrendingDown className="h-4 w-4 text-red-600" />
                                Weak Topics ({student.weak_topics.length})
                              </h4>
                              <div className="flex flex-wrap gap-2">
                                {student.weak_topics.map((wt, idx) => (
                                  <Badge key={idx} variant="secondary" className="text-xs bg-red-500/10 text-red-600 border-red-500/20">
                                    {wt.topic_name}: {wt.avg_score}%
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Misconceptions */}
                          {student.misconceptions.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                                <AlertTriangle className="h-4 w-4 text-amber-600" />
                                Misconceptions ({student.misconceptions.length})
                              </h4>
                              <div className="space-y-2">
                                {student.misconceptions.map((m, idx) => (
                                  <div key={idx} className="p-2 rounded-lg border bg-muted/30">
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="text-sm">{m.name}</p>
                                      {m.severity && (
                                        <Badge className={`text-xs ${getSeverityColor(m.severity)}`}>
                                          {m.severity}
                                        </Badge>
                                      )}
                                    </div>
                                    {m.topic_name && (
                                      <p className="text-xs text-muted-foreground mt-1">Topic: {m.topic_name}</p>
                                    )}
                                    {m.suggested_remedies && m.suggested_remedies.length > 0 && (
                                      <div className="mt-2">
                                        <p className="text-xs font-medium text-muted-foreground">Suggested Remedies:</p>
                                        <ul className="text-xs text-muted-foreground list-disc list-inside">
                                          {m.suggested_remedies.slice(0, 3).map((r, ri) => (
                                            <li key={ri}>{r}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Remediation Recommendations */}
                          {student.remediation_recommendations.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                                <Lightbulb className="h-4 w-4 text-primary" />
                                Remediation Sent to Scholar ({student.remediation_recommendations.length})
                              </h4>
                              <div className="space-y-1">
                                {student.remediation_recommendations.map((r, idx) => (
                                  <div key={idx} className="flex items-center gap-2 text-sm">
                                    <CheckCircle2 className="h-3 w-3 text-emerald-600 flex-shrink-0" />
                                    <span>{r}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* No Data Message */}
                          {student.grades.length === 0 && student.misconceptions.length === 0 && (
                            <div className="text-center py-4 text-muted-foreground">
                              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              <p className="text-sm">No assessed work for this student yet</p>
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              </ScrollArea>
            )}

            {/* Data Being Sent Note */}
            <div className="p-4 rounded-lg border bg-muted/30">
              <div className="flex items-start gap-3">
                <Send className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-medium text-sm">Data Sent to Scholar AI</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    When you sync, Scholar receives: student identifiers, grades with topics and standards, 
                    misconceptions with severity levels, weak topics needing remediation, and personalized practice recommendations.
                    Scholar uses this to auto-assign targeted practice and award XP/coins for improvement.
                    Student names and emails are protected by FERPA pseudonyms in this view.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
