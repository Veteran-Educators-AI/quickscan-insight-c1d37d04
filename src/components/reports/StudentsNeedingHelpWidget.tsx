import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Minus,
  ChevronRight,
  User,
  BookOpen,
  Mail,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StudentReportDialog } from '@/components/reports/StudentReportDialog';
import { BatchRemediationEmailDialog } from '@/components/reports/BatchRemediationEmailDialog';
import { useStrugglingStudents } from '@/hooks/useStrugglingStudents';
import { useStudentNames } from '@/lib/StudentNameContext';
import { cn } from '@/lib/utils';

interface StudentsNeedingHelpWidgetProps {
  className?: string;
  limit?: number;
}

const LEVEL_THRESHOLDS = { A: 90, B: 80, C: 70, D: 60, E: 50, F: 0 };

function scoreToLevel(score: number): string {
  if (score >= LEVEL_THRESHOLDS.A) return 'A';
  if (score >= LEVEL_THRESHOLDS.B) return 'B';
  if (score >= LEVEL_THRESHOLDS.C) return 'C';
  if (score >= LEVEL_THRESHOLDS.D) return 'D';
  if (score >= LEVEL_THRESHOLDS.E) return 'E';
  return 'F';
}

export function StudentsNeedingHelpWidget({ className, limit = 5 }: StudentsNeedingHelpWidgetProps) {
  const [selectedStudent, setSelectedStudent] = useState<{ id: string; name: string } | null>(null);
  const [showBatchEmailDialog, setShowBatchEmailDialog] = useState(false);
  const { getDisplayName } = useStudentNames();

  // Use optimized hook - replaces multiple sequential queries with single RPC call
  const { data: strugglingStudents, isLoading } = useStrugglingStudents(limit);

  const getTrendIcon = (trend: 'improving' | 'stable' | 'declining') => {
    switch (trend) {
      case 'improving':
        return <TrendingUp className="h-3.5 w-3.5 text-success" />;
      case 'declining':
        return <TrendingDown className="h-3.5 w-3.5 text-destructive" />;
      default:
        return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const getLevelBadgeColor = (grade: number) => {
    const level = scoreToLevel(grade);
    switch (level) {
      case 'A': return 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20';
      case 'B': return 'bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20';
      case 'C': return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20';
      case 'D': return 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20';
      case 'E': return 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20';
      default: return 'bg-red-700/10 text-red-800 dark:text-red-300 border-red-700/20';
    }
  };

  return (
    <>
      <Card className={cn("animate-slide-up", className)}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-destructive/10 text-destructive">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-lg">Students Needing Help</CardTitle>
              <CardDescription>Top {limit} struggling students across all classes</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {strugglingStudents && strugglingStudents.length > 0 && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowBatchEmailDialog(true);
                }}
                className="gap-1"
              >
                <Mail className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Email All</span>
              </Button>
            )}
            <Link to="/reports">
              <Button variant="ghost" size="sm">
                All Reports <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-6 w-12" />
                </div>
              ))}
            </div>
          ) : !strugglingStudents?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <User className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No struggling students found</p>
              <p className="text-sm">All students are performing at or above 70%</p>
            </div>
          ) : (
            <div className="space-y-2">
              {strugglingStudents.map((student, index) => (
                <div
                  key={student.id}
                  onClick={() => setSelectedStudent({ 
                    id: student.id, 
                    name: getDisplayName(student.id, student.firstName, student.lastName)
                  })}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer group"
                >
                  {/* Rank indicator */}
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive text-sm font-semibold">
                    {index + 1}
                  </div>

                  {/* Student info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">
                        {getDisplayName(student.id, student.firstName, student.lastName)}
                      </p>
                      {getTrendIcon(student.trend)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{student.className}</span>
                      {student.weakTopicCount > 0 && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <BookOpen className="h-3 w-3" />
                            {student.weakTopicCount} weak {student.weakTopicCount === 1 ? 'topic' : 'topics'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Grade badge */}
                  <Badge 
                    variant="outline" 
                    className={cn("shrink-0 font-semibold", getLevelBadgeColor(student.averageGrade))}
                  >
                    {student.averageGrade}%
                  </Badge>

                  {/* Arrow on hover */}
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Student Report Dialog */}
      {selectedStudent && (
        <StudentReportDialog
          open={!!selectedStudent}
          onOpenChange={(open) => !open && setSelectedStudent(null)}
          studentId={selectedStudent.id}
          studentName={selectedStudent.name}
        />
      )}

      {/* Batch Remediation Email Dialog */}
      {strugglingStudents && strugglingStudents.length > 0 && (
        <BatchRemediationEmailDialog
          open={showBatchEmailDialog}
          onOpenChange={setShowBatchEmailDialog}
          students={strugglingStudents}
        />
      )}
    </>
  );
}
