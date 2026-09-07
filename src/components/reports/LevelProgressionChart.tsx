import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Legend, ReferenceLine } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO, startOfWeek, eachWeekOfInterval, subWeeks } from "date-fns";
import { useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useStudentNames } from '@/lib/StudentNameContext';

interface LevelProgressionChartProps {
  classId?: string;
  topicName?: string;
}

const LEVEL_VALUES: Record<string, number> = {
  'A': 6,
  'B': 5,
  'C': 4,
  'D': 3,
  'E': 2,
  'F': 1,
};

const VALUE_TO_LEVEL: Record<number, string> = {
  6: 'A',
  5: 'B',
  4: 'C',
  3: 'D',
  2: 'E',
  1: 'F',
};

const LEVEL_COLORS: Record<string, string> = {
  'A': 'hsl(142, 76%, 36%)',
  'B': 'hsl(142, 69%, 58%)',
  'C': 'hsl(48, 96%, 53%)',
  'D': 'hsl(32, 95%, 44%)',
  'E': 'hsl(0, 72%, 51%)',
  'F': 'hsl(0, 84%, 60%)',
};

const STUDENT_COLORS = [
  'hsl(217, 91%, 60%)',
  'hsl(142, 76%, 36%)',
  'hsl(262, 83%, 58%)',
  'hsl(32, 95%, 44%)',
  'hsl(340, 82%, 52%)',
  'hsl(189, 94%, 43%)',
  'hsl(48, 96%, 53%)',
  'hsl(280, 68%, 60%)',
];

