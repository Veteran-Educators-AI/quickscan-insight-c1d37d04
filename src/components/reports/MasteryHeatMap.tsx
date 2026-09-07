import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { FileText } from 'lucide-react';
import { StudentReportDialog } from './StudentReportDialog';

export interface TopicMastery {
  topicId: string;
  topicName: string;
  totalAttempts: number;
  correctPercentage: number; // 0-100
  avgScore: number; // 0-100
}

export interface StudentMastery {
  studentId: string;
  /** Display name — already pseudonymised unless the teacher revealed real names. */
  studentName: string;
  /** Raw roster name, for exports that legitimately require legal names. */
  realName?: string;
  topics: TopicMastery[];
  overallMastery: number; // 0-100
}

interface MasteryHeatMapProps {
  data: StudentMastery[];
  topics: { id: string; name: string }[];
  title?: string;
  description?: string;
  showStudentNames?: boolean;
}

function getMasteryColor(percentage: number): string {
  if (percentage >= 90) return 'bg-emerald-500';
  if (percentage >= 80) return 'bg-emerald-400';
  if (percentage >= 70) return 'bg-lime-400';
  if (percentage >= 60) return 'bg-yellow-400';
  if (percentage >= 50) return 'bg-orange-400';
  if (percentage >= 40) return 'bg-orange-500';
  if (percentage > 0) return 'bg-red-500';
  return 'bg-muted';
}

function getMasteryLabel(percentage: number): string {
  if (percentage >= 90) return 'Excellent';
  if (percentage >= 80) return 'Strong';
  if (percentage >= 70) return 'Proficient';
  if (percentage >= 60) return 'Developing';
  if (percentage >= 50) return 'Emerging';
  if (percentage > 0) return 'Needs Support';
  return 'No Data';
}

