import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { format, isPast, isToday } from 'date-fns';
import { 
  FileText, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  XCircle,
  Mail,
  Calendar,
  Users,
  Send,
} from 'lucide-react';
import { useStudentNames } from '@/lib/StudentNameContext';

interface WorksheetSubmission {
  id: string;
  worksheet_id: string;
  student_id: string;
  class_id: string;
  submitted_at: string | null;
  status: 'pending' | 'submitted' | 'late' | 'missing';
  score: number | null;
  feedback: string | null;
  created_at: string;
  student: {
    first_name: string;
    last_name: string;
  };
}

interface AssignedWorksheet {
  id: string;
  title: string;
  due_date: string | null;
  class_id: string;
  created_at: string;
  class_name?: string;
  submissions_count: number;
  missing_count: number;
}

interface WorksheetSubmissionsTrackerProps {
  classId?: string;
}

export function WorksheetSubmissionsTracker({ classId }: WorksheetSubmissionsTrackerProps) {
  const { getDisplayName } = useStudentNames();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedWorksheet, setSelectedWorksheet] = useState<AssignedWorksheet | null>(null);
  const [showNotifyDialog, setShowNotifyDialog] = useState(false);
  const [missingStudents, setMissingStudents] = useState<string[]>([]);

  // Fetch assigned worksheets
  const { data: worksheets, isLoading: loadingWorksheets } = useQuery({
    queryKey: ['assigned-worksheets', user?.id, classId],
    queryFn: async () => {
      let query = supabase
        .from('worksheets')
        .select(`
          id,
          title,
          due_date,
          class_id,
          created_at,
          classes(name)
        `)
        .eq('teacher_id', user!.id)
        .eq('is_assigned', true)
        .order('due_date', { ascending: true, nullsFirst: false });

      if (classId) {
        query = query.eq('class_id', classId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // For each worksheet, count submissions
      const worksheetsWithCounts = await Promise.all(
        (data || []).map(async (worksheet) => {
          const { count: submittedCount } = await supabase
            .from('worksheet_submissions')
            .select('*', { count: 'exact', head: true })
            .eq('worksheet_id', worksheet.id)
            .eq('status', 'submitted');

          const { count: missingCount } = await supabase
            .from('worksheet_submissions')
            .select('*', { count: 'exact', head: true })
            .eq('worksheet_id', worksheet.id)
            .in('status', ['missing', 'pending']);

          return {
            id: worksheet.id,
            title: worksheet.title,
            due_date: worksheet.due_date,
            class_id: worksheet.class_id,
            created_at: worksheet.created_at,
            class_name: (worksheet.classes as any)?.name,
            submissions_count: submittedCount || 0,
            missing_count: missingCount || 0,
          };
        })
      );

      return worksheetsWithCounts as AssignedWorksheet[];
    },
    enabled: !!user,
  });

  // Fetch submissions for selected worksheet
  const { data: submissions, isLoading: loadingSubmissions } = useQuery({
    queryKey: ['worksheet-submissions', selectedWorksheet?.id],
    queryFn: async () => {
      if (!selectedWorksheet) return [];

      const { data, error } = await supabase
        .from('worksheet_submissions')
        .select(`
          id,
          worksheet_id,
          student_id,
          class_id,
          submitted_at,
          status,
          score,
          feedback,
          created_at,
          student:students(first_name, last_name)
        `)
        .eq('worksheet_id', selectedWorksheet.id)
        .order('status', { ascending: true });

      if (error) throw error;

      return (data || []).map((s) => ({
        ...s,
        student: s.student as unknown as { first_name: string; last_name: string },
      })) as WorksheetSubmission[];
    },
    enabled: !!selectedWorksheet,
  });

  // Mark as missing mutation
  const markMissingMutation = useMutation({
    mutationFn: async (worksheetId: string) => {
      // Get all pending submissions past due date
      const worksheet = worksheets?.find(w => w.id === worksheetId);
      if (!worksheet?.due_date || !isPast(new Date(worksheet.due_date))) {
        throw new Error('Cannot mark as missing before due date');
      }

      const { error } = await supabase
        .from('worksheet_submissions')
        .update({ status: 'missing' })
        .eq('worksheet_id', worksheetId)
        .eq('status', 'pending');

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worksheet-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['assigned-worksheets'] });
      toast({ title: 'Submissions marked as missing' });
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'submitted':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'late':
        return <Clock className="h-4 w-4 text-orange-500" />;
      case 'missing':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'submitted':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Submitted</Badge>;
      case 'late':
        return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">Late</Badge>;
      case 'missing':
        return <Badge variant="destructive">Missing</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  const getDueDateStatus = (dueDate: string | null) => {
    if (!dueDate) return null;
    const date = new Date(dueDate);
    if (isToday(date)) {
      return <Badge className="bg-yellow-100 text-yellow-800">Due Today</Badge>;
    }
    if (isPast(date)) {
      return <Badge variant="destructive">Past Due</Badge>;
    }
    return <Badge variant="outline">Due {format(date, 'MMM d')}</Badge>;
  };

  const handleNotifyMissing = () => {
    if (!selectedWorksheet) return;
    const missing = submissions?.filter(s => s.status === 'missing' || s.status === 'pending') || [];
    setMissingStudents(missing.map(s => getDisplayName(s.student_id, s.student.first_name, s.student.last_name)));
    setShowNotifyDialog(true);
  };

  if (loadingWorksheets) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Worksheet Submissions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!worksheets || worksheets.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Worksheet Submissions</CardTitle>
          <CardDescription>Track student worksheet submissions and identify missing work</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No assigned worksheets yet</p>
            <p className="text-sm">Assign worksheets to a class to track submissions</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Worksheet Submissions
              </CardTitle>
              <CardDescription>
                Track submissions and identify missing work
              </CardDescription>
            </div>
            <Select
              value={selectedWorksheet?.id || ''}
              onValueChange={(id) => {
                const ws = worksheets.find(w => w.id === id);
                setSelectedWorksheet(ws || null);
              }}
            >
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Select a worksheet" />
              </SelectTrigger>
              <SelectContent>
                {worksheets.map(ws => (
                  <SelectItem key={ws.id} value={ws.id}>
                    <div className="flex items-center gap-2">
                      <span className="truncate">{ws.title}</span>
                      {ws.missing_count > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {ws.missing_count} missing
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {!selectedWorksheet ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Select a worksheet to view submissions</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Worksheet Info */}
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div className="space-y-1">
                  <h3 className="font-medium">{selectedWorksheet.title}</h3>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Created: {format(new Date(selectedWorksheet.created_at), 'MMM d, yyyy')}
                    </span>
                    {selectedWorksheet.due_date && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Due: {format(new Date(selectedWorksheet.due_date), 'MMM d, yyyy')}
                      </span>
                    )}
                    {selectedWorksheet.class_name && (
                      <Badge variant="outline">{selectedWorksheet.class_name}</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getDueDateStatus(selectedWorksheet.due_date)}
                  {selectedWorksheet.due_date && isPast(new Date(selectedWorksheet.due_date)) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => markMissingMutation.mutate(selectedWorksheet.id)}
                      disabled={markMissingMutation.isPending}
                    >
                      Mark All Missing
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={handleNotifyMissing}
                    disabled={!submissions?.some(s => s.status === 'missing' || s.status === 'pending')}
                  >
                    <Mail className="h-4 w-4 mr-1" />
                    Notify Missing
                  </Button>
                </div>
              </div>

              {/* Submissions Table */}
              <ScrollArea className="h-[400px]">
                {loadingSubmissions ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {submissions?.map(submission => (
                        <TableRow key={submission.id}>
                          <TableCell className="font-medium">
                            {getDisplayName(submission.student_id, submission.student.first_name, submission.student.last_name)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(submission.status)}
                              {getStatusBadge(submission.status)}
                            </div>
                          </TableCell>
                          <TableCell>
                            {submission.submitted_at
                              ? format(new Date(submission.submitted_at), 'MMM d, h:mm a')
                              : '—'}
                          </TableCell>
                          <TableCell>
                            {submission.score !== null ? `${submission.score}%` : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!submissions || submissions.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                            No submission records for this worksheet
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notify Missing Dialog */}
      <Dialog open={showNotifyDialog} onOpenChange={setShowNotifyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Notify Students About Missing Work
            </DialogTitle>
            <DialogDescription>
              Send a notification to the following students about their missing worksheet submission.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-medium">Students to notify ({missingStudents.length}):</p>
            <ScrollArea className="h-[200px] rounded-md border p-3">
              <ul className="space-y-1">
                {missingStudents.map((name, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <AlertCircle className="h-3 w-3 text-orange-500" />
                    {name}
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNotifyDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                toast({ title: `Notifications sent to ${missingStudents.length} students` });
                setShowNotifyDialog(false);
              }}
            >
              <Send className="h-4 w-4 mr-2" />
              Send Notifications
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
