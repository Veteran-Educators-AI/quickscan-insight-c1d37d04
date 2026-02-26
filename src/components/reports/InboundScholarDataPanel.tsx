import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Download, 
  ChevronDown, 
  Users, 
  Trophy,
  Star,
  Coins,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  Merge,
  Layers,
  Loader2,
  AlertCircle,
  Gamepad2,
  GraduationCap,
  Award,
  ClipboardCheck
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { useStudentNames } from '@/lib/StudentNameContext';

interface InboundEventData {
  activity_type?: string;
  activity_name?: string;
  score?: number;
  xp_earned?: number;
  coins_earned?: number;
  new_level?: number;
  achievement_name?: string;
  topic_name?: string;
  timestamp?: string;
  // Practice session fields
  questions_attempted?: number;
  questions_correct?: number;
  completed_at?: string;
  student_name?: string;
  assignment_title?: string;
  topics_processed?: number;
  grades_created?: number;
  topic_details?: Array<{
    topic: string;
    standard?: string;
    score: number;
    correct: number;
    attempted: number;
  }>;
  // Assignment fields
  time_spent_minutes?: number;
  grade_saved?: boolean;
  [key: string]: unknown;
}

interface InboundEvent {
  id: string;
  created_at: string;
  action: string;
  student_id: string | null;
  data: InboundEventData;
  source_app: string;
  processed: boolean;
  processed_at: string | null;
}

interface InboundScholarDataPanelProps {
  classId?: string;
}