export function LevelProgressionChart({ classId, topicName }: LevelProgressionChartProps) {
  const { getDisplayName } = useStudentNames();
  const { user } = useAuth();
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [timeRange, setTimeRange] = useState<'4w' | '8w' | '12w' | 'all'>('8w');

  const { data: diagnosticResults, isLoading } = useQuery({
    queryKey: ['level-progression', user?.id, classId, topicName],
    queryFn: async () => {
      let query = supabase
        .from('diagnostic_results')
        .select(`
          id,
          student_id,
          recommended_level,
          topic_name,
          created_at,
          students!inner(id, first_name, last_name, class_id)
        `)
        .eq('teacher_id', user?.id)
        .order('created_at', { ascending: true });

      if (classId) {
        query = query.eq('students.class_id', classId);
      }
      if (topicName) {
        query = query.eq('topic_name', topicName);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { students, chartData, studentStats } = useMemo(() => {
    if (!diagnosticResults || diagnosticResults.length === 0) {
      return { students: [], chartData: [], studentStats: {} };
    }

    // Get unique students
    const studentMap = new Map<string, { id: string; name: string }>();
    diagnosticResults.forEach((result: any) => {
      if (result.students) {
        studentMap.set(result.student_id, {
          id: result.student_id,
          name: getDisplayName(result.student_id, result.students.first_name, result.students.last_name),
        });
      }
    });
    const studentsList = Array.from(studentMap.values());

    // Determine date range
    const now = new Date();
    let startDate: Date;
    switch (timeRange) {
      case '4w':
        startDate = subWeeks(now, 4);
        break;
      case '8w':
        startDate = subWeeks(now, 8);
        break;
      case '12w':
        startDate = subWeeks(now, 12);
        break;
      default:
        const dates = diagnosticResults.map((r: any) => new Date(r.created_at));
        startDate = new Date(Math.min(...dates.map(d => d.getTime())));
    }

    // Generate weeks
    const weeks = eachWeekOfInterval({ start: startDate, end: now });

    // Build chart data by week
    const data = weeks.map(weekStart => {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const dataPoint: Record<string, any> = {
        week: format(weekStart, 'MMM d'),
        date: weekStart,
      };

      // For each student, find their level at end of this week
      studentsList.forEach(student => {
        const resultsUpToWeek = diagnosticResults
          .filter((r: any) => 
            r.student_id === student.id && 
            new Date(r.created_at) <= weekEnd
          )
          .sort((a: any, b: any) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );

        if (resultsUpToWeek.length > 0 && resultsUpToWeek[0].recommended_level) {
          dataPoint[student.id] = LEVEL_VALUES[resultsUpToWeek[0].recommended_level] || null;
        }
      });

      return dataPoint;
    });

    // Calculate student stats (trend)
    const stats: Record<string, { trend: 'up' | 'down' | 'stable'; change: number; currentLevel: string }> = {};
    studentsList.forEach(student => {
      const studentResults = diagnosticResults
        .filter((r: any) => r.student_id === student.id && r.recommended_level)
        .sort((a: any, b: any) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

      if (studentResults.length >= 2) {
        const firstLevel = LEVEL_VALUES[studentResults[0].recommended_level] || 0;
        const lastLevel = LEVEL_VALUES[studentResults[studentResults.length - 1].recommended_level] || 0;
        const change = lastLevel - firstLevel;
        stats[student.id] = {
          trend: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
          change: Math.abs(change),
          currentLevel: studentResults[studentResults.length - 1].recommended_level,
        };
      } else if (studentResults.length === 1) {
        stats[student.id] = {
          trend: 'stable',
          change: 0,
          currentLevel: studentResults[0].recommended_level,
        };
      }
    });

    return { students: studentsList, chartData: data, studentStats: stats };
  }, [diagnosticResults, timeRange]);

  const displayStudents = selectedStudents.length > 0 
    ? students.filter(s => selectedStudents.includes(s.id))
    : students.slice(0, 8);

  const chartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    displayStudents.forEach((student, index) => {
      config[student.id] = {
        label: student.name,
        color: STUDENT_COLORS[index % STUDENT_COLORS.length],
      };
    });
    return config;
  }, [displayStudents]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Level Progression</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!diagnosticResults || diagnosticResults.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Level Progression
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Track how students advance through mastery levels A-F over time based on diagnostic assessments.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[200px] text-muted-foreground">
            No diagnostic results available yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            Level Progression
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Track how students advance through mastery levels A-F over time. Level A represents full mastery, while Level F indicates foundational understanding needed.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <Select value={timeRange} onValueChange={(v: any) => setTimeRange(v)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="4w">4 Weeks</SelectItem>
              <SelectItem value="8w">8 Weeks</SelectItem>
              <SelectItem value="12w">12 Weeks</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {/* Level Legend */}
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(LEVEL_COLORS).map(([level, color]) => (
            <div key={level} className="flex items-center gap-1 text-xs">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: color }}
              />
              <span>Level {level}</span>
            </div>
          ))}
        </div>

        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <XAxis 
                dataKey="week" 
                tick={{ fontSize: 11 }}
                tickLine={false}
              />
              <YAxis 
                domain={[0.5, 6.5]}
                ticks={[1, 2, 3, 4, 5, 6]}
                tickFormatter={(value) => VALUE_TO_LEVEL[value] || ''}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip 
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => {
                      const level = VALUE_TO_LEVEL[value as number];
                      const student = students.find(s => s.id === name);
                      return level ? [`Level ${level}`, student?.name || name] : null;
                    }}
                  />
                }
              />
              {/* Reference lines for each level */}
              {[1, 2, 3, 4, 5, 6].map(value => (
                <ReferenceLine 
                  key={value} 
                  y={value} 
                  stroke="hsl(var(--border))" 
                  strokeDasharray="3 3" 
                  strokeOpacity={0.5}
                />
              ))}
              {displayStudents.map((student, index) => (
                <Line
                  key={student.id}
                  type="monotone"
                  dataKey={student.id}
                  stroke={STUDENT_COLORS[index % STUDENT_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  connectNulls
                />
              ))}
              <Legend 
                formatter={(value) => {
                  const student = students.find(s => s.id === value);
                  return student?.name || value;
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Student Progress Summary */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {displayStudents.map((student, index) => {
            const stat = studentStats[student.id];
            if (!stat) return null;

            return (
              <div 
                key={student.id}
                className="flex items-center gap-2 p-2 rounded-lg border bg-card"
              >
                <div 
                  className="w-2 h-8 rounded-full"
                  style={{ backgroundColor: STUDENT_COLORS[index % STUDENT_COLORS.length] }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{student.name}</div>
                  <div className="flex items-center gap-1">
                    <Badge 
                      variant="outline" 
                      className="text-xs px-1"
                      style={{ 
                        borderColor: LEVEL_COLORS[stat.currentLevel],
                        color: LEVEL_COLORS[stat.currentLevel],
                      }}
                    >
                      Level {stat.currentLevel}
                    </Badge>
                    {stat.trend === 'up' && (
                      <TrendingUp className="h-3 w-3 text-green-500" />
                    )}
                    {stat.trend === 'down' && (
                      <TrendingDown className="h-3 w-3 text-red-500" />
                    )}
                    {stat.trend === 'stable' && (
                      <Minus className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
