import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, Users, BookOpen, Share2, Loader2, Check, FileText, AlertTriangle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { MasteryHeatMap } from '@/components/reports/MasteryHeatMap';
import { TopicStrengthsChart } from '@/components/reports/TopicStrengthsChart';
import { DifferentiationGrouping } from '@/components/reports/DifferentiationGrouping';
import { EmailResponsesReport } from '@/components/reports/EmailResponsesReport';
import { ScanAnalysisHistory } from '@/components/reports/ScanAnalysisHistory';
import { DiagnosticDashboard } from '@/components/reports/DiagnosticDashboard';
import { DiagnosticGapsSummary } from '@/components/reports/DiagnosticGapsSummary';
import { StudentProgressTracker } from '@/components/reports/StudentProgressTracker';
import { LevelProgressionChart } from '@/components/reports/LevelProgressionChart';
import { RegentsScoreReport } from '@/components/reports/RegentsScoreReport';
import { Gradebook } from '@/components/reports/Gradebook';
import { ScholarSyncDashboard } from '@/components/reports/ScholarSyncDashboard';
import { ScholarSyncDataDetails } from '@/components/reports/ScholarSyncDataDetails';
import { InboundScholarDataPanel } from '@/components/reports/InboundScholarDataPanel';
import { ClassMisconceptionSummary } from '@/components/reports/ClassMisconceptionSummary';
import { StandardsByClass } from '@/components/reports/StandardsByClass';
import { AILearningHistory } from '@/components/reports/AILearningHistory';
import { AttendancePatternsReport } from '@/components/reports/AttendancePatternsReport';
import { FeatureUsageReport } from '@/components/reports/FeatureUsageReport';
import { WorksheetSubmissionsTracker } from '@/components/reports/WorksheetSubmissionsTracker';
import { TrainingConfidenceIndicator } from '@/components/scan/TrainingConfidenceIndicator';
import { useMasteryData } from '@/hooks/useMasteryData';
import { useGradeHistoryStats } from '@/hooks/useGradeHistoryStats';
import { toast } from 'sonner';

