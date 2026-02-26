import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Cloud, 
  CloudOff, 
  CheckCircle2, 
  XCircle, 
  ChevronDown, 
  Users, 
  AlertTriangle,
  BookOpen,
  TrendingUp,
  RefreshCw,
  Clock,
  Eye,
  Download
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { ScholarSyncPreviewDialog } from './ScholarSyncPreviewDialog';

interface SyncLogData {
  total_students?: number;
  total_grades?: number;
  total_misconceptions?: number;
  weak_topics_identified?: number;
  class_id?: string;
  // Handle sync_results format from individual_sync
  sync_results?: {
    successful?: number;
    failed?: number;
    errors?: string[];
  };
  // Handle nested summary format from nycologic_ai
  summary?: {
    total_students?: number;
    total_grades?: number;
    total_misconceptions?: number;
    weak_topics_identified?: number;
  };
  response?: {
    success?: boolean;
    message?: string;
    processed?: {
      students_processed?: number;
      students_synced?: number;  // Alternative key name
      grades_received?: number;
      remediation_assigned?: number;
      remediations_queued?: number;  // Alternative key name
      misconceptions_tracked?: number;
      xp_awarded?: number;
      coins_awarded?: number;
    };
  };
}

interface SyncLog {
  id: string;
  created_at: string;
  action: string;
  data: SyncLogData;
  processed: boolean;
  processed_at: string | null;
}

interface StudentProfile {
  student_id: string;
  student_name: string;
  misconceptions: Array<{ name: string; count: number }>;
  weak_topics: string[];
  remediation_suggestions: string[];
  total_xp_potential: number;
  total_coins_potential: number;
}

interface ScholarSyncDashboardProps {
  classId?: string;
}

