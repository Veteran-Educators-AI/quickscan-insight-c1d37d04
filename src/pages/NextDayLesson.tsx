// =============================================================================
// NEXT DAY'S LESSON
// =============================================================================
// One screen, reached from a class's results digest. It builds tomorrow's whole
// set from the results actually received, verifies the maths of every generated
// item, and lets the teacher edit everything before any download or send.
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Package,
  Presentation,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useStudentNames } from '@/lib/StudentNameContext';
import {
  buildAssignmentDigests,
  digestForGenerator,
  CALL_LABEL,
  type ScanRow,
} from '@/lib/resultsDigest';
import { whatThisFixes } from '@/hooks/useLessonPacks';
import { isoDate, nextSchoolDay } from '@/data/pacingCalendars';

import { verifyItems } from '@/lib/nextDayLesson/verifyMath';
import { buildGrouping, checkTotalFor } from '@/lib/nextDayLesson/grouping';
import type { NextDayDraft, WorksheetItemDraft } from '@/lib/nextDayLesson/types';
import {
  allFiles,
  answerKeyDocx,
  answerKeyPdf,
  download,
  exitTicketDocx,
  exitTicketKeyPdf,
  exitTicketPdf,
  lessonPlanDocx,
  lessonPlanPdf,
  presentationPdf,
  presentationPptx,
  teacherListDocx,
  teacherListPdf,
  whoDoesWhichPdf,
  whoDoesWhichPptx,
  worksheetDocx,
  worksheetPdf,
  zipAll,
} from '@/lib/nextDayLesson/exporters';

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return format(d, 'EEE MMM d, yyyy');
};