export default function Reports() {
  const { user } = useAuth();
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleExportToScanScholar = async () => {
    if (!user) return;
    
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (selectedClassId !== 'all') {
        params.set('class_id', selectedClassId);
      } else {
        params.set('teacher_id', user.id);
      }

      const { data, error } = await supabase.functions.invoke('get-student-analytics', {
        body: null,
        headers: {},
      });

      // If invoke doesn't work well, try direct fetch
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-student-analytics?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch analytics');
      }

      const analyticsData = await response.json();
      
      // Copy to clipboard as JSON
      await navigator.clipboard.writeText(JSON.stringify(analyticsData, null, 2));
      setCopied(true);
      toast.success('Analytics data copied to clipboard! Paste it into Scan Scholar to generate worksheets.');
      
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Failed to export analytics data');
    } finally {
      setIsExporting(false);
    }
  };

  // Fetch classes for filter
  const { data: classes } = useQuery({
    queryKey: ['classes', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name')
        .eq('teacher_id', user!.id)
        .is('archived_at', null)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Get mastery data
  const { students, topics, isLoading, error } = useMasteryData({
    classId: selectedClassId === 'all' ? undefined : selectedClassId,
  });

  // Get stats from grade_history (actual analyzed work)
  const { 
    totalStudents: gradeStudents, 
    classAverage: gradeAverage, 
    topicsTracked,
    totalEntries,
    isLoading: statsLoading 
  } = useGradeHistoryStats(selectedClassId === 'all' ? undefined : selectedClassId);

  // Use grade_history stats as primary, fallback to mastery data
  const displayStudents = gradeStudents || students.length;
  const displayAverage = gradeAverage || 0;
  const displayTopics = topicsTracked || topics.length;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold">Reports</h1>
            <p className="text-muted-foreground">View student performance and analytics</p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleExportToScanScholar}
              disabled={isExporting || students.length === 0}
            >
              {isExporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : copied ? (
                <Check className="mr-2 h-4 w-4 text-green-500" />
              ) : (
                <Share2 className="mr-2 h-4 w-4" />
              )}
              {copied ? 'Copied!' : 'Export to Scan Scholar'}
            </Button>

            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes?.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading || statsLoading ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
            <Skeleton className="h-96" />
          </div>
        ) : error ? (
          <Card className="text-center py-12">
            <CardContent>
              <p className="text-destructive">Error loading data: {error.message}</p>
            </CardContent>
          </Card>
        ) : students.length === 0 && totalEntries === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="font-medium text-lg mb-2">No data yet</h3>
              <p className="text-muted-foreground">
                Add students and scan their work to see analytics and reports
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Summary Stats */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-primary/10">
                      <Users className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{displayStudents}</p>
                      <p className="text-sm text-muted-foreground">Students with Data</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-emerald-500/10">
                      <BarChart3 className="h-6 w-6 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{displayAverage}%</p>
                      <p className="text-sm text-muted-foreground">Class Average</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-blue-500/10">
                      <BookOpen className="h-6 w-6 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{displayTopics}</p>
                      <p className="text-sm text-muted-foreground">Topics Tracked</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-purple-500/10">
                      <FileText className="h-6 w-6 text-purple-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{totalEntries}</p>
                      <p className="text-sm text-muted-foreground">Work Analyzed</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Inbound Scholar Data - Data returned FROM scholar app */}
            <InboundScholarDataPanel classId={selectedClassId === 'all' ? undefined : selectedClassId} />

            {/* Scholar AI Sync Dashboard - Outbound */}
            <ScholarSyncDashboard classId={selectedClassId === 'all' ? undefined : selectedClassId} />

            {/* Scholar Sync Data Details - What's Being Sent */}
            <ScholarSyncDataDetails classId={selectedClassId === 'all' ? undefined : selectedClassId} />

            {/* Standards by Class - Clickable to view all work */}
            <StandardsByClass classId={selectedClassId === 'all' ? undefined : selectedClassId} />

            {/* Strengths and Weaknesses */}
            <TopicStrengthsChart data={students} topics={topics} />

            {/* Worksheet Submissions Tracker */}
            <WorksheetSubmissionsTracker classId={selectedClassId === 'all' ? undefined : selectedClassId} />

            {/* Gradebook - All saved grades */}
            <Gradebook classId={selectedClassId === 'all' ? undefined : selectedClassId} />

            {/* Heat Map */}
            <MasteryHeatMap
              data={students}
              topics={topics}
              title="Student Mastery by Topic"
              description="Hover over cells to see detailed performance data"
            />

            {/* Diagnostic Dashboard */}
            <DiagnosticDashboard classId={selectedClassId === 'all' ? undefined : selectedClassId} />

            {/* Diagnostic Gaps Summary - Cross-class view */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <h3 className="font-semibold text-lg">Cross-Class Diagnostic Gaps</h3>
                </div>
                <DiagnosticGapsSummary />
              </CardContent>
            </Card>

            {/* AI Training Confidence - Full Card */}
            <TrainingConfidenceIndicator />

            {/* AI Learning History */}
            <AILearningHistory />

            {/* Class Misconception Summary */}
            <ClassMisconceptionSummary classId={selectedClassId === 'all' ? undefined : selectedClassId} />

            {/* Level Progression Chart */}
            <LevelProgressionChart classId={selectedClassId === 'all' ? undefined : selectedClassId} />

            {/* Student Progress Tracker */}
            <StudentProgressTracker classId={selectedClassId === 'all' ? undefined : selectedClassId} />

            {/* Attendance Patterns */}
            <AttendancePatternsReport classId={selectedClassId === 'all' ? undefined : selectedClassId} />

            {/* Regents Score Report */}
            <RegentsScoreReport classId={selectedClassId === 'all' ? undefined : selectedClassId} />




            {/* Scan Analysis History */}
            <ScanAnalysisHistory classId={selectedClassId === 'all' ? undefined : selectedClassId} />

            {/* Email Responses */}
            <EmailResponsesReport classId={selectedClassId === 'all' ? undefined : selectedClassId} />

            {/* Differentiation & Grouping */}
            <DifferentiationGrouping students={students} topics={topics} />

            {/* Feature Usage Tracking */}
            <FeatureUsageReport />
          </>
        )}
      </div>
    </AppLayout>
  );
}
