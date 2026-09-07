import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Users, BookOpen, Filter, Download, CheckCircle, XCircle, ChevronDown, ChevronRight, Loader2, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { useStudentNames } from '@/lib/StudentNameContext';

interface ClassWithStudents {
  id: string;
  name: string;
  students: {
    id: string;
    first_name: string;
    last_name: string;
    diagnosedTopics: string[];
  }[];
}

interface DiagnosticGap {
  classId: string;
  className: string;
  studentId: string;
  studentName: string;
  missingTopics: string[];
}

export function DiagnosticGapsSummary() {
  const { getDisplayName } = useStudentNames();
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  const [showOnlyMissing, setShowOnlyMissing] = useState(true);

  // Fetch all classes
  const { data: classes, isLoading: isLoadingClasses } = useQuery({
    queryKey: ['all-classes', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name')
        .eq('teacher_id', user?.id)
        .is('archived_at', null)
        .order('name');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Fetch all students across classes
  const { data: allStudents, isLoading: isLoadingStudents } = useQuery({
    queryKey: ['all-students-for-gaps', user?.id, classes?.map(c => c.id)],
    queryFn: async () => {
      if (!classes || classes.length === 0) return [];
      
      const classIds = classes.map(c => c.id);
      const { data, error } = await supabase
        .from('students')
        .select('id, first_name, last_name, class_id')
        .in('class_id', classIds)
        .order('last_name');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!classes && classes.length > 0,
  });

  // Fetch all diagnostic results
  const { data: diagnosticResults, isLoading: isLoadingDiagnostics } = useQuery({
    queryKey: ['all-diagnostics-for-gaps', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('diagnostic_results')
        .select('student_id, topic_name')
        .eq('teacher_id', user?.id);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Get unique topics from diagnostic results
  const availableTopics = useMemo(() => {
    if (!diagnosticResults) return [];
    const topics = [...new Set(diagnosticResults.map(d => d.topic_name))];
    return topics.sort();
  }, [diagnosticResults]);

  // Process data to find gaps
  const classesWithGaps = useMemo(() => {
    if (!classes || !allStudents || !diagnosticResults) return [];

    // Create a map of student -> diagnosed topics
    const studentDiagnostics = new Map<string, Set<string>>();
    diagnosticResults.forEach(d => {
      if (!studentDiagnostics.has(d.student_id)) {
        studentDiagnostics.set(d.student_id, new Set());
      }
      studentDiagnostics.get(d.student_id)!.add(d.topic_name);
    });

    // Topics to check against
    const topicsToCheck = selectedTopics.length > 0 ? selectedTopics : availableTopics;

    // Build class data with gap information
    return classes.map(cls => {
      const classStudents = allStudents.filter(s => s.class_id === cls.id);
      
      const studentsWithGaps = classStudents.map(student => {
        const diagnosedTopics = studentDiagnostics.get(student.id) || new Set();
        const missingTopics = topicsToCheck.filter(t => !diagnosedTopics.has(t));
        
        return {
          id: student.id,
          first_name: student.first_name,
          last_name: student.last_name,
          diagnosedTopics: Array.from(diagnosedTopics),
          missingTopics,
          completionRate: topicsToCheck.length > 0 
            ? ((topicsToCheck.length - missingTopics.length) / topicsToCheck.length) * 100 
            : 100,
        };
      });

      const studentsWithMissing = studentsWithGaps.filter(s => s.missingTopics.length > 0);
      const classCompletionRate = studentsWithGaps.length > 0
        ? studentsWithGaps.reduce((sum, s) => sum + s.completionRate, 0) / studentsWithGaps.length
        : 100;

      return {
        ...cls,
        students: studentsWithGaps,
        studentsWithMissing,
        totalStudents: classStudents.length,
        completionRate: classCompletionRate,
      };
    }).sort((a, b) => a.completionRate - b.completionRate); // Sort by completion rate (lowest first)
  }, [classes, allStudents, diagnosticResults, selectedTopics, availableTopics]);

  // Summary statistics
  const summary = useMemo(() => {
    if (!classesWithGaps.length) return null;

    const totalStudents = classesWithGaps.reduce((sum, c) => sum + c.totalStudents, 0);
    const studentsWithGaps = classesWithGaps.reduce((sum, c) => sum + c.studentsWithMissing.length, 0);
    const classesWithGapsCount = classesWithGaps.filter(c => c.studentsWithMissing.length > 0).length;
    const topicsToCheck = selectedTopics.length > 0 ? selectedTopics : availableTopics;
    
    // Find most common missing topic
    const topicMissingCounts = new Map<string, number>();
    classesWithGaps.forEach(cls => {
      cls.studentsWithMissing.forEach(student => {
        student.missingTopics.forEach(topic => {
          topicMissingCounts.set(topic, (topicMissingCounts.get(topic) || 0) + 1);
        });
      });
    });
    
    const mostMissingTopic = Array.from(topicMissingCounts.entries())
      .sort((a, b) => b[1] - a[1])[0];

    return {
      totalStudents,
      studentsWithGaps,
      classesWithGaps: classesWithGapsCount,
      totalClasses: classesWithGaps.length,
      topicsChecked: topicsToCheck.length,
      mostMissingTopic: mostMissingTopic ? { topic: mostMissingTopic[0], count: mostMissingTopic[1] } : null,
    };
  }, [classesWithGaps, selectedTopics, availableTopics]);

  const toggleClass = (classId: string) => {
    setExpandedClasses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(classId)) {
        newSet.delete(classId);
      } else {
        newSet.add(classId);
      }
      return newSet;
    });
  };

  const toggleTopic = (topic: string) => {
    setSelectedTopics(prev => 
      prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
    );
  };

  const exportToCSV = () => {
    if (!classesWithGaps.length) return;

    const topicsToCheck = selectedTopics.length > 0 ? selectedTopics : availableTopics;
    const headers = ['Class', 'Student', ...topicsToCheck.map(t => `${t} (Diagnosed)`)];
    
    const rows = classesWithGaps.flatMap(cls =>
      cls.students.map(student => [
        cls.name,
        getDisplayName(student.id, student.first_name, student.last_name),
        ...topicsToCheck.map(topic => 
          student.diagnosedTopics.includes(topic) ? 'Yes' : 'No'
        ),
      ])
    );

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagnostic-gaps-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: 'Export complete',
      description: 'Diagnostic gaps report downloaded as CSV.',
    });
  };

  const isLoading = isLoadingClasses || isLoadingStudents || isLoadingDiagnostics;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!classes?.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">No classes found.</p>
          <p className="text-sm text-muted-foreground mt-1">Create a class to start tracking diagnostic gaps.</p>
        </CardContent>
      </Card>
    );
  }

  if (!availableTopics.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <BookOpen className="h-12 w-12 text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">No diagnostic data found.</p>
          <p className="text-sm text-muted-foreground mt-1">Run diagnostics to start tracking student progress.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="text-2xl font-bold text-amber-900">{summary.studentsWithGaps}</p>
                  <p className="text-xs text-amber-700">Students with gaps</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold text-blue-900">{summary.totalStudents}</p>
                  <p className="text-xs text-blue-700">Total students</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="text-2xl font-bold text-purple-900">{summary.topicsChecked}</p>
                  <p className="text-xs text-purple-700">Topics tracked</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-50 to-rose-50 border-red-200">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-red-600" />
                <div>
                  <p className="text-2xl font-bold text-red-900">{summary.classesWithGaps}</p>
                  <p className="text-xs text-red-700">Classes with gaps</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Most Missing Topic Alert */}
      {summary?.mostMissingTopic && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-900">
                  Most common gap: <span className="font-bold">{summary.mostMissingTopic.topic}</span>
                </p>
                <p className="text-xs text-amber-700">
                  {summary.mostMissingTopic.count} student(s) haven't been diagnosed on this topic
                </p>
              </div>
              <Button size="sm" variant="outline" className="border-amber-400 text-amber-700 hover:bg-amber-100">
                Create Diagnostic
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Filter by Topics</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="showOnlyMissing" 
                  checked={showOnlyMissing}
                  onCheckedChange={(checked) => setShowOnlyMissing(checked === true)}
                />
                <label htmlFor="showOnlyMissing" className="text-sm text-muted-foreground cursor-pointer">
                  Only show students with gaps
                </label>
              </div>
              <Button variant="outline" size="sm" onClick={exportToCSV}>
                <Download className="h-4 w-4 mr-1" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[120px]">
            <div className="flex flex-wrap gap-2">
              {availableTopics.map(topic => (
                <Badge
                  key={topic}
                  variant={selectedTopics.includes(topic) ? 'default' : 'outline'}
                  className="cursor-pointer hover:bg-primary/20 transition-colors"
                  onClick={() => toggleTopic(topic)}
                >
                  {topic}
                  {selectedTopics.includes(topic) && (
                    <XCircle className="h-3 w-3 ml-1" />
                  )}
                </Badge>
              ))}
            </div>
          </ScrollArea>
          {selectedTopics.length > 0 && (
            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Showing gaps for {selectedTopics.length} selected topic(s)
              </p>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 text-xs"
                onClick={() => setSelectedTopics([])}
              >
                Clear filter
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Classes with Gaps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Diagnostic Gaps by Class
          </CardTitle>
          <CardDescription>
            Click on a class to see individual student gaps
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-2">
              {classesWithGaps.map(cls => {
                const isExpanded = expandedClasses.has(cls.id);
                const studentsToShow = showOnlyMissing ? cls.studentsWithMissing : cls.students;
                const hasGaps = cls.studentsWithMissing.length > 0;

                return (
                  <Collapsible key={cls.id} open={isExpanded} onOpenChange={() => toggleClass(cls.id)}>
                    <CollapsibleTrigger className="w-full">
                      <div className={`flex items-center justify-between p-3 rounded-lg border transition-colors hover:bg-muted/50 ${
                        hasGaps ? 'border-amber-200 bg-amber-50/50' : 'border-green-200 bg-green-50/50'
                      }`}>
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <div className="text-left">
                            <p className="font-medium text-sm">{cls.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {cls.totalStudents} students • {cls.studentsWithMissing.length} with gaps
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-24">
                            <Progress 
                              value={cls.completionRate} 
                              className={`h-2 ${hasGaps ? '[&>div]:bg-amber-500' : '[&>div]:bg-green-500'}`}
                            />
                          </div>
                          <Badge variant={hasGaps ? 'secondary' : 'default'} className={hasGaps ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}>
                            {Math.round(cls.completionRate)}%
                          </Badge>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="ml-6 mt-2 space-y-1 pb-2">
                        {studentsToShow.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-2 text-center">
                            {showOnlyMissing ? 'All students have been diagnosed on selected topics!' : 'No students in this class.'}
                          </p>
                        ) : (
                          studentsToShow.map(student => (
                            <div 
                              key={student.id}
                              className={`flex items-center justify-between p-2 rounded border text-sm ${
                                student.missingTopics.length > 0 
                                  ? 'bg-red-50/50 border-red-200' 
                                  : 'bg-green-50/50 border-green-200'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                {student.missingTopics.length > 0 ? (
                                  <XCircle className="h-4 w-4 text-red-500" />
                                ) : (
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                )}
                                <span>{getDisplayName(student.id, student.first_name, student.last_name)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {student.missingTopics.length > 0 ? (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300 text-xs">
                                          Missing {student.missingTopics.length} topic(s)
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs">
                                        <p className="text-xs font-medium mb-1">Missing diagnostics:</p>
                                        <ul className="text-xs space-y-0.5">
                                          {student.missingTopics.map(topic => (
                                            <li key={topic}>• {topic}</li>
                                          ))}
                                        </ul>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : (
                                  <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300 text-xs">
                                    Complete
                                  </Badge>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// Dialog wrapper for easy access from other pages
export function DiagnosticGapsDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <AlertTriangle className="h-4 w-4" />
          View Diagnostic Gaps
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Cross-Class Diagnostic Gaps
          </DialogTitle>
          <DialogDescription>
            View which students across all your classes are missing diagnostic data for specific topics.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 -mx-6 px-6">
          <DiagnosticGapsSummary />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