export function InboundScholarDataPanel({ classId }: InboundScholarDataPanelProps) {
  const { user } = useAuth();
  const { getDisplayName } = useStudentNames();
  const queryClient = useQueryClient();
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [isIntegrating, setIsIntegrating] = useState(false);

  // Fetch inbound events from scholar app
  const { data: inboundEvents, isLoading, refetch } = useQuery({
    queryKey: ['inbound-scholar-events', user?.id, classId],
    queryFn: async () => {
      // Fetch events that came FROM the sister app (not batch syncs we sent TO them)
      const { data, error } = await supabase
        .from('sister_app_sync_log')
        .select('*')
        .eq('teacher_id', user!.id)
        .in('action', ['grade_completed', 'activity_completed', 'reward_earned', 'level_up', 'achievement_unlocked', 'behavior_deduction', 'work_submitted', 'sync_practice_session', 'sync_assignment', 'sync_student_data', 'sync_progress'])
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as InboundEvent[];
    },
    enabled: !!user,
  });

  // Fetch student data for pseudonym display (no real names stored in map)
  const { data: studentMap } = useQuery({
    queryKey: ['student-names-map', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('id, first_name, last_name');
      
      if (error) throw error;
      
      const map: Record<string, { first_name: string; last_name: string }> = {};
      data?.forEach(s => { map[s.id] = { first_name: s.first_name, last_name: s.last_name }; });
      return map;
    },
    enabled: !!user,
  });

  // Mutation to integrate selected events into grade_history
  const integrateMutation = useMutation({
    mutationFn: async (eventIds: string[]) => {
      const eventsToIntegrate = inboundEvents?.filter(e => eventIds.includes(e.id) && !e.processed) || [];
      
      const gradesInserts = eventsToIntegrate
        .filter(e => e.data?.score !== undefined && e.data?.topic_name && e.student_id)
        .map(e => ({
          student_id: e.student_id!,
          teacher_id: user!.id,
          topic_name: e.data.topic_name!,
          grade: e.data.score!,
          grade_justification: `Synced from Scholar AI: ${e.data.activity_name || e.action}`,
        }));

      if (gradesInserts.length > 0) {
        const { error: gradeError } = await supabase
          .from('grade_history')
          .insert(gradesInserts);
        
        if (gradeError) throw gradeError;
      }

      // Mark events as processed
      const { error: updateError } = await supabase
        .from('sister_app_sync_log')
        .update({ 
          processed: true, 
          processed_at: new Date().toISOString() 
        })
        .in('id', eventIds);

      if (updateError) throw updateError;

      return { integrated: gradesInserts.length, marked: eventIds.length };
    },
    onSuccess: (result) => {
      toast.success('Data integrated successfully', {
        description: `${result.integrated} grades added to gradebook`,
      });
      setSelectedEvents(new Set());
      queryClient.invalidateQueries({ queryKey: ['inbound-scholar-events'] });
      queryClient.invalidateQueries({ queryKey: ['grade-history'] });
    },
    onError: (error) => {
      toast.error('Failed to integrate data', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // Mutation to mark events as processed without integrating
  const markProcessedMutation = useMutation({
    mutationFn: async (eventIds: string[]) => {
      const { error } = await supabase
        .from('sister_app_sync_log')
        .update({ 
          processed: true, 
          processed_at: new Date().toISOString() 
        })
        .in('id', eventIds);

      if (error) throw error;
      return eventIds.length;
    },
    onSuccess: (count) => {
      toast.success('Marked as processed', {
        description: `${count} events marked without integration`,
      });
      setSelectedEvents(new Set());
      queryClient.invalidateQueries({ queryKey: ['inbound-scholar-events'] });
    },
    onError: (error) => {
      toast.error('Failed to update', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const handleIntegrateSelected = () => {
    if (selectedEvents.size === 0) return;
    integrateMutation.mutate(Array.from(selectedEvents));
  };

  const handleKeepSeparate = () => {
    if (selectedEvents.size === 0) return;
    markProcessedMutation.mutate(Array.from(selectedEvents));
  };

  const handleSelectAll = () => {
    const unprocessedIds = inboundEvents?.filter(e => !e.processed).map(e => e.id) || [];
    setSelectedEvents(new Set(unprocessedIds));
  };

  const handleDeselectAll = () => {
    setSelectedEvents(new Set());
  };

  // Send a fake test event to verify the auto-integration pipeline
  const sendTestEvent = useMutation({
    mutationFn: async () => {
      // Pick a random student from the map if available
      const studentIds = Object.keys(studentMap || {});
      const testStudentId = studentIds.length > 0 ? studentIds[0] : null;
      const testStudentName = testStudentId && studentMap?.[testStudentId] 
        ? getDisplayName(testStudentId, studentMap[testStudentId].first_name, studentMap[testStudentId].last_name)
        : 'Test Student';

      const testScore = Math.floor(Math.random() * 31) + 70; // 70-100
      const testTopicName = 'Test Topic – Auto-Integration Check';

      // Insert directly into sister_app_sync_log as if the webhook processed it
      const { data: logEntry, error: logError } = await supabase
        .from('sister_app_sync_log')
        .insert({
          teacher_id: user!.id,
          student_id: testStudentId,
          action: 'grade_completed',
          data: {
            score: testScore,
            topic_name: testTopicName,
            activity_name: 'Pipeline Test Event',
            xp_earned: 10,
            coins_earned: 5,
            timestamp: new Date().toISOString(),
          },
          source_app: 'test_simulation',
          processed: true,
          processed_at: new Date().toISOString(),
        } as any)
        .select()
        .single();

      if (logError) throw logError;

      // Also insert into grade_history to verify the full pipeline
      if (testStudentId) {
        const { error: gradeError } = await supabase
          .from('grade_history')
          .insert({
            student_id: testStudentId,
            teacher_id: user!.id,
            topic_name: testTopicName,
            grade: testScore,
            grade_justification: `Test event from auto-integration pipeline check`,
          });

        if (gradeError) throw gradeError;
      }

      return { score: testScore, studentName: testStudentName };
    },
    onSuccess: (result) => {
      toast.success('Test event sent & auto-integrated!', {
        description: `Score ${result.score}% for ${result.studentName} added to gradebook.`,
      });
      queryClient.invalidateQueries({ queryKey: ['inbound-scholar-events'] });
      queryClient.invalidateQueries({ queryKey: ['grade-history'] });
    },
    onError: (error) => {
      toast.error('Test event failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const toggleEventSelection = (eventId: string) => {
    const newSet = new Set(selectedEvents);
    if (newSet.has(eventId)) {
      newSet.delete(eventId);
    } else {
      newSet.add(eventId);
    }
    setSelectedEvents(newSet);
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'grade_completed':
        return <GraduationCap className="h-4 w-4 text-blue-500" />;
      case 'activity_completed':
        return <Gamepad2 className="h-4 w-4 text-purple-500" />;
      case 'reward_earned':
        return <Coins className="h-4 w-4 text-amber-500" />;
      case 'level_up':
        return <TrendingUp className="h-4 w-4 text-emerald-500" />;
      case 'achievement_unlocked':
        return <Award className="h-4 w-4 text-pink-500" />;
      case 'behavior_deduction':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'work_submitted':
        return <ClipboardCheck className="h-4 w-4 text-teal-500" />;
      case 'sync_practice_session':
        return <Gamepad2 className="h-4 w-4 text-indigo-500" />;
      case 'sync_assignment':
        return <ClipboardCheck className="h-4 w-4 text-orange-500" />;
      case 'sync_student_data':
        return <Users className="h-4 w-4 text-cyan-500" />;
      case 'sync_progress':
        return <TrendingUp className="h-4 w-4 text-emerald-500" />;
      default:
        return <Star className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'grade_completed': return 'Grade Completed';
      case 'activity_completed': return 'Activity Completed';
      case 'reward_earned': return 'Reward Earned';
      case 'level_up': return 'Level Up';
      case 'achievement_unlocked': return 'Achievement Unlocked';
      case 'behavior_deduction': return 'Behavior Deduction';
      case 'work_submitted': return 'Work Submitted';
      case 'sync_practice_session': return 'Practice Session';
      case 'sync_assignment': return 'Assignment Synced';
      case 'sync_student_data': return 'Student Data Synced';
      case 'sync_progress': return 'Progress Update';
      default: return action;
    }
  };

  // Calculate statistics
  const unprocessedEvents = inboundEvents?.filter(e => !e.processed) || [];
  const processedEvents = inboundEvents?.filter(e => e.processed) || [];
  
  const stats = inboundEvents?.reduce((acc, event) => {
    return {
      totalXp: acc.totalXp + (event.data?.xp_earned || 0),
      totalCoins: acc.totalCoins + (event.data?.coins_earned || 0),
      uniqueStudents: acc.uniqueStudents.add(event.student_id || ''),
      byAction: {
        ...acc.byAction,
        [event.action]: (acc.byAction[event.action] || 0) + 1,
      },
    };
  }, { 
    totalXp: 0, 
    totalCoins: 0, 
    uniqueStudents: new Set<string>(), 
    byAction: {} as Record<string, number> 
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-96" />
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            <CardTitle>Incoming Scholar AI Data</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => sendTestEvent.mutate()}
              disabled={sendTestEvent.isPending}
            >
              {sendTestEvent.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Gamepad2 className="h-4 w-4 mr-2" />
              )}
              Send Test Event
            </Button>
            {unprocessedEvents.length > 0 && (
              <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                <AlertCircle className="h-3 w-3 mr-1" />
                {unprocessedEvents.length} Pending
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>
          View and manage data returned from Scholar AI. Choose to integrate with your statistics or keep separate.
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
              <p className="text-lg font-semibold">{stats?.uniqueStudents.size || 0}</p>
              <p className="text-xs text-muted-foreground">Students</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Star className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <p className="text-lg font-semibold">{stats?.totalXp || 0}</p>
              <p className="text-xs text-muted-foreground">Total XP Earned</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Coins className="h-4 w-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-lg font-semibold">{stats?.totalCoins || 0}</p>
              <p className="text-xs text-muted-foreground">Total Coins Earned</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Trophy className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-lg font-semibold">{inboundEvents?.length || 0}</p>
              <p className="text-xs text-muted-foreground">Total Events</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {unprocessedEvents.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-2 mr-auto">
              <Checkbox
                checked={selectedEvents.size === unprocessedEvents.length && unprocessedEvents.length > 0}
                onCheckedChange={(checked) => checked ? handleSelectAll() : handleDeselectAll()}
              />
              <span className="text-sm text-muted-foreground">
                {selectedEvents.size} of {unprocessedEvents.length} selected
              </span>
            </div>
            
            <Button
              variant="default"
              size="sm"
              onClick={handleIntegrateSelected}
              disabled={selectedEvents.size === 0 || integrateMutation.isPending}
            >
              {integrateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Merge className="h-4 w-4 mr-2" />
              )}
              Integrate with Statistics
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleKeepSeparate}
              disabled={selectedEvents.size === 0 || markProcessedMutation.isPending}
            >
              {markProcessedMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Layers className="h-4 w-4 mr-2" />
              )}
              Keep Separate
            </Button>
          </div>
        )}

        {/* Events List */}
        {!inboundEvents || inboundEvents.length === 0 ? (
          <div className="text-center py-8">
            <Download className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="font-medium text-lg mb-2">No incoming data yet</h3>
            <p className="text-muted-foreground text-sm">
              When Scholar AI sends data back (grades, achievements, etc.), it will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              Event History ({processedEvents.length} processed, {unprocessedEvents.length} pending)
            </h3>
            <ScrollArea className="h-[400px]">
              <div className="space-y-2 pr-4">
                {inboundEvents.map((event) => (
                  <Collapsible
                    key={event.id}
                    open={expandedEventId === event.id}
                    onOpenChange={() => setExpandedEventId(expandedEventId === event.id ? null : event.id)}
                  >
                    <div className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                      {!event.processed && (
                        <Checkbox
                          checked={selectedEvents.has(event.id)}
                          onCheckedChange={() => toggleEventSelection(event.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                      
                      <CollapsibleTrigger asChild>
                        <div className="flex-1 flex items-center justify-between cursor-pointer">
                          <div className="flex items-center gap-3">
                            {getActionIcon(event.action)}
                            <div className="text-left">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">
                                  {getActionLabel(event.action)}
                                </p>
                                {event.data?.score !== undefined && (
                                  <Badge variant="outline" className="text-xs">
                                    {event.data.score}%
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {(() => {
                                  const sid = event.student_id || '';
                                  const s = studentMap?.[sid];
                                  return s ? getDisplayName(sid, s.first_name, s.last_name) : 'Unknown Student';
                                })()} • {event.data?.topic_name || event.data?.activity_name || event.data?.assignment_title || 'No details'}
                                {event.data?.questions_correct !== undefined && event.data?.questions_attempted !== undefined && (
                                  <span className="ml-1">({event.data.questions_correct}/{event.data.questions_attempted} correct)</span>
                                )}
                                {event.data?.completed_at && (
                                  <span className="ml-1">• Completed {formatDistanceToNow(new Date(event.data.completed_at), { addSuffix: true })}</span>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-right text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                            </div>
                            {event.processed ? (
                              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Processed
                              </Badge>
                            ) : (
                              <Badge variant="outline">
                                <Clock className="h-3 w-3 mr-1" />
                                Pending
                              </Badge>
                            )}
                            <ChevronDown className={`h-4 w-4 transition-transform ${expandedEventId === event.id ? 'rotate-180' : ''}`} />
                          </div>
                        </div>
                      </CollapsibleTrigger>
                    </div>
                    
                    <CollapsibleContent>
                      <div className="mt-2 p-4 rounded-lg bg-muted/30 space-y-3 ml-8">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                          {event.data?.score !== undefined && (
                            <div>
                              <p className="text-muted-foreground">Score</p>
                              <p className="font-medium">{event.data.score}%</p>
                            </div>
                          )}
                          {event.data?.xp_earned !== undefined && (
                            <div>
                              <p className="text-muted-foreground">XP Earned</p>
                              <p className="font-medium text-amber-600">{event.data.xp_earned} XP</p>
                            </div>
                          )}
                          {event.data?.coins_earned !== undefined && (
                            <div>
                              <p className="text-muted-foreground">Coins Earned</p>
                              <p className="font-medium text-emerald-600">{event.data.coins_earned} 🪙</p>
                            </div>
                          )}
                          {event.data?.new_level !== undefined && (
                            <div>
                              <p className="text-muted-foreground">New Level</p>
                              <p className="font-medium text-blue-600">Level {event.data.new_level}</p>
                            </div>
                          )}
                          {event.data?.achievement_name && (
                            <div>
                              <p className="text-muted-foreground">Achievement</p>
                              <p className="font-medium text-pink-600">{event.data.achievement_name}</p>
                            </div>
                          )}
                          {event.data?.activity_type && (
                            <div>
                              <p className="text-muted-foreground">Activity Type</p>
                              <p className="font-medium capitalize">{event.data.activity_type}</p>
                            </div>
                          )}
                          {event.data?.questions_correct !== undefined && event.data?.questions_attempted !== undefined && (
                            <div>
                              <p className="text-muted-foreground">Questions</p>
                              <p className="font-medium">{event.data.questions_correct}/{event.data.questions_attempted} correct</p>
                            </div>
                          )}
                          {event.data?.completed_at && (
                            <div>
                              <p className="text-muted-foreground">Completed</p>
                              <p className="font-medium">{format(new Date(event.data.completed_at), 'MMM d, h:mm a')}</p>
                            </div>
                          )}
                          {event.data?.time_spent_minutes !== undefined && (
                            <div>
                              <p className="text-muted-foreground">Time Spent</p>
                              <p className="font-medium">{event.data.time_spent_minutes} min</p>
                            </div>
                          )}
                          {event.data?.grade_saved && (
                            <div>
                              <p className="text-muted-foreground">Grade Status</p>
                              <p className="font-medium text-emerald-600">✓ Saved to Gradebook</p>
                            </div>
                          )}
                          {event.data?.topics_processed !== undefined && event.data.topics_processed > 0 && (
                            <div>
                              <p className="text-muted-foreground">Topics Covered</p>
                              <p className="font-medium">{event.data.topics_processed} topics</p>
                            </div>
                          )}
                        </div>
                        
                        <div className="pt-2 border-t text-xs text-muted-foreground flex items-center gap-4">
                          <span>ID: {event.id.slice(0, 8)}...</span>
                          <span>Source: {event.source_app}</span>
                          <span>Received: {format(new Date(event.created_at), 'MMM d, yyyy h:mm a')}</span>
                          {event.processed_at && (
                            <span>Processed: {format(new Date(event.processed_at), 'MMM d, yyyy h:mm a')}</span>
                          )}
                        </div>
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
  );
}
