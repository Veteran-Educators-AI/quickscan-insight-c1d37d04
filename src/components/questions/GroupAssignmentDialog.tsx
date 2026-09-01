import { useCallback, useEffect, useState } from 'react';
import { Loader2, Printer, FileDown, Check, Lock, Layers } from 'lucide-react';
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
import { formatCheckValue, type BankedQuestion, type QuestionBand } from '@/lib/bandedWorksheet';
import {
  BAND_TO_GROUP,
  GROUPS,
  computeGroupBandStop,
  formatItemList,
  type GroupNumber,
  type GroupPlan,
} from '@/lib/bandedCommonSheet';
import { buildCommonAnswerKeyPdf, buildCommonClassSetPdf, buildCommonSheetPdf } from '@/lib/bandedCommonSheetPdf';

const formatPdfText = (text: string) => sanitizeForPDF(fixEncodingCorruption(text));

interface GroupAssignmentDialogProps {
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

interface CommonWorksheetRow {
  id: string;
  title: string;
  created_at: string;
  items: BankedQuestion[];
  groups: GroupPlan[];
}

interface AssignmentRow {
  student_id: string;
  /** 1-4, the group number. */
  assigned_set: number;
  answers: Record<string, string>;
}

export function GroupAssignmentDialog({ open, onOpenChange, classId, className }: GroupAssignmentDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [worksheets, setWorksheets] = useState<CommonWorksheetRow[]>([]);
  const [worksheetId, setWorksheetId] = useState<string>('');
  const [assignments, setAssignments] = useState<Record<string, AssignmentRow>>({});
  const [pendingSuggestions, setPendingSuggestions] = useState<Record<string, GroupNumber>>({});

  const worksheet = worksheets.find((w) => w.id === worksheetId) || null;

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

      const parsed = ((worksheetRes.data || []) as Record<string, unknown>[])
        .filter((w) => (w.settings as { mode?: string } | null)?.mode === 'banded-common')
        .map((w) => {
          const settings = (w.settings || {}) as { groups?: GroupPlan[] };
          const items = (((w.questions as unknown[]) || []) as Record<string, unknown>[]).map((q) => ({
            id: (q.questionId as string) || '',
            band: ((q.band as QuestionBand) || 'core') as QuestionBand,
            answer_group: (q.answerGroup as string) ?? null,
            prompt_text: (q.prompt as string) ?? null,
            answer_text: (q.answer as string) ?? null,
            prompt_image_url: null,
            answer_image_url: null,
            difficulty: null,
            topicNames: (q.topicNames as string[]) || [],
          }));
          return {
            id: w.id as string,
            title: (w.title as string) || 'Practice',
            created_at: w.created_at as string,
            items,
            groups: settings.groups || [],
          };
        })
        .filter((w) => w.items.length > 0 && w.groups.length === GROUPS.length);

      setWorksheets(parsed);
      setWorksheetId((prev) => (prev && parsed.some((w) => w.id === prev) ? prev : parsed[0]?.id || ''));

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
      console.error('Group assignment load failed:', error);
      toast({ title: 'Could not load the roster', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [classId, toast, user]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const groupFor = (studentId: string): GroupNumber => {
    const n = assignments[studentId]?.assigned_set ?? 1;
    return (Math.min(4, Math.max(1, n)) as GroupNumber);
  };

  const planFor = (studentId: string): GroupPlan | null =>
    worksheet?.groups.find((g) => g.group === groupFor(studentId)) || null;

  const setStudentGroup = (studentId: string, group: GroupNumber) => {
    setAssignments((prev) => ({
      ...prev,
      [studentId]: {
        student_id: studentId,
        assigned_set: group,
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
        assigned_set: groupFor(s.id),
        item_count: worksheet?.items.length || 10,
        answers: (assignments[s.id]?.answers || {}) as never,
      }));
      if (rows.length === 0) return;
      const { error } = await supabase
        .from('banded_set_assignments')
        .upsert(rows, { onConflict: 'teacher_id,class_id,student_id' });
      if (error) throw error;
      toast({ title: 'Saved', description: 'Group assignments and entered answers stored.' });
    } catch (error) {
      console.error('Saving group assignments failed:', error);
      toast({ title: 'Could not save', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  /** Teacher-only cards: name, item list in plain words, and that student's CHECK total. */
  const printCards = () => {
    if (students.length === 0 || !worksheet) return;
    const cards = students
      .map((s) => {
        const plan = planFor(s.id);
        const list = plan ? formatItemList(plan.items) : '';
        const check = plan ? formatCheckValue(plan.check) : '\u2014';
        return `<div class="card"><div class="name">${s.first_name} ${s.last_name}</div><div class="items">${list}</div><div class="check">Your completed answers should total ${check}</div></div>`;
      })
      .join('');
    const win = window.open('', '_blank', 'width=900,height=1100');
    if (!win) {
      toast({ title: 'Pop-up blocked', description: 'Allow pop-ups to print the cards.', variant: 'destructive' });
      return;
    }
    win.document.write(`<!doctype html><html><head><title>Item list cards</title><style>
      @page { size: letter; margin: 0.5in; }
      body { font-family: Helvetica, Arial, sans-serif; margin: 0; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
      .card { border: 1px solid #999; border-radius: 6px; padding: 12px 14px; page-break-inside: avoid; }
      .name { font-size: 13px; font-weight: 700; margin-bottom: 6px; }
      .items { font-size: 12px; margin-bottom: 4px; }
      .check { font-size: 11px; }
    </style></head><body><div class="grid">${cards}</div>
    <script>window.onload = function(){ window.print(); }</script></body></html>`);
    win.document.close();
  };

  const downloadSheet = (student: RosterStudent) => {
    if (!worksheet) return;
    const pdf = buildCommonSheetPdf(
      `${student.first_name} ${student.last_name}`,
      worksheet.items,
      { title: worksheet.title, formatText: formatPdfText },
    );
    pdf.save(`sheet-${student.last_name}-${student.first_name}.pdf`.toLowerCase().replace(/\s+/g, '-'));
  };

  const downloadClassSet = () => {
    if (!worksheet || students.length === 0) return;
    const pdf = buildCommonClassSetPdf(
      students.map((s) => ({
        studentName: `${s.first_name} ${s.last_name}`,
        sortKey: `${s.last_name} ${s.first_name}`.toLowerCase(),
      })),
      worksheet.items,
      { title: worksheet.title, formatText: formatPdfText },
    );
    pdf.save(`class-set-${worksheet.title.replace(/\s+/g, '-').toLowerCase()}.pdf`);
    toast({ title: 'Class set ready', description: `${students.length} identical sheets, ordered by surname.` });
  };

  const downloadAnswerKey = () => {
    if (!worksheet) return;
    const pdf = buildCommonAnswerKeyPdf(worksheet.items, worksheet.groups, {
      title: worksheet.title,
      formatText: formatPdfText,
    });
    pdf.save(`answer-key-${worksheet.title.replace(/\s+/g, '-').toLowerCase()}.pdf`);
  };

  // ---- Placement report over each student's own six items only ----
  const report = students.map((s) => {
    const plan = planFor(s.id);
    const stop = computeGroupBandStop(
      worksheet?.items || [],
      plan?.items || [],
      assignments[s.id]?.answers || {},
    );
    return { student: s, currentGroup: groupFor(s.id), plan, ...stop };
  });

  const stageAllSuggestions = () => {
    const staged: Record<string, GroupNumber> = {};
    report.forEach((r) => {
      if (r.suggestedGroup && r.suggestedGroup !== r.currentGroup) staged[r.student.id] = r.suggestedGroup;
    });
    setPendingSuggestions(staged);
    toast({
      title: 'Staged for review',
      description: `${Object.keys(staged).length} suggestion(s) staged. Nothing changes until you confirm each one.`,
    });
  };

  const acceptSuggestion = (studentId: string, group: GroupNumber) => {
    setStudentGroup(studentId, group);
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
          <DialogTitle>Group assignment &amp; placement{className ? ` — ${className}` : ''}</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5" />
            Teacher-only. Group assignments and item lists are never shown on a class-facing or projected screen.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : worksheets.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">
            No common sheet has been generated yet. Build the common sheet first, then come back to assign groups.
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
                      {w.title} · common sheet · {new Date(w.created_at).toLocaleDateString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="outline">{worksheet?.items.length || 0} shared items</Badge>
            </div>

            <Tabs defaultValue="roster">
              <TabsList>
                <TabsTrigger value="roster">Roster</TabsTrigger>
                <TabsTrigger value="answers">Enter answers</TabsTrigger>
                <TabsTrigger value="report">Placement report</TabsTrigger>
              </TabsList>

              <TabsContent value="roster" className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={downloadClassSet} disabled={students.length === 0}>
                    <Layers className="h-4 w-4 mr-2" /> Print class set (one PDF)
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadAnswerKey}>
                    <FileDown className="h-4 w-4 mr-2" /> Answer key
                  </Button>
                  <Button variant="outline" size="sm" onClick={printCards} disabled={students.length === 0}>
                    <Printer className="h-4 w-4 mr-2" /> Print item-list cards
                  </Button>
                </div>
                <div className="border rounded-lg overflow-y-auto max-h-[45vh]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead className="w-[130px]">Group</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead className="w-[110px]">Sheet</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {students.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="text-sm">{s.first_name} {s.last_name}</TableCell>
                          <TableCell>
                            <Select
                              value={String(groupFor(s.id))}
                              onValueChange={(v) => setStudentGroup(s.id, Number(v) as GroupNumber)}
                            >
                              <SelectTrigger className="h-8 w-[100px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {GROUPS.map((g) => (
                                  <SelectItem key={g} value={String(g)}>Group {g}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {planFor(s.id)?.items.join(', ') || '—'}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => downloadSheet(s)}>
                              <FileDown className="h-4 w-4 mr-1" /> PDF
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="answers" className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Enter what the student wrote on the answer strip for the items in their own group. Each entry is
                  compared directly against the stored answer key — nothing here judges method or working.
                </p>
                <div className="border rounded-lg overflow-y-auto max-h-[45vh] divide-y">
                  {students.map((s) => {
                    const plan = planFor(s.id);
                    return (
                      <div key={s.id} className="p-3 space-y-2">
                        <p className="text-sm font-medium">
                          {s.first_name} {s.last_name}
                          <span className="ml-2 text-xs text-muted-foreground">Group {groupFor(s.id)}</span>
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {(plan?.items || []).map((n) => (
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
                    Highest band answered correctly, computed only over the six items in that student's own group.
                    A band they never saw is never counted as missed. Suggestions are never applied on their own.
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
                        <TableHead>Current group</TableHead>
                        <TableHead>Suggested group</TableHead>
                        <TableHead className="w-[150px]">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.map((r) => {
                        const staged = pendingSuggestions[r.student.id];
                        const suggestion = staged ?? r.suggestedGroup;
                        const differs = suggestion != null && suggestion !== r.currentGroup;
                        return (
                          <TableRow key={r.student.id}>
                            <TableCell className="text-sm">{r.student.first_name} {r.student.last_name}</TableCell>
                            <TableCell className="text-sm">{bandLabel(r.bandReached)}</TableCell>
                            <TableCell className="text-sm">Group {r.currentGroup}</TableCell>
                            <TableCell className="text-sm">
                              {suggestion ? `Group ${suggestion}` : '—'}
                              {staged ? <Badge variant="outline" className="ml-2">staged</Badge> : null}
                            </TableCell>
                            <TableCell>
                              {differs ? (
                                <div className="flex gap-1">
                                  <Button size="sm" variant="outline" onClick={() => acceptSuggestion(r.student.id, suggestion as GroupNumber)}>
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
                  Mapping: foundation → Group {BAND_TO_GROUP.foundation}, core → Group {BAND_TO_GROUP.core},
                  extension → Group {BAND_TO_GROUP.extension}, depth → Group {BAND_TO_GROUP.depth}.
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
