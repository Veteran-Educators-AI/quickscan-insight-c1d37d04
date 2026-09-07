import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useGradeFloorSettings } from '@/hooks/useGradeFloorSettings';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { RefreshCw, CheckCircle2, AlertTriangle, Calculator, Settings2 } from 'lucide-react';
import { useStudentNames } from '@/lib/StudentNameContext';

interface GradeRecalculationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId?: string;
}

interface GradeHistoryRecord {
  id: string;
  student_id: string;
  topic_name: string;
  grade: number;
  raw_score_earned: number | null;
  raw_score_possible: number | null;
  regents_score: number | null;
  created_at: string;
  student?: {
    first_name: string;
    last_name: string;
  };
}

interface RecalculationPreview {
  id: string;
  studentName: string;
  topicName: string;
  oldGrade: number;
  newGrade: number;
  changed: boolean;
}

export function GradeRecalculationDialog({
  open,
  onOpenChange,
  classId,
}: GradeRecalculationDialogProps) {
  const { getDisplayName } = useStudentNames();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { gradeFloor, gradeFloorWithEffort, calculateGrade } = useGradeFloorSettings();
  
  const [selectedClassId, setSelectedClassId] = useState<string>(classId || 'all');
  const [previewMode, setPreviewMode] = useState(true);
  const [previews, setPreviews] = useState<RecalculationPreview[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isCalculating, setIsCalculating] = useState(false);
  const [progress, setProgress] = useState(0);

  // Fetch classes for dropdown
  const { data: classes } = useQuery({
    queryKey: ['classes-for-recalc', user?.id],
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
    enabled: !!user && open,
  });

  // Fetch grade history for recalculation
  const { data: gradeHistoryData, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['grade-history-for-recalc', user?.id, selectedClassId],
    queryFn: async () => {
      let query = supabase
        .from('grade_history')
        .select(`
          id,
          student_id,
          topic_name,
          grade,
          raw_score_earned,
          raw_score_possible,
          regents_score,
          created_at
        `)
        .eq('teacher_id', user!.id)
        .order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      // If filtering by class, we need to get student IDs for that class
      if (selectedClassId && selectedClassId !== 'all') {
        const { data: students } = await supabase
          .from('students')
          .select('id, first_name, last_name')
          .eq('class_id', selectedClassId);
        
        const studentMap = new Map(students?.map(s => [s.id, s]) || []);
        const studentIds = new Set(students?.map(s => s.id) || []);
        
        return (data as GradeHistoryRecord[])
          .filter(g => studentIds.has(g.student_id))
          .map(g => ({
            ...g,
            student: studentMap.get(g.student_id),
          }));
      }

      // Get all student names
      const studentIds = [...new Set(data.map(g => g.student_id))];
      const { data: students } = await supabase
        .from('students')
        .select('id, first_name, last_name')
        .in('id', studentIds);
      
      const studentMap = new Map(students?.map(s => [s.id, s]) || []);
      
      return (data as GradeHistoryRecord[]).map(g => ({
        ...g,
        student: studentMap.get(g.student_id),
      }));
    },
    enabled: !!user && open,
  });

  // Calculate preview of grade changes
  const generatePreview = () => {
    if (!gradeHistoryData) return;
    
    setIsCalculating(true);
    const newPreviews: RecalculationPreview[] = [];
    
    gradeHistoryData.forEach((record, index) => {
      // Determine if there was work (has raw scores or regents score)
      const hasWork = (record.raw_score_earned !== null && record.raw_score_earned > 0) ||
                      (record.regents_score !== null && record.regents_score > 0);
      
      // Calculate percentage from raw scores
      let percentage = 0;
      if (record.raw_score_possible && record.raw_score_possible > 0) {
        percentage = Math.round((record.raw_score_earned || 0) / record.raw_score_possible * 100);
      }
      
      // Calculate new grade using current settings
      const newGrade = calculateGrade(percentage, hasWork, record.regents_score ?? undefined);
      
      newPreviews.push({
        id: record.id,
        studentName: record.student
          ? getDisplayName(record.student_id, record.student.first_name, record.student.last_name)
          : 'Unknown Student',
        topicName: record.topic_name,
        oldGrade: record.grade,
        newGrade,
        changed: record.grade !== newGrade,
      });
      
      setProgress(Math.round(((index + 1) / gradeHistoryData.length) * 100));
    });
    
    setPreviews(newPreviews);
    // Auto-select all changed items
    setSelectedIds(new Set(newPreviews.filter(p => p.changed).map(p => p.id)));
    setPreviewMode(false);
    setIsCalculating(false);
    setProgress(0);
  };

  // Apply recalculation mutation
  const applyRecalculation = useMutation({
    mutationFn: async () => {
      const updates = previews
        .filter(p => selectedIds.has(p.id) && p.changed)
        .map(p => ({
          id: p.id,
          newGrade: p.newGrade,
        }));

      let completed = 0;
      for (const update of updates) {
        const { error } = await supabase
          .from('grade_history')
          .update({ grade: update.newGrade })
          .eq('id', update.id);
        
        if (error) throw error;
        
        completed++;
        setProgress(Math.round((completed / updates.length) * 100));
      }

      return updates.length;
    },
    onSuccess: (count) => {
      toast.success(`Updated ${count} grade${count !== 1 ? 's' : ''} successfully`);
      queryClient.invalidateQueries({ queryKey: ['gradeHistory'] });
      queryClient.invalidateQueries({ queryKey: ['grade-history-for-recalc'] });
      onOpenChange(false);
      resetDialog();
    },
    onError: (error) => {
      toast.error('Failed to update grades: ' + (error instanceof Error ? error.message : 'Unknown error'));
    },
  });

  const resetDialog = () => {
    setPreviewMode(true);
    setPreviews([]);
    setSelectedIds(new Set());
    setProgress(0);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllChanged = () => {
    setSelectedIds(new Set(previews.filter(p => p.changed).map(p => p.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const changedCount = previews.filter(p => p.changed).length;
  const selectedCount = selectedIds.size;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetDialog(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Recalculate Grades
          </DialogTitle>
          <DialogDescription>
            Recalculate existing grades using your current grade floor settings.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 space-y-4">
          {/* Current Settings Display */}
          <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm">
              <span className="font-medium">Current Settings:</span>
              <span className="ml-2">Grade Floor: {gradeFloor}</span>
              <span className="ml-3">With Effort: {gradeFloorWithEffort}</span>
            </div>
          </div>

          {previewMode ? (
            <>
              {/* Class Selection */}
              <div className="space-y-2">
                <Label>Select Class (or All)</Label>
                <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a class" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {classes?.map(cls => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Stats */}
              {gradeHistoryData && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-sm">
                  <p>
                    Found <strong>{gradeHistoryData.length}</strong> grade record{gradeHistoryData.length !== 1 ? 's' : ''} to analyze.
                  </p>
                  <p className="text-muted-foreground mt-1">
                    Click "Generate Preview" to see which grades would change with your current settings.
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Results Summary */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {changedCount > 0 ? (
                    <Badge variant="default" className="bg-amber-500">
                      {changedCount} grade{changedCount !== 1 ? 's' : ''} would change
                    </Badge>
                  ) : (
                    <Badge variant="secondary">No changes needed</Badge>
                  )}
                  <Badge variant="outline">
                    {selectedCount} selected
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAllChanged}>
                    Select Changed
                  </Button>
                  <Button variant="ghost" size="sm" onClick={deselectAll}>
                    Deselect All
                  </Button>
                </div>
              </div>

              {/* Preview List */}
              <ScrollArea className="h-[300px] border rounded-lg">
                <div className="p-2 space-y-1">
                  {previews.map(preview => (
                    <div
                      key={preview.id}
                      className={`flex items-center gap-3 p-2 rounded hover:bg-accent/50 ${
                        preview.changed ? '' : 'opacity-60'
                      }`}
                    >
                      <Checkbox
                        checked={selectedIds.has(preview.id)}
                        onCheckedChange={() => toggleSelect(preview.id)}
                        disabled={!preview.changed}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{preview.studentName}</p>
                        <p className="text-xs text-muted-foreground truncate">{preview.topicName}</p>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className={preview.changed ? 'text-muted-foreground line-through' : ''}>
                          {preview.oldGrade}
                        </span>
                        {preview.changed && (
                          <>
                            <span className="text-muted-foreground">→</span>
                            <span className={preview.newGrade > preview.oldGrade ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                              {preview.newGrade}
                            </span>
                            {preview.newGrade > preview.oldGrade ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-amber-500" />
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}

          {/* Progress Bar */}
          {(isCalculating || applyRecalculation.isPending) && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-sm text-center text-muted-foreground">
                {isCalculating ? 'Calculating...' : 'Updating grades...'} {progress}%
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          {previewMode ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={generatePreview}
                disabled={isLoadingHistory || !gradeHistoryData?.length || isCalculating}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isCalculating ? 'animate-spin' : ''}`} />
                Generate Preview
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={resetDialog}>
                Back
              </Button>
              <Button
                onClick={() => applyRecalculation.mutate()}
                disabled={selectedCount === 0 || applyRecalculation.isPending}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Apply {selectedCount} Change{selectedCount !== 1 ? 's' : ''}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
