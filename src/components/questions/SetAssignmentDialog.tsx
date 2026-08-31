import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Printer, FileDown, Check, Lock } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeForPDF, fixEncodingCorruption } from '@/lib/mathRenderer';
import {
  BAND_TO_SET,
  SET_NUMBERS,
  computeBandStop,
  computeSetChecks,
  deriveSetRanges,
  setCommonOverlap,
  type BankedQuestion,
  type QuestionBand,
  type SetRangeMap,
} from '@/lib/bandedWorksheet';
import { buildBandedSheetPdf } from '@/lib/bandedWorksheetPdf';

const formatPdfText = (text: string) => sanitizeForPDF(fixEncodingCorruption(text));

interface SetAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  className?: string;
}

interface RosterStudent {
  id: string;
  first_name: string;
  last_name: string;
}

interface BandedWorksheetRow {
  id: string;
  title: string;
  created_at: string;
  items: BankedQuestion[];
}

interface AssignmentRow {
  student_id: string;
  assigned_set: number;
  answers: Record<string, string>;
}

export function SetAssignmentDialog({ open, onOpenChange, classId, className }: SetAssignmentDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [worksheets, setWorksheets] = useState<BandedWorksheetRow[]>([]);
  const [worksheetId, setWorksheetId] = useState<string>('');
  const [assignments, setAssignments] = useState<Record<string, AssignmentRow>>({});

  const worksheet = worksheets.find((w) => w.id === worksheetId) || null;
  const items = worksheet?.items ?? [];
  const ranges: SetRangeMap = useMemo(() => deriveSetRanges(items.length || 10), [items.length]);
  const overlap = useMemo(() => setCommonOverlap(ranges), [ranges]);
  const setChecks = useMemo(() => computeSetChecks(items, ranges), [items, ranges]);

  const load = useCallback(async () => {
    if (!user || !classId) return;
    setLoading(true);
    try {
      const [studentRes, worksheetRes, assignmentRes] = await Promise.all([
        supabase.from('students').select('id, first_name, last_name').eq('class_id', classId).order('last_name'),
        supabase
          .from('worksheets')
          .select('id, title, created_at, questions, settings')
          .eq('teacher_id', user.id)
          .order('created_at', { ascending: false })
          .limit(40),
        supabase
          .from('banded_set_assignments')
          .select('student_id, assigned_set, answers')
          .eq('teacher_id', user.id)
          .eq('class_id', classId),
      ]);

      setStudents((studentRes.data || []) as RosterStudent[]);

      const banded = ((worksheetRes.data || []) as Record<string, unknown>[])
        .filter((w) => (w.settings as { mode?: string } | null)?.mode === 'banded-single-sheet')
        .map((w) => ({
          id: w.id as string,
          title: (w.title as string) || 'Practice',
          created_at: w.created_at as string,
          items: (((w.questions as unknown[]) || []) as Record<string, unknown>[]).map((q) => ({
            id: (q.questionId as string) || '',
            band: ((q.band as QuestionBand) || 'core') as QuestionBand,
            answer_group: (q.answerGroup as string) ?? null,
            prompt_text: (q.prompt as string) ?? null,
            answer_text: (q.answer as string) ?? null,
            prompt_image_url: null,
            answer_image_url: null,
            difficulty: null,
          })),
        }))
        .filter((w) => w.items.length > 0);
      setWorksheets(banded);
      setWorksheetId((prev) => (prev && banded.some((w) => w.id === prev) ? prev : banded[0]?.id || ''));

      const map: Record<string, AssignmentRow> = {};
      ((assignmentRes.data || []) as Record<string, unknown>[]).forEach((a) => {
        map[a.student_id as string] = {
          student_id: a.student_id as string,
          assigned_set: (a.assigned_set as number) || 1,
          answers: ((a.answers as Record<string, string>) || {}),
        };
      });
      setAssignments(map);
    } catch (error) {
      console.error('Set assignment load failed:', error);
      toast({ title: 'Could not load the roster', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [classId, toast, user]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const rangeFor = (set: number): [number, number] => ranges[set] || [1, items.length || 10];
  const assignedSetFor = (studentId: string) => assignments[studentId]?.assigned_set ?? 1;

  const setStudentSet = (studentId: string, set: number) => {
    setAssignments((prev) => ({
      ...prev,
      [studentId]: {
        student_id: studentId,
        assigned_set: set,
        answers: prev[studentId]?.answers || {},
      },
    }));
  };

  const setStudentAnswer = (studentId: string, itemNumber: number, value: string) => {
    setAssignments((prev) => {
      const current = prev[studentId] || { student_id: studentId, assigned_set: 1, answers: {} };
      return {
        ...prev,
        [studentId]: { ...current, answers: { ...current.answers, [String(itemNumber)]: value } },
      };
    });
  };

  const saveAll = async () => {
    if (!user || !classId) return;
    setSaving(true);
    try {
      const rows = students.map((s) => ({
        teacher_id: user.id,
        class_id: classId,
        student_id: s.id,
        worksheet_id: worksheetId || null,
        assigned_set: assignedSetFor(s.id),
        item_count: items.length || 10,
        answers: (assignments[s.id]?.answers || {}) as never,
      }));
      if (rows.length === 0) return;
      const { error } = await supabase
        .from('banded_set_assignments')
        .upsert(rows, { onConflict: 'teacher_id,class_id,student_id' });
      if (error) throw error;
      toast({ title: 'Saved', description: 'Set assignments and entered answers stored.' });
    } catch (error) {
      console.error('Saving set assignments failed:', error);
      toast({ title: 'Could not save', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  /** Teacher-only printable cards: student name and item range only. No set number, band or rank. */
  const printCards = () => {
    if (students.length === 0) return;
    const cards = students
      .map((s) => {
        const [from, to] = rangeFor(assignedSetFor(s.id));
        return `<div class="card"><div class="name">${s.first_name} ${s.last_name}</div><div class="range">Items ${from} to ${to}</div></div>`;
      })
      .join('');
    const win = window.open('', '_blank', 'width=900,height=1100');
    if (!win) {
      toast({ title: 'Pop-up blocked', description: 'Allow pop-ups to print the cards.', variant: 'destructive' });
      return;
    }
    win.document.write(`<!doctype html><html><head><title>Item cards</title><style>
      @page { size: letter; margin: 0.5in; }
      body { font-family: Helvetica, Arial, sans-serif; margin: 0; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
      .card { border: 1px solid #999; border-radius: 6px; padding: 12px 14px; page-break-inside: avoid; }
      .name { font-size: 13px; font-weight: 700; margin-bottom: 6px; }
      .range { font-size: 12px; }
    </style></head><body><div class="grid">${cards}</div>
    <script>window.onload = function(){ window.print(); }</script></body></html>`);
    win.document.close();
  };

  const downloadSheet = (student: RosterStudent) => {
    if (items.length === 0) return;
    const assignedSet = assignedSetFor(student.id);
    const pdf = buildBandedSheetPdf({
      items,
      title: worksheet?.title || 'Practice',
      formatText: formatPdfText,
      setChecks,
      assignedSet,
    });
    pdf.save(`sheet-${student.last_name}-${student.first_name}.pdf`.toLowerCase().replace(/\s+/g, '-'));
  };

  // ---- Band-stop report: deterministic key comparison, restricted to each student's range ----
  const report = students.map((s) => {
    const assignedSet = assignedSetFor(s.id);
    const stop = computeBandStop(items, rangeFor(assignedSet), assignments[s.id]?.answers || {});
    return { student: s, assignedSet, ...stop };
  });

  const [pendingSuggestions, setPendingSuggestions] = useState<Record<string, number>>({});

  const stageAllSuggestions = () => {
    const staged: Record<string, number> = {};
    report.forEach((r) => {
      if (r.suggestedSet && r.suggestedSet !== r.assignedSet) staged[r.student.id] = r.suggestedSet;
    });
    setPendingSuggestions(staged);
    toast({
      title: 'Staged for review',
      description: `${Object.keys(staged).length} suggestion(s) staged. Nothing changes until you confirm each one.`,
    });
  };

  const acceptSuggestion = (studentId: string, set: number) => {
    setStudentSet(studentId, set);
    setPendingSuggestions((prev) => {
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
  };

  const bandLabel = (b: QuestionBand | null) => (b ? b.charAt(0).toUpperCase() + b.slice(1) : 'None yet');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Set assignment &amp; placement{className ? ` — ${className}` : ''}</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5" />
            Teacher-only. Set assignments are never shown on a class-facing or projected screen.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : worksheets.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">
            No banded single sheet has been generated yet. Create one first, then come back to assign sets.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Label className="text-sm">Sheet</Label>
              <Select value={worksheetId} onValueChange={setWorksheetId}>
                <SelectTrigger className="w-[320px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {worksheets.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.title} · {w.items.length} items · {new Date(w.created_at).toLocaleDateString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="outline">
                {overlap ? `Common items ${overlap[0]}–${overlap[1]}` : 'No common items'}
              </Badge>
            </div>

            {!overlap && (
              <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-sm text-destructive">
                These ranges no longer share a common item. Every set must contain the common band so the
                sheets stay comparable — adjust the item count before assigning sets.
              </div>
            )}

            <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
              {SET_NUMBERS.map((s) => (
                <span key={s}>Set {s}: items {rangeFor(s)[0]}–{rangeFor(s)[1]}</span>
              ))}
            </div>

            <Tabs defaultValue="roster">
              <TabsList>
                <TabsTrigger value="roster">Roster</TabsTrigger>
                <TabsTrigger value="answers">Enter answers</TabsTrigger>
                <TabsTrigger value="report">Band-stop report</TabsTrigger>
              </TabsList>

              <TabsContent value="roster" className="space-y-3">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={printCards} disabled={students.length === 0}>
                    <Printer className="h-4 w-4 mr-2" /> Print item cards
                  </Button>
                </div>
                <div className="border rounded-lg overflow-y-auto max-h-[45vh]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead className="w-[130px]">Set</TableHead>
                        <TableHead className="w-[130px]">Items</TableHead>
                        <TableHead className="w-[110px]">Sheet</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {students.map((s) => {
                        const set = assignedSetFor(s.id);
                        const [from, to] = rangeFor(set);
                        return (
                          <TableRow key={s.id}>
                            <TableCell className="text-sm">{s.first_name} {s.last_name}</TableCell>
                            <TableCell>
                              <Select value={String(set)} onValueChange={(v) => setStudentSet(s.id, parseInt(v))}>
                                <SelectTrigger className="h-8 w-[90px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {SET_NUMBERS.map((n) => (
                                    <SelectItem key={n} value={String(n)}>Set {n}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{from} to {to}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" onClick={() => downloadSheet(s)}>
                                <FileDown className="h-4 w-4 mr-1" /> PDF
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="answers" className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Enter what the student wrote on the answer strip. Each entry is compared directly against
                  the stored answer key — nothing here judges method or working.
                </p>
                <div className="border rounded-lg overflow-y-auto max-h-[45vh] divide-y">
                  {students.map((s) => {
                    const [from, to] = rangeFor(assignedSetFor(s.id));
                    const numbers = Array.from({ length: to - from + 1 }, (_, i) => from + i);
                    return (
                      <div key={s.id} className="p-3 space-y-2">
                        <p className="text-sm font-medium">{s.first_name} {s.last_name}</p>
                        <div className="flex flex-wrap gap-2">
                          {numbers.map((n) => (
                            <div key={n} className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground w-5 text-right">{n}</span>
                              <Input
                                className="h-8 w-20 text-xs"
                                value={assignments[s.id]?.answers?.[String(n)] ?? ''}
                                onChange={(e) => setStudentAnswer(s.id, n, e.target.value)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="report" className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground max-w-xl">
                    Highest band answered correctly, computed only over each student's own item range. A band
                    that was not in range is never counted as missed. Suggestions are never applied on their own.
                  </p>
                  <Button variant="outline" size="sm" onClick={stageAllSuggestions}>
                    Stage all for review
                  </Button>
                </div>
                <div className="border rounded-lg overflow-y-auto max-h-[45vh]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Band reached</TableHead>
                        <TableHead>Current set</TableHead>
                        <TableHead>Suggested set</TableHead>
                        <TableHead className="w-[150px]">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.map((r) => {
                        const staged = pendingSuggestions[r.student.id];
                        const suggestion = staged ?? r.suggestedSet;
                        const differs = suggestion != null && suggestion !== r.assignedSet;
                        return (
                          <TableRow key={r.student.id}>
                            <TableCell className="text-sm">{r.student.first_name} {r.student.last_name}</TableCell>
                            <TableCell className="text-sm">{bandLabel(r.bandReached)}</TableCell>
                            <TableCell className="text-sm">Set {r.assignedSet}</TableCell>
                            <TableCell className="text-sm">
                              {suggestion ? `Set ${suggestion}` : '—'}
                              {staged ? <Badge variant="outline" className="ml-2">staged</Badge> : null}
                            </TableCell>
                            <TableCell>
                              {differs ? (
                                <div className="flex gap-1">
                                  <Button size="sm" variant="outline" onClick={() => acceptSuggestion(r.student.id, suggestion as number)}>
                                    <Check className="h-3.5 w-3.5 mr-1" /> Accept
                                  </Button>
                                  {staged ? (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() =>
                                        setPendingSuggestions((prev) => {
                                          const next = { ...prev };
                                          delete next[r.student.id];
                                          return next;
                                        })
                                      }
                                    >
                                      Dismiss
                                    </Button>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">No change</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Mapping: foundation → Set {BAND_TO_SET.foundation}, core → Set {BAND_TO_SET.core},
                  extension → Set {BAND_TO_SET.extension}, depth → Set {BAND_TO_SET.depth}.
                </p>
              </TabsContent>
            </Tabs>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={saveAll} disabled={saving || students.length === 0}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save assignments
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
