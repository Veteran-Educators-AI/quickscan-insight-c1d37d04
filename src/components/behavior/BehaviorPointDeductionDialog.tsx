import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, MinusCircle, AlertTriangle, Coins, Star } from 'lucide-react';
import { toast } from 'sonner';
import { useStudentNames } from '@/lib/StudentNameContext';

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  class_id: string;
  class_name?: string;
}

interface BehaviorPointDeductionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedStudentId?: string;
  preselectedClassId?: string;
}

const PRESET_REASONS = [
  { label: 'Disrupting class', xp: 10, coins: 5 },
  { label: 'Late to class', xp: 5, coins: 2 },
  { label: 'Missing homework', xp: 15, coins: 5 },
  { label: 'Off-task behavior', xp: 10, coins: 5 },
  { label: 'Phone/device violation', xp: 20, coins: 10 },
  { label: 'Disrespectful behavior', xp: 25, coins: 15 },
  { label: 'Other', xp: 0, coins: 0 },
];

export function BehaviorPointDeductionDialog({
  open,
  onOpenChange,
  preselectedStudentId,
  preselectedClassId,
}: BehaviorPointDeductionDialogProps) {
  const { getDisplayName } = useStudentNames();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [selectedClassId, setSelectedClassId] = useState(preselectedClassId || '');
  const [selectedStudentId, setSelectedStudentId] = useState(preselectedStudentId || '');
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [xpDeduction, setXpDeduction] = useState(10);
  const [coinDeduction, setCoinDeduction] = useState(5);
  const [notes, setNotes] = useState('');

  // Fetch classes
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
    enabled: !!user && open,
  });

  // Fetch students for selected class
  const { data: students } = useQuery({
    queryKey: ['students', selectedClassId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('id, first_name, last_name, class_id')
        .eq('class_id', selectedClassId)
        .order('last_name');
      if (error) throw error;
      return data as Student[];
    },
    enabled: !!selectedClassId && open,
  });

  // Mutation to send deduction to Scholar app
  const deductMutation = useMutation({
    mutationFn: async () => {
      const student = students?.find(s => s.id === selectedStudentId);
      if (!student) throw new Error('Student not found');

      const finalReason = reason === 'Other' ? customReason : reason;
      if (!finalReason.trim()) throw new Error('Please provide a reason');

      // Call the edge function to push behavior deduction
      const { data, error } = await supabase.functions.invoke('push-to-sister-app', {
        body: {
          type: 'behavior',
          student_id: selectedStudentId,
          student_name: `${student.first_name} ${student.last_name}`,
          class_id: selectedClassId,
          xp_deduction: xpDeduction,
          coin_deduction: coinDeduction,
          reason: finalReason,
          notes: notes,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to send deduction');

      // Also log locally (non-fatal if logging fails)
      try {
        await supabase.from('sister_app_sync_log').insert({
          teacher_id: user!.id,
          student_id: selectedStudentId,
          action: 'behavior_deduction',
          data: {
            reason: finalReason,
            xp_deducted: xpDeduction,
            coins_deducted: coinDeduction,
            notes: notes,
            student_name: `${student.first_name} ${student.last_name}`,
          },
          source_app: 'nycologic_ai',
          processed: true,
          processed_at: new Date().toISOString(),
        });
      } catch (logErr) {
        console.error('Non-fatal: Failed to log behavior deduction:', logErr);
      }

      return data;
    },
    onSuccess: () => {
      const student = students?.find(s => s.id === selectedStudentId);
      toast.success('Points deducted successfully', {
        description: `${student ? getDisplayName(student.id, student.first_name, student.last_name) : 'Student'}: -${xpDeduction} XP, -${coinDeduction} coins`,
      });
      queryClient.invalidateQueries({ queryKey: ['inbound-scholar-events'] });
      handleClose();
    },
    onError: (error) => {
      toast.error('Failed to deduct points', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const handleReasonChange = (value: string) => {
    setReason(value);
    const preset = PRESET_REASONS.find(p => p.label === value);
    if (preset && preset.label !== 'Other') {
      setXpDeduction(preset.xp);
      setCoinDeduction(preset.coins);
    }
  };

  const handleClose = () => {
    setSelectedClassId(preselectedClassId || '');
    setSelectedStudentId(preselectedStudentId || '');
    setReason('');
    setCustomReason('');
    setXpDeduction(10);
    setCoinDeduction(5);
    setNotes('');
    onOpenChange(false);
  };

  const selectedStudent = students?.find(s => s.id === selectedStudentId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MinusCircle className="h-5 w-5 text-destructive" />
            Deduct Scholar Points for Behavior
          </DialogTitle>
          <DialogDescription>
            Remove XP and coins from a student's Scholar AI account as a behavior consequence.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Class Selection */}
          <div className="space-y-2">
            <Label>Class</Label>
            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a class" />
              </SelectTrigger>
              <SelectContent>
                {classes?.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Student Selection */}
          <div className="space-y-2">
            <Label>Student</Label>
            <Select 
              value={selectedStudentId} 
              onValueChange={setSelectedStudentId}
              disabled={!selectedClassId}
            >
              <SelectTrigger>
                <SelectValue placeholder={selectedClassId ? "Select a student" : "Select a class first"} />
              </SelectTrigger>
              <SelectContent>
                <ScrollArea className="h-[200px]">
                  {students?.map((student) => (
                    <SelectItem key={student.id} value={student.id}>
                      {getDisplayName(student.id, student.first_name, student.last_name)}
                    </SelectItem>
                  ))}
                </ScrollArea>
              </SelectContent>
            </Select>
          </div>

          {/* Reason Selection */}
          <div className="space-y-2">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={handleReasonChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {PRESET_REASONS.map((preset) => (
                  <SelectItem key={preset.label} value={preset.label}>
                    <div className="flex items-center gap-2">
                      {preset.label}
                      {preset.label !== 'Other' && (
                        <span className="text-xs text-muted-foreground">
                          (-{preset.xp} XP, -{preset.coins} coins)
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom Reason */}
          {reason === 'Other' && (
            <div className="space-y-2">
              <Label>Custom Reason</Label>
              <Input
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Describe the behavior..."
              />
            </div>
          )}

          {/* Point Deductions */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Star className="h-4 w-4 text-amber-500" />
                XP to Remove
              </Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={xpDeduction}
                onChange={(e) => setXpDeduction(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Coins className="h-4 w-4 text-emerald-500" />
                Coins to Remove
              </Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={coinDeduction}
                onChange={(e) => setCoinDeduction(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Additional Notes (Optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional context..."
              rows={2}
            />
          </div>

          {/* Summary */}
          {selectedStudent && reason && (xpDeduction > 0 || coinDeduction > 0) && (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                <div>
                  <p className="font-medium text-sm">
                    {getDisplayName(selectedStudent.id, selectedStudent.first_name, selectedStudent.last_name)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Will lose{' '}
                    {xpDeduction > 0 && (
                      <Badge variant="outline" className="text-amber-600 mr-1">
                        -{xpDeduction} XP
                      </Badge>
                    )}
                    {coinDeduction > 0 && (
                      <Badge variant="outline" className="text-emerald-600">
                        -{coinDeduction} coins
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Reason: {reason === 'Other' ? customReason : reason}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => deductMutation.mutate()}
            disabled={
              !selectedStudentId || 
              !reason || 
              (reason === 'Other' && !customReason.trim()) ||
              (xpDeduction === 0 && coinDeduction === 0) ||
              deductMutation.isPending
            }
          >
            {deductMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <MinusCircle className="h-4 w-4 mr-2" />
            )}
            Deduct Points
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