export function ScholarSyncDashboard({ classId }: ScholarSyncDashboardProps) {
  const { user } = useAuth();
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);

  const { data: syncLogs, isLoading, refetch } = useQuery({
    queryKey: ['scholar-sync-logs', user?.id, classId],
    queryFn: async () => {
      let query = supabase
        .from('sister_app_sync_log')
        .select('*')
        .eq('teacher_id', user!.id)
        .in('action', ['batch_sync', 'individual_sync', 'pull_completions'])
        .order('created_at', { ascending: false })
        .limit(20);

      const { data, error } = await query;
      if (error) throw error;
      
      // Filter by class_id if specified
      if (classId) {
        return (data as SyncLog[]).filter(log => 
          (log.data as SyncLogData)?.class_id === classId
        );
      }
      
      return data as SyncLog[];
    },
    enabled: !!user,
  });

  const handleManualSync = async () => {
    if (!user) return;
    setIsSyncing(true);
    
    try {
      const response = await supabase.functions.invoke('sync-grades-to-scholar', {
        body: classId ? { class_id: classId } : {},
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      // Check if the response indicates failure
      const data = response.data;
      if (data && !data.success) {
        const errorMsg = data.error || 'Unknown error';
        const suggestion = data.suggestion || '';
        console.error('Sync failed:', data);
        toast.error(errorMsg, {
          description: suggestion || undefined,
          duration: 6000,
        });
        return;
      }

      toast.success('Successfully synced data to Scholar AI', {
        description: `${data?.synced_students || 0} students synced`,
      });
      refetch();
    } catch (err) {
      console.error('Sync error:', err);
      toast.error('Failed to sync to Scholar AI', {
        description: err instanceof Error ? err.message : 'Network or server error',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePullCompletions = async () => {
    if (!user) return;
    setIsPulling(true);
    
    try {
      const response = await supabase.functions.invoke('pull-scholar-completions', {
        body: classId ? { class_id: classId, since_days: 30 } : { since_days: 30 },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const data = response.data;
      if (data && !data.success) {
        toast.error(data.error || 'Pull failed');
        return;
      }

      if (data?.grades_created > 0) {
        toast.success(`Pulled ${data.grades_created} new grades from Scholar`, {
          description: `${data.students_matched} students matched, ${data.duplicates_skipped} duplicates skipped`,
        });
      } else {
        toast.info(data?.message || 'No new completions found', {
          description: data?.completions_found > 0 
            ? `${data.completions_found} found, ${data.duplicates_skipped} already recorded`
            : 'Students may not have completed any practice yet',
        });
      }
      refetch();
    } catch (err) {
      console.error('Pull error:', err);
      toast.error('Failed to pull from Scholar', {
        description: err instanceof Error ? err.message : 'Network or server error',
      });
    } finally {
      setIsPulling(false);
    }
  };

  const getStatusBadge = (log: SyncLog) => {
    const response = log.data?.response;
    const syncResults = log.data?.sync_results;
    
    // Check multiple success indicators:
    // 1. response.success (new format)
    // 2. sync_results with successful > 0 and failed === 0
    // 3. pull_completions: grades_found or students_matched > 0
    // 4. Data has students/grades (flat or nested format)
    const hasResponseSuccess = response?.success === true;
    const hasSyncSuccess = syncResults && (syncResults.successful || 0) > 0;
    const hasPullData = log.action === 'pull_completions' && (
      (log.data as any)?.grades_found > 0 || 
      (log.data as any)?.students_matched > 0 ||
      (log.data as any)?.grades_created > 0
    );
    const hasDataValues = getDataValue(log.data, 'total_students') > 0 || getDataValue(log.data, 'total_grades') > 0;
    
    // Only mark as failed if response explicitly says success: false
    const isExplicitFailure = response?.success === false;
    const isSuccess = hasResponseSuccess || hasSyncSuccess || hasPullData || hasDataValues;
    
    if (isExplicitFailure && !isSuccess) {
      return (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 mr-1" />
          Failed
        </Badge>
      );
    }
    
    if (isSuccess) {
      return (
        <Badge variant="default" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Success
        </Badge>
      );
    }
    
    // Default: show as completed (no data to sync isn't a failure)
    return (
      <Badge variant="secondary">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        No Data
      </Badge>
    );
  };

  const latestSync = syncLogs?.[0];
  const totalSyncs = syncLogs?.length || 0;

  // Helper to extract values from nested or flat data structure
  const getDataValue = (data: SyncLogData | undefined, key: 'total_students' | 'total_grades' | 'total_misconceptions' | 'weak_topics_identified'): number => {
    if (!data) return 0;
    const anyData = data as any;
    // Try direct access, summary object, then pull_completions-specific keys
    if (key === 'total_students') {
      return data[key] ?? data.summary?.[key] ?? anyData?.students_matched ?? 0;
    }
    if (key === 'total_grades') {
      return data[key] ?? data.summary?.[key] ?? anyData?.grades_found ?? anyData?.grades_created ?? 0;
    }
    return data[key] ?? data.summary?.[key] ?? 0;
  };

  // Calculate totals - use MAX for students (not cumulative) and SUM for actions
  const totals = (() => {
    if (!syncLogs || syncLogs.length === 0) {
      return { students: 0, grades: 0, misconceptions: 0, remediation: 0, xp: 0, coins: 0 };
    }
    
    let maxStudents = 0;
    let totalGrades = 0;
    let totalMisconceptions = 0;
    let totalRemediation = 0;
    let totalXp = 0;
    let totalCoins = 0;
    
    for (const log of syncLogs) {
      const data = log.data;
      const processed = data?.response?.processed;
      const studentCount = processed?.students_processed || processed?.students_synced || 
        (data as any)?.students_matched || getDataValue(data, 'total_students');
      // Use max for students since it's the same pool being synced repeatedly
      maxStudents = Math.max(maxStudents, studentCount);
      totalGrades += processed?.grades_received || (data as any)?.grades_created || getDataValue(data, 'total_grades');
      totalMisconceptions += processed?.misconceptions_tracked || getDataValue(data, 'total_misconceptions');
      totalRemediation += processed?.remediation_assigned || processed?.remediations_queued || 0;
      totalXp += processed?.xp_awarded || 0;
      totalCoins += processed?.coins_awarded || 0;
    }
    
    return { students: maxStudents, grades: totalGrades, misconceptions: totalMisconceptions, remediation: totalRemediation, xp: totalXp, coins: totalCoins };
  })();

  const successfulSyncs = syncLogs?.filter(log => {
    const response = log.data?.response;
    const syncResults = log.data?.sync_results;
    const hasPullData = log.action === 'pull_completions' && (
      (log.data as any)?.grades_found > 0 || (log.data as any)?.students_matched > 0
    );
    return response?.success || (syncResults && (syncResults.successful || 0) > 0) || hasPullData ||
      getDataValue(log.data, 'total_students') > 0;
  }).length || 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-32" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <ScholarSyncPreviewDialog
        open={showPreviewDialog}
        onOpenChange={setShowPreviewDialog}
        classId={classId}
        onConfirmSync={handleManualSync}
      />
      
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-primary" />
              <CardTitle>Scholar AI Sync Dashboard</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handlePullCompletions}
                disabled={isPulling}
              >
                <Download className={`h-4 w-4 mr-2 ${isPulling ? 'animate-bounce' : ''}`} />
                {isPulling ? 'Pulling...' : 'Pull from Scholar'}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowPreviewDialog(true)}
              >
                <Eye className="h-4 w-4 mr-2" />
                Preview Sync
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleManualSync}
                disabled={isSyncing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </Button>
            </div>
          </div>
          <CardDescription>
            Track data synced to Scholar AI including misconceptions and remediation assignments
          </CardDescription>
        </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-lg font-semibold">{totals.students}</p>
              <p className="text-xs text-muted-foreground">Students Synced</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <p className="text-lg font-semibold">{totals.misconceptions}</p>
              <p className="text-xs text-muted-foreground">Misconceptions Tracked</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <BookOpen className="h-4 w-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-lg font-semibold">{totals.remediation}</p>
              <p className="text-xs text-muted-foreground">Remediation Assigned</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-lg font-semibold">{totals.xp} XP / {totals.coins} 🪙</p>
              <p className="text-xs text-muted-foreground">Rewards Awarded</p>
            </div>
          </div>
        </div>

        {/* Last Sync Info */}
        {latestSync && (
          <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Last Sync</p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(latestSync.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
            {getStatusBadge(latestSync)}
          </div>
        )}

        {/* Sync History */}
        {!syncLogs || syncLogs.length === 0 ? (
          <div className="text-center py-8">
            <CloudOff className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="font-medium text-lg mb-2">No sync history yet</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Sync student data to Scholar AI to see history here
            </p>
            <Button onClick={handleManualSync} disabled={isSyncing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              Start First Sync
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              Sync History ({successfulSyncs}/{totalSyncs} successful)
            </h3>
            <ScrollArea className="h-[300px]">
              <div className="space-y-2 pr-4">
                {syncLogs.map((log) => (
                  <Collapsible
                    key={log.id}
                    open={expandedLogId === log.id}
                    onOpenChange={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                  >
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="text-left">
                            <p className="text-sm font-medium">
                              {format(new Date(log.created_at), 'MMM d, yyyy h:mm a')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {getDataValue(log.data, 'total_students')} students • {getDataValue(log.data, 'total_grades')} grades • {getDataValue(log.data, 'total_misconceptions')} misconceptions
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(log)}
                          <ChevronDown className={`h-4 w-4 transition-transform ${expandedLogId === log.id ? 'rotate-180' : ''}`} />
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-2 p-4 rounded-lg bg-muted/30 space-y-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Students Processed</p>
                            <p className="font-medium">{log.data?.response?.processed?.students_processed || log.data?.response?.processed?.students_synced || getDataValue(log.data, 'total_students')}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Grades Synced</p>
                            <p className="font-medium">{log.data?.response?.processed?.grades_received || getDataValue(log.data, 'total_grades')}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Misconceptions Tracked</p>
                            <p className="font-medium">{log.data?.response?.processed?.misconceptions_tracked || getDataValue(log.data, 'total_misconceptions')}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Remediation Assigned</p>
                            <p className="font-medium">{log.data?.response?.processed?.remediation_assigned || 0}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">XP Awarded</p>
                            <p className="font-medium">{log.data?.response?.processed?.xp_awarded || 0}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Coins Awarded</p>
                            <p className="font-medium">{log.data?.response?.processed?.coins_awarded || 0}</p>
                          </div>
                        </div>
                        {log.data?.response?.message && (
                          <div className="pt-2 border-t">
                            <p className="text-xs text-muted-foreground">Response Message</p>
                            <p className="text-sm">{log.data.response.message}</p>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
    </>
  );
}