export default function NextDayLesson() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { getDisplayName } = useStudentNames();
  const worksheetCode = params.get('code') || '';

  const [nextLessonTitle, setNextLessonTitle] = useState('');
  const [nextLessonDate, setNextLessonDate] = useState(tomorrow());
  const [unitContext, setUnitContext] = useState('');
  const [standards, setStandards] = useState('');
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<NextDayDraft | null>(null);
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);


  const { data: classRow } = useQuery({
    queryKey: ['next-day-class', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('classes').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });

  const { data: roster } = useQuery({
    queryKey: ['next-day-roster', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('id, first_name, last_name, archived_at')
        .eq('class_id', id);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!id,
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ['next-day-results', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('paper_scan_results' as any)
        .select('*, students:student_id(id, first_name, last_name, email)')
        .eq('class_id', id)
        .order('scanned_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ScanRow[];
    },
    enabled: !!id,
  });

  const digests = useMemo(
    () => (rows?.length ? buildAssignmentDigests(rows, getDisplayName) : []),
    [rows, getDisplayName]
  );
  const digest = useMemo(
    () => digests.find((d) => d.worksheetCode === worksheetCode) || digests[0] || null,
    [digests, worksheetCode]
  );

  const className: string = classRow?.name || classRow?.class_name || 'This class';

  useEffect(() => {
    if (digest && !nextLessonTitle) {
      setNextLessonTitle(`Next lesson after ${digest.worksheetTitle}`);
    }
    if (digest && !standards && digest.standard) setStandards(digest.standard);
  }, [digest, nextLessonTitle, standards]);

  const rosterStudents = useMemo(
    () =>
      (roster || [])
        .filter((s) => !s.archived_at)
        .map((s) => ({ id: s.id, name: getDisplayName(s.id, s.first_name || '', s.last_name || '') })),
    [roster, getDisplayName]
  );

  const unverifiedItems = useMemo(() => {
    if (!draft) return [] as WorksheetItemDraft[];
    return [...draft.worksheet.items, ...draft.exitTicket.items].filter((i) => !i.verified);
  }, [draft]);

  const generate = async () => {
    if (!digest) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-next-day-lesson', {
        body: {
          digest: digestForGenerator(digest),
          classContext: {
            className,
            subject: classRow?.subject || 'Mathematics',
            unit: unitContext,
            standards: standards.split(',').map((s) => s.trim()).filter(Boolean),
            nextLessonTitle,
            nextLessonDate,
          },
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const generated = (data as any).draft;
      const worksheetItems = verifyItems(
        (generated.worksheet?.items || []).map((i: any, index: number) => ({
          itemNumber: Number(i.itemNumber ?? index + 1),
          prompt: String(i.prompt || ''),
          answer: String(i.answer ?? i.answerNumeric ?? ''),
          answerNumeric: typeof i.answerNumeric === 'number' ? i.answerNumeric : Number(i.answerNumeric) || null,
          verify: String(i.verify || ''),
          verifyExpected:
            typeof i.verifyExpected === 'number' ? i.verifyExpected : Number(i.verifyExpected) || null,
          skillTag: i.skillTag || null,
          isRepair: !!i.isRepair,
          errorTagIfWrong: String(i.errorTagIfWrong || ''),
          workedSolution: i.workedSolution || '',
        }))
      );
      const exitItems = verifyItems(
        (generated.exitTicket?.items || []).map((i: any, index: number) => ({
          itemNumber: Number(i.itemNumber ?? index + 1),
          prompt: String(i.prompt || ''),
          answer: String(i.answer ?? i.answerNumeric ?? ''),
          answerNumeric: typeof i.answerNumeric === 'number' ? i.answerNumeric : Number(i.answerNumeric) || null,
          verify: String(i.verify || ''),
          verifyExpected:
            typeof i.verifyExpected === 'number' ? i.verifyExpected : Number(i.verifyExpected) || null,
          skillTag: i.skillTag || null,
          isRepair: false,
          errorTagIfWrong: String(i.errorTagIfWrong || ''),
          workedSolution: i.workedSolution || '',
        }))
      );

      const grouping = buildGrouping(digest, worksheetItems, rosterStudents);

      setDraft({
        classId: id!,
        className,
        builtFrom: {
          className,
          worksheetCode: digest.worksheetCode,
          worksheetTitle: digest.worksheetTitle,
          worksheetDate: digest.worksheetDate,
          papers: digest.papers,
          studentCount: digest.studentCount,
          generatedAt: new Date().toISOString(),
        },
        lessonPlan: {
          title: generated.lessonPlan?.title || nextLessonTitle,
          aim: generated.lessonPlan?.aim || '',
          objective: generated.lessonPlan?.objective || '',
          standards: generated.lessonPlan?.standards || standards.split(',').map((s) => s.trim()).filter(Boolean),
          durationMinutes: Number(generated.lessonPlan?.durationMinutes) || 45,
          builtFrom: generated.lessonPlan?.builtFrom || '',
          timeline: generated.lessonPlan?.timeline || [],
          reteach: {
            summary: generated.lessonPlan?.reteach?.summary || '',
            items: generated.lessonPlan?.reteach?.items || [],
            script: generated.lessonPlan?.reteach?.script || [],
          },
          materials: generated.lessonPlan?.materials || [],
          differentiationNotes: generated.lessonPlan?.differentiationNotes || [],
          assessmentNote: generated.lessonPlan?.assessmentNote || '',
        },
        slides: (generated.slides || []).map((s: any, index: number) => ({
          slideNumber: Number(s.slideNumber ?? index + 1),
          kind: s.kind || 'teaching',
          title: String(s.title || ''),
          bullets: Array.isArray(s.bullets) ? s.bullets.map((b: any) => String(b)) : [],
          speakerNotes: String(s.speakerNotes || ''),
        })),
        worksheet: {
          title: generated.worksheet?.title || nextLessonTitle,
          instructions: generated.worksheet?.instructions || '',
          items: worksheetItems,
        },
        exitTicket: {
          title: generated.exitTicket?.title || 'Exit ticket',
          items: exitItems,
        },
        grouping,
        nextLessonTitle,
        nextLessonDate,
      });
      toast.success('Draft ready — review it, then download.');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Could not build the lesson.');
    } finally {
      setGenerating(false);
    }
  };

  /** Re-verify and recompute check totals whenever an answer is edited. */
  const patchWorksheetItem = (index: number, patch: Partial<WorksheetItemDraft>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const items = verifyItems(
        prev.worksheet.items.map((item, i) => (i === index ? { ...item, ...patch } : item))
      );
      const grouping = {
        ...prev.grouping,
        groups: prev.grouping.groups.map((g) => ({ ...g, checkTotal: checkTotalFor(items, g.itemNumbers) })),
      };
      return { ...prev, worksheet: { ...prev.worksheet, items }, grouping };
    });
  };

  const patchExitItem = (index: number, patch: Partial<WorksheetItemDraft>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const items = verifyItems(prev.exitTicket.items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
      return { ...prev, exitTicket: { ...prev.exitTicket, items } };
    });
  };

  const patchSlide = (index: number, patch: Partial<NextDayDraft['slides'][number]>) => {
    setDraft((prev) =>
      prev ? { ...prev, slides: prev.slides.map((s, i) => (i === index ? { ...s, ...patch } : s)) } : prev
    );
  };

  const run = async (key: string, factory: () => Promise<any> | any) => {
    if (!draft) return;
    if (unverifiedItems.length > 0) {
      toast.error('Fix or remove the unchecked items first — nothing goes out with unverified maths.');
      return;
    }
    setBusyFile(key);
    try {
      const file = await factory();
      download(file);
    } catch (error) {
      console.error(error);
      toast.error('That file could not be built.');
    } finally {
      setBusyFile(null);
    }
  };

  // ------------------------------------------------------------------ no results
  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-6 text-sm text-muted-foreground">Loading results…</div>
      </AppLayout>
    );
  }

  if (!digest) {
    return (
      <AppLayout>
        <div className="space-y-4 p-6">
          <Button variant="ghost" onClick={() => navigate(`/classes/${id}`)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to the class
          </Button>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                No results received yet
              </CardTitle>
              <CardDescription>
                {className} has no scored results in the system, so there is nothing to build tomorrow's lesson from.
                Nothing generic is generated. As soon as scored papers arrive, come back here.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const reteachItems = digest.items.filter((i) => i.call === 'reteach');

  return (
    <AppLayout>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/classes/${id}`)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to the class
            </Button>
            <h1 className="mt-2 text-2xl font-bold">Next day's lesson</h1>
            <p className="text-sm text-muted-foreground">
              Built only from {className}'s results: {digest.worksheetTitle} ({digest.worksheetCode}) ·{' '}
              {digest.papers} paper{digest.papers === 1 ? '' : 's'} from {digest.studentCount} student
              {digest.studentCount === 1 ? '' : 's'}
              {digest.worksheetDate ? ` · ${format(new Date(digest.worksheetDate), 'EEE MMM d, yyyy')}` : ''}
            </p>
          </div>
          <Badge variant="outline" className="text-xs">Editable draft — nothing is sent until you press send</Badge>
        </div>

        {/* what today showed */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What today showed</CardTitle>
            <CardDescription>
              {reteachItems.length > 0
                ? `Reteach: items ${reteachItems.map((i) => `${i.itemNumber} (${i.percentCorrect}%)`).join(', ')}`
                : 'No item fell below 40% — the repair items will come from the shaky ones.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {digest.items.map((item) => (
              <Badge key={item.itemNumber} variant={item.call === 'reteach' ? 'destructive' : 'outline'}>
                Item {item.itemNumber}: {item.percentCorrect === null ? '—' : `${item.percentCorrect}%`} ·{' '}
                {CALL_LABEL[item.call]}
              </Badge>
            ))}
          </CardContent>
        </Card>

        {/* set up */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tomorrow's lesson</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Lesson title</Label>
              <Input value={nextLessonTitle} onChange={(e) => setNextLessonTitle(e.target.value)} />
            </div>
            <div>
              <Label>Date</Label>
              <Input value={nextLessonDate} onChange={(e) => setNextLessonDate(e.target.value)} />
            </div>
            <div>
              <Label>Unit / pacing context</Label>
              <Input
                value={unitContext}
                onChange={(e) => setUnitContext(e.target.value)}
                placeholder="e.g. Unit 1 Sequences — Day 8"
              />
            </div>
            <div>
              <Label>Standards (comma separated)</Label>
              <Input value={standards} onChange={(e) => setStandards(e.target.value)} placeholder="AII-F.IF.3, AII-F.BF.2" />
            </div>
            <div className="md:col-span-2">
              <Button onClick={generate} disabled={generating}>
                {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {draft ? 'Rebuild from these results' : "Build tomorrow's set"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {draft && (
          <>
            {unverifiedItems.length > 0 && (
              <Card className="border-destructive">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    {unverifiedItems.length} item{unverifiedItems.length === 1 ? '' : 's'} not checked
                  </CardTitle>
                  <CardDescription>
                    Nothing downloads until every answer checks out. Fix the answer, or rebuild.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {unverifiedItems.map((item) => (
                    <p key={`${item.itemNumber}-${item.prompt.slice(0, 10)}`}>
                      Item {item.itemNumber}: {item.verifyNote}
                    </p>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* downloads */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Download className="h-4 w-4" />
                  Downloads
                </CardTitle>
                <CardDescription>
                  {draft.builtFrom.className} · {draft.builtFrom.worksheetCode} ·{' '}
                  {draft.builtFrom.worksheetDate
                    ? format(new Date(draft.builtFrom.worksheetDate), 'MMM d, yyyy')
                    : 'undated'}{' '}
                  · {draft.builtFrom.papers} paper{draft.builtFrom.papers === 1 ? '' : 's'}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <Button variant="outline" disabled={busyFile === 'lp'} onClick={() => run('lp', () => lessonPlanPdf(draft))}>
                  <FileText className="mr-2 h-4 w-4" /> Lesson plan (PDF)
                </Button>
                <Button variant="outline" disabled={busyFile === 'lpd'} onClick={() => run('lpd', () => lessonPlanDocx(draft))}>
                  <FileText className="mr-2 h-4 w-4" /> Lesson plan (.docx)
                </Button>
                <Button variant="outline" disabled={busyFile === 'ppt'} onClick={() => run('ppt', () => presentationPptx(draft))}>
                  <Presentation className="mr-2 h-4 w-4" /> Presentation (.pptx)
                </Button>
                <Button variant="outline" disabled={busyFile === 'pptp'} onClick={() => run('pptp', () => presentationPdf(draft))}>
                  <Presentation className="mr-2 h-4 w-4" /> Presentation (PDF)
                </Button>
                <Button variant="outline" disabled={busyFile === 'ws'} onClick={() => run('ws', () => worksheetPdf(draft))}>
                  <FileText className="mr-2 h-4 w-4" /> Worksheet (PDF)
                </Button>
                <Button variant="outline" disabled={busyFile === 'wsd'} onClick={() => run('wsd', () => worksheetDocx(draft))}>
                  <FileText className="mr-2 h-4 w-4" /> Worksheet (.docx)
                </Button>
                <Button variant="outline" disabled={busyFile === 'ak'} onClick={() => run('ak', () => answerKeyPdf(draft))}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Answer key (PDF)
                </Button>
                <Button variant="outline" disabled={busyFile === 'akd'} onClick={() => run('akd', () => answerKeyDocx(draft))}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Answer key (.docx)
                </Button>
                <Button variant="outline" disabled={busyFile === 'et'} onClick={() => run('et', () => exitTicketPdf(draft))}>
                  <FileText className="mr-2 h-4 w-4" /> Exit ticket (PDF)
                </Button>
                <Button variant="outline" disabled={busyFile === 'etd'} onClick={() => run('etd', () => exitTicketDocx(draft))}>
                  <FileText className="mr-2 h-4 w-4" /> Exit ticket (.docx)
                </Button>
                <Button variant="outline" disabled={busyFile === 'etk'} onClick={() => run('etk', () => exitTicketKeyPdf(draft))}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Exit ticket key (PDF)
                </Button>
                <Button variant="outline" disabled={busyFile === 'wdw'} onClick={() => run('wdw', () => whoDoesWhichPptx(draft))}>
                  <Users className="mr-2 h-4 w-4" /> Who does which (.pptx)
                </Button>
                <Button variant="outline" disabled={busyFile === 'wdwp'} onClick={() => run('wdwp', () => whoDoesWhichPdf(draft))}>
                  <Users className="mr-2 h-4 w-4" /> Who does which (PDF)
                </Button>
                <Button variant="outline" disabled={busyFile === 'tl'} onClick={() => run('tl', () => teacherListPdf(draft))}>
                  <Users className="mr-2 h-4 w-4" /> Teacher list (PDF)
                </Button>
                <Button variant="outline" disabled={busyFile === 'tld'} onClick={() => run('tld', () => teacherListDocx(draft))}>
                  <Users className="mr-2 h-4 w-4" /> Teacher list (.docx)
                </Button>
                <Button disabled={busyFile === 'zip'} onClick={() => run('zip', () => zipAll(draft))}>
                  {busyFile === 'zip' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Package className="mr-2 h-4 w-4" />}
                  Download all (zip)
                </Button>
              </CardContent>
            </Card>

            {/* editable draft */}
            <Tabs defaultValue="plan">
              <TabsList className="flex flex-wrap">
                <TabsTrigger value="plan">Lesson plan</TabsTrigger>
                <TabsTrigger value="slides">Slides ({draft.slides.length})</TabsTrigger>
                <TabsTrigger value="worksheet">Worksheet ({draft.worksheet.items.length})</TabsTrigger>
                <TabsTrigger value="exit">Exit ticket ({draft.exitTicket.items.length})</TabsTrigger>
                <TabsTrigger value="groups">Who does which</TabsTrigger>
              </TabsList>

              <TabsContent value="plan" className="space-y-3 pt-4">
                <Card>
                  <CardContent className="space-y-3 pt-6">
                    <div>
                      <Label>Title</Label>
                      <Input
                        value={draft.lessonPlan.title}
                        onChange={(e) =>
                          setDraft({ ...draft, lessonPlan: { ...draft.lessonPlan, title: e.target.value } })
                        }
                      />
                    </div>
                    <div>
                      <Label>Aim</Label>
                      <Textarea
                        value={draft.lessonPlan.aim}
                        onChange={(e) =>
                          setDraft({ ...draft, lessonPlan: { ...draft.lessonPlan, aim: e.target.value } })
                        }
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <Label>Standards</Label>
                        <Input
                          value={draft.lessonPlan.standards.join(', ')}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              lessonPlan: {
                                ...draft.lessonPlan,
                                standards: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                              },
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label>Minutes</Label>
                        <Input
                          type="number"
                          value={draft.lessonPlan.durationMinutes}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              lessonPlan: { ...draft.lessonPlan, durationMinutes: Number(e.target.value) || 45 },
                            })
                          }
                        />
                      </div>
                    </div>
                    <Separator />
                    <p className="text-sm font-semibold">Period at a glance</p>
                    {draft.lessonPlan.timeline.map((step, index) => (
                      <div key={index} className="grid gap-2 md:grid-cols-[80px_200px_1fr]">
                        <Input
                          type="number"
                          value={step.minutes}
                          onChange={(e) => {
                            const timeline = draft.lessonPlan.timeline.slice();
                            timeline[index] = { ...step, minutes: Number(e.target.value) || 0 };
                            setDraft({ ...draft, lessonPlan: { ...draft.lessonPlan, timeline } });
                          }}
                        />
                        <Input
                          value={step.label}
                          onChange={(e) => {
                            const timeline = draft.lessonPlan.timeline.slice();
                            timeline[index] = { ...step, label: e.target.value };
                            setDraft({ ...draft, lessonPlan: { ...draft.lessonPlan, timeline } });
                          }}
                        />
                        <Textarea
                          rows={2}
                          value={step.detail}
                          onChange={(e) => {
                            const timeline = draft.lessonPlan.timeline.slice();
                            timeline[index] = { ...step, detail: e.target.value };
                            setDraft({ ...draft, lessonPlan: { ...draft.lessonPlan, timeline } });
                          }}
                        />
                      </div>
                    ))}
                    <Separator />
                    <p className="text-sm font-semibold">Reteach</p>
                    <Textarea
                      rows={2}
                      value={draft.lessonPlan.reteach.summary}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          lessonPlan: {
                            ...draft.lessonPlan,
                            reteach: { ...draft.lessonPlan.reteach, summary: e.target.value },
                          },
                        })
                      }
                    />
                    {draft.lessonPlan.reteach.items.map((item, index) => (
                      <div key={index} className="rounded-lg border p-3 text-sm">
                        <p className="font-medium">
                          Item {item.itemNumber} — {item.percentCorrect ?? 0}% correct
                          {item.skillTag ? ` (${item.skillTag})` : ''}
                        </p>
                        {item.wrongAnswersQuoted?.length > 0 && (
                          <p className="text-muted-foreground">
                            They wrote: {item.wrongAnswersQuoted.map((a) => `“${a}”`).join(', ')}
                          </p>
                        )}
                        <Textarea
                          className="mt-2"
                          rows={2}
                          value={item.howToRepair}
                          onChange={(e) => {
                            const items = draft.lessonPlan.reteach.items.slice();
                            items[index] = { ...item, howToRepair: e.target.value };
                            setDraft({
                              ...draft,
                              lessonPlan: { ...draft.lessonPlan, reteach: { ...draft.lessonPlan.reteach, items } },
                            });
                          }}
                        />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="slides" className="space-y-3 pt-4">
                {draft.slides.map((slide, index) => (
                  <Card key={index}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{slide.kind}</Badge>
                        <span className="text-xs text-muted-foreground">Slide {slide.slideNumber}</span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Input value={slide.title} onChange={(e) => patchSlide(index, { title: e.target.value })} />
                      <Textarea
                        rows={Math.min(8, Math.max(3, slide.bullets.length + 1))}
                        value={slide.bullets.join('\n')}
                        onChange={(e) => patchSlide(index, { bullets: e.target.value.split('\n') })}
                      />
                      <div>
                        <Label className="text-xs">Speaker notes</Label>
                        <Textarea
                          rows={3}
                          value={slide.speakerNotes}
                          onChange={(e) => patchSlide(index, { speakerNotes: e.target.value })}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="worksheet" className="space-y-3 pt-4">
                <Card>
                  <CardContent className="space-y-2 pt-6">
                    <Label>Worksheet title</Label>
                    <Input
                      value={draft.worksheet.title}
                      onChange={(e) => setDraft({ ...draft, worksheet: { ...draft.worksheet, title: e.target.value } })}
                    />
                    <Label>Instructions</Label>
                    <Textarea
                      rows={2}
                      value={draft.worksheet.instructions}
                      onChange={(e) =>
                        setDraft({ ...draft, worksheet: { ...draft.worksheet, instructions: e.target.value } })
                      }
                    />
                  </CardContent>
                </Card>
                {draft.worksheet.items.map((item, index) => (
                  <Card key={index} className={item.verified ? '' : 'border-destructive'}>
                    <CardContent className="space-y-2 pt-6">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Item {item.itemNumber}</Badge>
                        {item.isRepair && <Badge variant="secondary">repair item</Badge>}
                        {item.verified ? (
                          <Badge className="bg-emerald-600">checked: {item.verifyNote}</Badge>
                        ) : (
                          <Badge variant="destructive">not checked: {item.verifyNote}</Badge>
                        )}
                      </div>
                      <Textarea
                        rows={2}
                        value={item.prompt}
                        onChange={(e) => patchWorksheetItem(index, { prompt: e.target.value })}
                      />
                      <div className="grid gap-2 md:grid-cols-3">
                        <div>
                          <Label className="text-xs">Answer (as written)</Label>
                          <Input value={item.answer} onChange={(e) => patchWorksheetItem(index, { answer: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-xs">Numeric answer</Label>
                          <Input
                            type="number"
                            value={item.answerNumeric ?? ''}
                            onChange={(e) =>
                              patchWorksheetItem(index, {
                                answerNumeric: e.target.value === '' ? null : Number(e.target.value),
                                verifyExpected: e.target.value === '' ? null : Number(e.target.value),
                              })
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Check (arithmetic)</Label>
                          <Input value={item.verify} onChange={(e) => patchWorksheetItem(index, { verify: e.target.value })} />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">If wrong, record error tag</Label>
                        <Input
                          value={item.errorTagIfWrong}
                          onChange={(e) => patchWorksheetItem(index, { errorTagIfWrong: e.target.value })}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="exit" className="space-y-3 pt-4">
                {draft.exitTicket.items.map((item, index) => (
                  <Card key={index} className={item.verified ? '' : 'border-destructive'}>
                    <CardContent className="space-y-2 pt-6">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Question {item.itemNumber}</Badge>
                        <Badge variant="secondary">{item.skillTag || 'one skill'}</Badge>
                        {item.verified ? (
                          <Badge className="bg-emerald-600">checked</Badge>
                        ) : (
                          <Badge variant="destructive">{item.verifyNote}</Badge>
                        )}
                      </div>
                      <Textarea rows={2} value={item.prompt} onChange={(e) => patchExitItem(index, { prompt: e.target.value })} />
                      <div className="grid gap-2 md:grid-cols-3">
                        <Input value={item.answer} onChange={(e) => patchExitItem(index, { answer: e.target.value })} />
                        <Input
                          type="number"
                          value={item.answerNumeric ?? ''}
                          onChange={(e) =>
                            patchExitItem(index, {
                              answerNumeric: e.target.value === '' ? null : Number(e.target.value),
                              verifyExpected: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                        />
                        <Input value={item.verify} onChange={(e) => patchExitItem(index, { verify: e.target.value })} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="groups" className="space-y-3 pt-4">
                {draft.grouping.groups.map((group) => (
                  <Card key={group.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{group.label}</CardTitle>
                      <CardDescription>
                        Problems {group.itemNumbers.join(', ')} · check total {group.checkTotal} ·{' '}
                        {group.students.length} student{group.students.length === 1 ? '' : 's'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                      {group.students.map((student) => (
                        <div key={student.studentId} className="rounded border px-2 py-1">
                          <span className="font-medium">{student.name}</span>
                          <span className="text-muted-foreground"> — {student.evidence}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">No results yet</CardTitle>
                    <CardDescription>
                      These students have nothing scored yet, or their paper is still unclaimed — they are never guessed
                      into a group.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    {draft.grouping.noResultsYet.length === 0 ? (
                      <p className="text-muted-foreground">Everyone has results.</p>
                    ) : (
                      draft.grouping.noResultsYet.map((s) => (
                        <div key={s.studentId} className="rounded border px-2 py-1">{s.name}</div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* send */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Send</CardTitle>
                <CardDescription>
                  Nothing has gone to students or back to Scholar. Press send when the draft is how you want it.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={unverifiedItems.length > 0 || saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const { data: auth } = await supabase.auth.getUser();
                      const { error } = await supabase.from('lesson_packs' as any).upsert(
                        {
                          teacher_id: auth.user!.id,
                          class_id: id!,
                          pack_date: isoDate(nextSchoolDay(new Date())),
                          status: 'ready',
                          lesson_title: draft.nextLessonTitle,
                          source_worksheet_code: draft.builtFrom.worksheetCode,
                          source_worksheet_title: draft.builtFrom.worksheetTitle,
                          source_worksheet_date: draft.builtFrom.worksheetDate
                            ? draft.builtFrom.worksheetDate.slice(0, 10)
                            : null,
                          papers: draft.builtFrom.papers,
                          student_count: draft.builtFrom.studentCount,
                          what_this_fixes: whatThisFixes(digest),
                          draft: draft as any,
                        },
                        { onConflict: 'teacher_id,class_id,pack_date' }
                      );
                      if (error) throw error;
                      toast.success("Saved to tomorrow's card on the home page.");
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : 'Could not save the pack.');
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Save to tomorrow's card
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button disabled={unverifiedItems.length > 0 || sent}>
                      <Send className="mr-2 h-4 w-4" />
                      {sent ? 'Marked as sent' : 'Send to students'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Send tomorrow's work?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This releases the worksheet and exit ticket for {className}. Until you confirm, nothing leaves
                        this screen.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep editing</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          setSent(true);
                          toast.success('Marked as sent — print the downloads for the room.');
                        }}
                      >
                        Send
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
