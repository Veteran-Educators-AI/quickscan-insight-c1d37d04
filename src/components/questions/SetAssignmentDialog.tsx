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
import {
  BAND_TO_VARIANT,
  VARIANTS,
  computeBandStop,
  computeVariantCheck,
  variantFromIndex,
  variantIndex,
  type BankedQuestion,
  type QuestionBand,
  type VariantLetter,
} from '@/lib/bandedWorksheet';
import { buildAnswerKeysPdf, buildClassSetPdf, buildStudentSheetPdf } from '@/lib/bandedWorksheetPdf';

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

interface VariantWorksheetRow {
  id: string;
  title: string;
  created_at: string;
  /** Items per variant letter. */
  variants: Record<VariantLetter, BankedQuestion[]>;
  anchorPositions: number[];
}

interface AssignmentRow {
  student_id: string;
  /** 1-4, mapping to variants A-D. */
  assigned_set: number;
  answers: Record<string, string>;
}

export function SetAssignmentDialog({ open, onOpenChange, classId, className }: SetAssignmentDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [worksheets, setWorksheets] = useState<VariantWorksheetRow[]>([]);
  const [worksheetId, setWorksheetId] = useState<string>('');
  const [assignments, setAssignments] = useState<Record<string, AssignmentRow>>({});

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
        .filter((w) => (w.settings as { mode?: string } | null)?.mode === 'banded-variants')
        .map((w) => {
          const settings = (w.settings || {}) as { anchorPositions?: number[] };
          const variants: Record<VariantLetter, BankedQuestion[]> = { A: [], B: [], C: [], D: [] };
          (((w.questions as unknown[]) || []) as Record<string, unknown>[]).forEach((q) => {
            const letter = (q.variant as VariantLetter) || 'A';
            if (!VARIANTS.includes(letter)) return;
            variants[letter].push({
              id: (q.questionId as string) || '',
              band: ((q.band as QuestionBand) || 'core') as QuestionBand,
              answer_group: (q.answerGroup as string) ?? null,
              prompt_text: (q.prompt as string) ?? null,
              answer_text: (q.answer as string) ?? null,
              prompt_image_url: null,
              answer_image_url: null,
              difficulty: null,
            });
          });
          return {
            id: w.id as string,
            title: (w.title as string) || 'Practice',
            created_at: w.created_at as string,
            variants,
            anchorPositions: settings.anchorPositions || [1, 4, 7, 10],
          };
        })
        .filter((w) => VARIANTS.every((v) => w.variants[v].length > 0));

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
      console.error('Variant assignment load failed:', error);
      toast({ title: 'Could not load the roster', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [classId, toast, user]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const variantFor = (studentId: string): VariantLetter =>
    variantFromIndex(assignments[studentId]?.assigned_set ?? 1);

  const itemsFor = (studentId: string): BankedQuestion[] =>
    worksheet ? worksheet.variants[variantFor(studentId)] : [];

  const setStudentVariant = (studentId: string, letter: VariantLetter) => {
    setAssignments((prev) => ({
      ...prev,
      [studentId]: {
        student_id: studentId,
        assigned_set: variantIndex(letter),
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
        assigned_set: variantIndex(variantFor(s.id)),
        item_count: itemsFor(s.id).length || 10,
        answers: (assignments[s.id]?.answers || {}) as never,
      }));
      if (rows.length === 0) return;
      const { error } = await supabase
        .from('banded_set_assignments')
        .upsert(rows, { onConflict: 'teacher_id,class_id,student_id' });
      if (error) throw error;
      toast({ title: 'Saved', description: 'Variant assignments and entered answers stored.' });
    } catch (error) {
      console.error('Saving variant assignments failed:', error);
      toast({ title: 'Could not save', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  /** Teacher-only printable cards: student name and variant letter only. No bands, mix or rank. */
  const printCards = () => {
    if (students.length === 0) return;
    const cards = students
      .map(
        (s) =>
          `<div class="card"><div class="name">${s.first_name} ${s.last_name}</div><div class="variant">Variant ${variantFor(s.id)}</div></div>`,
      )
      .join('');
    const win = window.open('', '_blank', 'width=900,height=1100');
    if (!win) {
      toast({ title: 'Pop-up blocked', description: 'Allow pop-ups to print the cards.', variant: 'destructive' });
      return;
    }
    win.document.write(`<!doctype html><html><head><title>Variant cards</title><style>
      @page { size: letter; margin: 0.5in; }
      body { font-family: Helvetica, Arial, sans-serif; margin: 0; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
      .card { border: 1px solid #999; border-radius: 6px; padding: 12px 14px; page-break-inside: avoid; }
      .name { font-size: 13px; font-weight: 700; margin-bottom: 6px; }
      .variant { font-size: 12px; }
    </style></head><body><div class="grid">${cards}</div>
    <script>window.onload = function(){ window.print(); }</script></body></html>`);
    win.document.close();
  };

  const downloadSheet = (student: RosterStudent) => {
    const items = itemsFor(student.id);
    if (items.length === 0) return;
    const pdf = buildStudentSheetPdf(
      {
        studentName: `${student.first_name} ${student.last_name}`,
        variant: variantFor(student.id),
        items,
        check: computeVariantCheck(items),
      },
      { title: worksheet?.title || 'Practice', formatText: formatPdfText },
    );
    pdf.save(`sheet-${student.last_name}-${student.first_name}.pdf`.toLowerCase().replace(/\s+/g, '-'));
  };

  /** One PDF, one sheet per student, ordered by surname. The main output. */
  const downloadClassSet = () => {
    if (!worksheet || students.length === 0) return;
    const sheets = students.map((s) => {
      const items = worksheet.variants[variantFor(s.id)];
      return {
        studentName: `${s.first_name} ${s.last_name}`,
        variant: variantFor(s.id),
        items,
        check: computeVariantCheck(items),
        sortKey: `${s.last_name} ${s.first_name}`.toLowerCase(),
      };
    });
    const pdf = buildClassSetPdf(sheets, { title: worksheet.title, formatText: formatPdfText });
    pdf.save(`class-set-${worksheet.title.replace(/\s+/g, '-').toLowerCase()}.pdf`);
    toast({ title: 'Class set ready', description: `${sheets.length} sheets, ordered by surname.` });
  };

  const downloadAnswerKeys = () => {
    if (!worksheet) return;
    const variants = VARIANTS.map((letter) => {
      const items = worksheet.variants[letter];
      const totals = { foundation: 0, core: 0, extension: 0, depth: 0 };
      items.forEach((q) => { totals[q.band] += 1; });
      return {
        variant: letter,
        items,
        anchorPositions: worksheet.anchorPositions,
        totals,
        check: computeVariantCheck(items),
      };
    });
    const pdf = buildAnswerKeysPdf(variants, { title: worksheet.title, formatText: formatPdfText });
    pdf.save(`answer-keys-${worksheet.title.replace(/\s+/g, '-').toLowerCase()}.pdf`);
  };

  // ---- Placement report: deterministic key comparison over the student's own variant ----
  const report = students.map((s) => {
    const items = itemsFor(s.id);
    const stop = computeBandStop(items, assignments[s.id]?.answers || {});
    return { student: s, currentVariant: variantFor(s.id), ...stop };
  });

  const [pendingSuggestions, setPendingSuggestions] = useState<Record<string, VariantLetter>>({});

  const stageAllSuggestions = () => {
    const staged: Record<string, VariantLetter> = {};
    report.forEach((r) => {
      if (r.suggestedVariant && r.suggestedVariant !== r.currentVariant) staged[r.student.id] = r.suggestedVariant;
    });
    setPendingSuggestions(staged);
    toast({
      title: 'Staged for review',
      description: `${Object.keys(staged).length} suggestion(s) staged. Nothing changes until you confirm each one.`,
    });
  };

  const acceptSuggestion = (studentId: string, letter: VariantLetter) => {
    setStudentVariant(studentId, letter);
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
          <DialogTitle>Variant assignment &amp; placement{className ? ` — ${className}` : ''}</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5" />
            Teacher-only. Variant assignments are never shown on a class-facing or projected screen.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : worksheets.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">
            No variant set has been generated yet. Build the four variants first, then come back to assign them.
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
                      {w.title} · 4 variants · {new Date(w.created_at).toLocaleDateString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="outline">Anchors at items {worksheet?.anchorPositions.join(', ')}</Badge>
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
                  <Button variant="outline" size="sm" onClick={downloadAnswerKeys}>
                    <FileDown className="h-4 w-4 mr-2" /> Four answer keys
                  </Button>
                  <Button variant="outline" size="sm" onClick={printCards} disabled={students.length === 0}>
                    <Printer className="h-4 w-4 mr-2" /> Print variant cards
                  </Button>
                </div>
                <div className="border rounded-lg overflow-y-auto max-h-[45vh]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead className="w-[150px]">Variant</TableHead>
                        <TableHead className="w-[110px]">Sheet</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {students.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="text-sm">{s.first_name} {s.last_name}</TableCell>
                          <TableCell>
                            <Select
                              value={variantFor(s.id)}
                              onValueChange={(v) => setStudentVariant(s.id, v as VariantLetter)}
                            >
                              <SelectTrigger className="h-8 w-[110px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {VARIANTS.map((letter) => (
                                  <SelectItem key={letter} value={letter}>Variant {letter}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
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
                  Enter what the student wrote on the answer strip. Each entry is compared directly against
                  the stored answer key for their own variant — nothing here judges method or working.
                </p>
                <div className="border rounded-lg overflow-y-auto max-h-[45vh] divide-y">
                  {students.map((s) => {
                    const count = itemsFor(s.id).length;
                    return (
                      <div key={s.id} className="p-3 space-y-2">
                        <p className="text-sm font-medium">
                          {s.first_name} {s.last_name}
                          <span className="ml-2 text-xs text-muted-foreground">Variant {variantFor(s.id)}</span>
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
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
                    Highest band answered correctly, computed only over the items on that student's own
                    variant. A band they never saw is never counted as missed. Suggestions are never applied
                    on their own.
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
                        <TableHead>Current variant</TableHead>
                        <TableHead>Suggested variant</TableHead>
                        <TableHead className="w-[150px]">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.map((r) => {
                        const staged = pendingSuggestions[r.student.id];
                        const suggestion = staged ?? r.suggestedVariant;
                        const differs = suggestion != null && suggestion !== r.currentVariant;
                        return (
                          <TableRow key={r.student.id}>
                            <TableCell className="text-sm">{r.student.first_name} {r.student.last_name}</TableCell>
                            <TableCell className="text-sm">{bandLabel(r.bandReached)}</TableCell>
                            <TableCell className="text-sm">Variant {r.currentVariant}</TableCell>
                            <TableCell className="text-sm">
                              {suggestion ? `Variant ${suggestion}` : '—'}
                              {staged ? <Badge variant="outline" className="ml-2">staged</Badge> : null}
                            </TableCell>
                            <TableCell>
                              {differs ? (
                                <div className="flex gap-1">
                                  <Button size="sm" variant="outline" onClick={() => acceptSuggestion(r.student.id, suggestion as VariantLetter)}>
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
                  Mapping: foundation → Variant {BAND_TO_VARIANT.foundation}, core → Variant {BAND_TO_VARIANT.core},
                  extension → Variant {BAND_TO_VARIANT.extension}, depth → Variant {BAND_TO_VARIANT.depth}.
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