export function MasteryHeatMap({
  data,
  topics,
  title = "Mastery Heat Map",
  description = "Student performance by topic",
  showStudentNames = true,
}: MasteryHeatMapProps) {
  const [selectedStudentForReport, setSelectedStudentForReport] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const sortedTopics = useMemo(() => {
    return [...topics].sort((a, b) => a.name.localeCompare(b.name));
  }, [topics]);

  const sortedStudents = useMemo(() => {
    return [...data].sort((a, b) => a.studentName.localeCompare(b.studentName));
  }, [data]);

  // Calculate class averages per topic
  const topicAverages = useMemo(() => {
    const averages: Record<string, { total: number; count: number }> = {};
    
    data.forEach(student => {
      student.topics.forEach(topic => {
        if (!averages[topic.topicId]) {
          averages[topic.topicId] = { total: 0, count: 0 };
        }
        if (topic.totalAttempts > 0) {
          averages[topic.topicId].total += topic.avgScore;
          averages[topic.topicId].count += 1;
        }
      });
    });

    return Object.fromEntries(
      Object.entries(averages).map(([id, { total, count }]) => [
        id,
        count > 0 ? Math.round(total / count) : 0,
      ])
    );
  }, [data]);

  if (data.length === 0 || topics.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="text-center py-8 text-muted-foreground">
          No mastery data available yet. Scan and grade student work to see the heat map.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 mb-6 text-sm">
          <span className="text-muted-foreground font-medium">Legend:</span>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-emerald-500" />
            <span>90%+</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-emerald-400" />
            <span>80-89%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-lime-400" />
            <span>70-79%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-yellow-400" />
            <span>60-69%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-orange-400" />
            <span>50-59%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-red-500" />
            <span>&lt;50%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-muted border" />
            <span>No Data</span>
          </div>
        </div>

        {/* Heat Map Grid */}
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            {/* Topic Headers */}
            <div className="flex">
              <div className="w-32 shrink-0" /> {/* Spacer for student names */}
              {sortedTopics.map((topic) => (
                <div
                  key={topic.id}
                  className="w-16 shrink-0 px-1"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-xs font-medium text-center truncate cursor-help -rotate-45 origin-left translate-y-8 whitespace-nowrap">
                        {topic.name}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">{topic.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Class Average: {topicAverages[topic.id] || 0}%
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              ))}
              <div className="w-16 shrink-0 px-1">
                <div className="text-xs font-medium text-center -rotate-45 origin-left translate-y-8 whitespace-nowrap text-primary">
                  Overall
                </div>
              </div>
            </div>

            {/* Add spacing for rotated headers */}
            <div className="h-12" />

            {/* Student Rows */}
            <div className="space-y-1">
              {sortedStudents.map((student) => (
                <div key={student.studentId} className="flex items-center">
                  <div className="w-32 shrink-0 pr-2">
                    <button
                      className="text-sm font-medium truncate block hover:text-primary hover:underline cursor-pointer text-left flex items-center gap-1"
                      onClick={() => setSelectedStudentForReport({
                        id: student.studentId,
                        name: student.studentName
                      })}
                    >
                      <FileText className="h-3 w-3 opacity-50 shrink-0" />
                      <span className="truncate">
                        {showStudentNames ? student.studentName : `Student ${student.studentId.slice(0, 4)}`}
                      </span>
                    </button>
                  </div>
                  {sortedTopics.map((topic) => {
                    const topicData = student.topics.find(t => t.topicId === topic.id);
                    const mastery = topicData?.avgScore ?? 0;
                    const attempts = topicData?.totalAttempts ?? 0;

                    return (
                      <div key={topic.id} className="w-16 shrink-0 px-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                "w-full h-8 rounded transition-all hover:scale-110 hover:shadow-md cursor-pointer",
                                getMasteryColor(attempts > 0 ? mastery : -1)
                              )}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="space-y-1">
                              <p className="font-medium">{student.studentName}</p>
                              <p className="text-xs">{topic.name}</p>
                              <div className="border-t pt-1 mt-1">
                                <p className="text-sm">
                                  {attempts > 0 ? (
                                    <>
                                      <span className="font-medium">{mastery}%</span>
                                      <span className="text-muted-foreground ml-1">
                                        ({getMasteryLabel(mastery)})
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground">No attempts</span>
                                  )}
                                </p>
                                {attempts > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    {attempts} attempt{attempts !== 1 ? 's' : ''}
                                  </p>
                                )}
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    );
                  })}
                  {/* Overall mastery cell */}
                  <div className="w-16 shrink-0 px-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "w-full h-8 rounded transition-all hover:scale-110 hover:shadow-md cursor-pointer border-2 border-primary/20",
                            getMasteryColor(student.overallMastery)
                          )}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-medium">{student.studentName}</p>
                        <p className="text-sm">
                          Overall: <span className="font-medium">{student.overallMastery}%</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {getMasteryLabel(student.overallMastery)}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>

            {/* Class Average Row */}
            <div className="flex items-center mt-4 pt-4 border-t">
              <div className="w-32 shrink-0 pr-2">
                <span className="text-sm font-bold text-primary">Class Average</span>
              </div>
              {sortedTopics.map((topic) => {
                const avg = topicAverages[topic.id] || 0;
                return (
                  <div key={topic.id} className="w-16 shrink-0 px-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "w-full h-8 rounded transition-all hover:scale-110 hover:shadow-md cursor-pointer border-2 border-dashed border-primary/30",
                            getMasteryColor(avg)
                          )}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-medium">{topic.name}</p>
                        <p className="text-sm">
                          Class Average: <span className="font-medium">{avg}%</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {getMasteryLabel(avg)}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                );
              })}
              <div className="w-16 shrink-0" /> {/* Empty overall cell for class row */}
            </div>
          </div>
        </div>
      </CardContent>

      {/* Student Report Dialog */}
      <StudentReportDialog
        open={!!selectedStudentForReport}
        onOpenChange={(open) => !open && setSelectedStudentForReport(null)}
        studentId={selectedStudentForReport?.id || ''}
        studentName={selectedStudentForReport?.name || ''}
      />
    </Card>
  );
}
