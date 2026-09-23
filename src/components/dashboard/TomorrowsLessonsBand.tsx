// =============================================================================
// TOMORROW'S LESSONS BAND
// =============================================================================
// The first thing on the home page: one card per class the teacher teaches,
// each holding the next school day's whole pack with its download buttons right
// on the card. A "Yesterday" strip underneath keeps the previous day's packs so
// nothing is lost if a lesson slides a day.
// Cards are honest: no results in -> says so and offers the calendar lesson
// only; still building -> says generating; already distributed -> says so
// instead of offering distribution again.
// =============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Monitor,
  Package,
  Pencil,
  Presentation,
  Printer,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { usePushToSisterApp } from '@/hooks/usePushToSisterApp';
import { useLessonPacks, type LessonPackRow, type TaughtClass } from '@/hooks/useLessonPacks';
import { positionFor } from '@/data/pacingCalendars';
import type { NextDayDraft } from '@/lib/nextDayLesson/types';
import { lessonDeckSlideCount } from '@/lib/nextDayLesson/hillcrestArtifacts';
import {
  answerKeyPdf,
  calendarLessonPdf,
  download,
  exitTicketPdf,
  lessonPlanPdf,
  openInNewTab,
  presentationPptx,
  printPackPdf,
  teacherListPdf,
  whoDoesWhichPptx,
  worksheetPdf,
  zipAll,
  type ExportFile,
} from '@/lib/nextDayLesson/exporters';

const dayLabel = (iso: string) => format(new Date(`${iso}T12:00:00`), 'EEE MMM d');
const timeLabel = (iso?: string | null) => (iso ? format(new Date(iso), 'h:mm a') : '');
const isToday = (iso?: string | null) => !!iso && new Date(iso).toDateString() === new Date().toDateString();

function PackCard({
  klass,
  packDate,
  pack,
  compact,
}: {
  klass: TaughtClass;
  packDate: string;
  pack: LessonPackRow | null;
  compact?: boolean;
}) {
  const { build, recordDistribution } = useLessonPacks();
  const { pushToSisterApp } = usePushToSisterApp();
  const position = positionFor(klass.join_code, klass.name, packDate);
  const [titleDraft, setTitleDraft] = useState(position.title || '');
  const [busy, setBusy] = useState<string | null>(null);
  const [distributing, setDistributing] = useState(false);

  const draft = (pack?.draft || null) as NextDayDraft | null;
  const status = pack?.status ?? null;
  const distributedToday = status === 'distributed' && isToday(pack?.distributed_at);

  const runFile = async (key: string, factory: () => Promise<ExportFile> | ExportFile) => {
    setBusy(key);
    try {
      download(await factory());
    } catch (error) {
      console.error(error);
      toast.error('That file could not be built.');
    } finally {
      setBusy(null);
    }
  };

  const buildPack = () => {
    build.mutate(
      { klass, packDate, lessonTitleOverride: titleDraft || undefined },
      {
        onSuccess: () => toast.success(`${klass.name}: pack ready.`),
        onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not build the pack.'),
      }
    );
  };

  const distribute = async () => {
    if (!draft || !pack) return;
    setDistributing(true);
    const record: LessonPackRow['distribution'] = {};
    try {
      // 1. print-ready PDFs, one tab for the printer
      const opened = openInNewTab(printPackPdf(draft));
      if (opened) record.printedAt = new Date().toISOString();
      else toast.error('Your browser blocked the print tab — allow pop-ups, or download the worksheet instead.');

      // 2. the student-facing practice goes to Scholar for this class
      const questions = draft.worksheet.items.map((item) => ({
        question_number: item.itemNumber,
        prompt: item.prompt,
        answer: item.answer,
        skill_tag: item.skillTag,
      }));
      const { data: inserted, error: insertError } = await supabase
        .from('shared_assignments')
        .insert({
          teacher_id: pack.teacher_id,
          class_id: klass.id,
          title: draft.worksheet.title || draft.nextLessonTitle,
          description: `${draft.nextLessonTitle} — practice for ${draft.nextLessonDate}`,
          topics: [{ name: draft.nextLessonTitle, standards: draft.lessonPlan.standards }] as any,
          questions: questions as any,
          xp_reward: 20,
          coin_reward: 5,
          status: 'active',
          source_app: 'nycologic',
        })
        .select('id')
        .maybeSingle();
      if (insertError) throw insertError;

      const push = await pushToSisterApp({
        class_id: klass.id,
        class_name: klass.name,
        title: draft.worksheet.title || draft.nextLessonTitle,
        description: `Practice for ${draft.nextLessonDate}`,
        topic_name: draft.nextLessonTitle,
        standard_code: draft.lessonPlan.standards[0],
        questions,
        xp_reward: 20,
        coin_reward: 5,
        type: 'assignment_push',
        source: 'assignment_push',
      });
      if (push.success) {
        record.scholarPushedAt = new Date().toISOString();
        record.scholarNote = `Practice released to ${klass.name}${inserted?.id ? '' : ''}`;
      } else {
        record.scholarNote = `Scholar did not accept the practice: ${push.error}`;
        toast.error(`Scholar push failed: ${push.error}`);
      }

      // 3. the who-does-which deck, ready for the board
      download(await whoDoesWhichPptx(draft));
      record.boardReadyAt = new Date().toISOString();

      await recordDistribution.mutateAsync({ packId: pack.id, distribution: record });
      toast.success(`${klass.name}: distributed.`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Distribution did not complete.');
    } finally {
      setDistributing(false);
    }
  };

  const heading = (
    <CardHeader className={compact ? 'pb-2' : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className={compact ? 'text-sm' : 'text-base'}>
            {klass.name}
            {klass.class_period ? ` · Period ${klass.class_period}` : ''}
          </CardTitle>
          <CardDescription className="text-xs">
            {dayLabel(packDate)}
            {pack?.day_number || position.dayNumber ? ` · Day ${pack?.day_number ?? position.dayNumber}` : ' · day not set'}
            {' · '}
            {pack?.lesson_title || position.title || 'lesson title not set yet'}
          </CardDescription>
        </div>
        {status === 'generating' && (
          <Badge variant="outline" className="gap-1 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" /> generating
          </Badge>
        )}
        {status === 'ready' && <Badge className="bg-emerald-600 text-xs">pack ready</Badge>}
        {status === 'distributed' && (
          <Badge variant="secondary" className="text-xs">
            {distributedToday ? 'distributed today' : 'distributed'}
          </Badge>
        )}
        {status === 'calendar_only' && (
          <Badge variant="outline" className="text-xs">
            no results in
          </Badge>
        )}
        {status === 'failed' && (
          <Badge variant="destructive" className="text-xs">
            build failed
          </Badge>
        )}
      </div>
    </CardHeader>
  );

  return (
    <Card className={compact ? 'bg-muted/30' : undefined}>
      {heading}
      <CardContent className="space-y-3">
        {/* built from / honesty line */}
        {status === 'ready' || status === 'distributed' ? (
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              Built from {pack!.papers} paper{pack!.papers === 1 ? '' : 's'} from {pack!.student_count} student
              {pack!.student_count === 1 ? '' : 's'} · {pack!.source_worksheet_title} ({pack!.source_worksheet_code})
              {pack!.source_worksheet_date ? ` · ${dayLabel(pack!.source_worksheet_date)}` : ''}
            </p>
            {pack!.what_this_fixes && <p className="text-foreground">{pack!.what_this_fixes}</p>}
          </div>
        ) : status === 'calendar_only' ? (
          <p className="text-xs text-muted-foreground">
            No scored results have come in for this class, so there is nothing to build from. The plain calendar lesson
            is here — no numbers are invented.
          </p>
        ) : status === 'failed' ? (
          <p className="text-xs text-destructive">{pack?.error_message}</p>
        ) : status === 'generating' ? (
          <p className="text-xs text-muted-foreground">Building the pack from this class's results…</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Not built yet. It will be built only from results this class has actually sent in.
          </p>
        )}

        {/* the generated numbers, straight on the card */}
        {draft && (
          <div className="space-y-1.5 rounded-md border bg-muted/40 p-2 text-xs">
            {draft.lessonPlan.reteach.items.length > 0 && (
              <p className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground">Items repaired:</span>
                {draft.lessonPlan.reteach.items.map((item) => (
                  <Badge key={item.itemNumber} variant="outline" className="text-[11px]">
                    #{item.itemNumber}
                    {item.percentCorrect !== null && item.percentCorrect !== undefined ? ` · ${item.percentCorrect}%` : ''}
                  </Badge>
                ))}
              </p>
            )}
            <p className="text-muted-foreground">
              {draft.worksheet.items.length} worksheet questions (every answer checked) · each student works{' '}
              {draft.grouping.itemsPerStudent} · {draft.exitTicket.items.length}-question exit ticket ·{' '}
              {lessonDeckSlideCount(draft)} slides (last two teacher-reference)
            </p>
            <p className="flex flex-wrap gap-x-3 gap-y-1">
              {draft.grouping.groups.map((group) => (
                <span key={group.id}>
                  <span className="font-medium">{group.label}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    — {group.students.length} student{group.students.length === 1 ? '' : 's'} · items{' '}
                    {group.itemNumbers.join(', ')} · check {group.checkTotal}
                  </span>
                </span>
              ))}
            </p>
            {draft.grouping.noResultsYet.length > 0 && (
              <p className="text-muted-foreground">
                {draft.grouping.noResultsYet.length} student
                {draft.grouping.noResultsYet.length === 1 ? '' : 's'} with no results for this assignment yet — on the
                final slide, unassigned.
              </p>
            )}
          </div>
        )}

        {/* title when the calendar has none */}
        {!pack?.lesson_title && !position.title && (
          <Input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            placeholder="Lesson title for this day"
            className="h-8 text-xs"
          />
        )}

        {/* downloads, right on the card */}
        {draft && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy === 'lp'} onClick={() => runFile('lp', () => lessonPlanPdf(draft))}>
              <FileText className="mr-1.5 h-3.5 w-3.5" /> Lesson plan
            </Button>
            <Button size="sm" variant="outline" disabled={busy === 'ppt'} onClick={() => runFile('ppt', () => presentationPptx(draft))}>
              <Presentation className="mr-1.5 h-3.5 w-3.5" /> Presentation (.pptx)
            </Button>
            <Button size="sm" variant="outline" disabled={busy === 'ws'} onClick={() => runFile('ws', () => worksheetPdf(draft))}>
              <FileText className="mr-1.5 h-3.5 w-3.5" /> Worksheet
            </Button>
            <Button size="sm" variant="outline" disabled={busy === 'ak'} onClick={() => runFile('ak', () => answerKeyPdf(draft))}>
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Answer key
            </Button>
            <Button size="sm" variant="outline" disabled={busy === 'et'} onClick={() => runFile('et', () => exitTicketPdf(draft))}>
              <FileText className="mr-1.5 h-3.5 w-3.5" /> Exit ticket
            </Button>
            <Button size="sm" variant="outline" disabled={busy === 'wdw'} onClick={() => runFile('wdw', () => whoDoesWhichPptx(draft))}>
              <Users className="mr-1.5 h-3.5 w-3.5" /> Who does which (.pptx)
            </Button>
            <Button size="sm" variant="outline" disabled={busy === 'tl'} onClick={() => runFile('tl', () => teacherListPdf(draft))}>
              <Users className="mr-1.5 h-3.5 w-3.5" /> Teacher list
            </Button>
            <Button size="sm" disabled={busy === 'zip'} onClick={() => runFile('zip', () => zipAll(draft))}>
              {busy === 'zip' ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Package className="mr-1.5 h-3.5 w-3.5" />
              )}
              Download all (zip)
            </Button>
          </div>
        )}

        {status === 'calendar_only' && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy === 'cal'}
            onClick={() =>
              runFile('cal', () =>
                calendarLessonPdf({
                  className: klass.name,
                  dateLabel: dayLabel(packDate),
                  dayNumber: pack?.day_number ?? position.dayNumber,
                  title: pack?.lesson_title || titleDraft || position.title || `${klass.name} — next lesson`,
                  unitLabel: position.unitLabel,
                  standards: position.standards,
                })
              )
            }
          >
            <CalendarDays className="mr-1.5 h-3.5 w-3.5" /> Calendar lesson (PDF)
          </Button>
        )}

        {/* actions */}
        <div className="flex flex-wrap items-center gap-2">
          {(!status || status === 'failed' || status === 'calendar_only' || status === 'ready') && (
            <Button size="sm" variant={status === 'ready' ? 'ghost' : 'default'} disabled={build.isPending} onClick={buildPack}>
              {build.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              {status === 'ready' ? 'Rebuild' : status === 'calendar_only' ? 'Check for results again' : 'Build pack'}
            </Button>
          )}

          {draft && (
            <Button size="sm" variant="ghost" asChild>
              <Link to={`/classes/${klass.id}/next-day-lesson?code=${encodeURIComponent(pack?.source_worksheet_code || '')}`}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
              </Link>
            </Button>
          )}

          {draft && !distributedToday && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" disabled={distributing}>
                  {distributing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                  Distribute
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Distribute {klass.name}'s pack?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This opens the print-ready pages in one tab for the printer, releases the practice to this class in
                    Scholar, and downloads the who-does-which deck for the board. Nothing has gone out yet.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep editing</AlertDialogCancel>
                  <AlertDialogAction onClick={distribute}>Distribute</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {/* what went where */}
        {status === 'distributed' && pack?.distribution && (
          <div className="space-y-1 rounded-md border bg-muted/40 p-2 text-xs">
            <p className="font-medium">
              {distributedToday
                ? 'Already distributed today — nothing is offered again.'
                : `Distributed ${pack.distributed_at ? format(new Date(pack.distributed_at), 'EEE MMM d') : ''}`}
            </p>
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Printer className="h-3.5 w-3.5" />
              {pack.distribution.printedAt ? `Print pages opened ${timeLabel(pack.distribution.printedAt)}` : 'Print tab did not open'}
            </p>
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Send className="h-3.5 w-3.5" />
              {pack.distribution.scholarPushedAt
                ? `Practice pushed to Scholar ${timeLabel(pack.distribution.scholarPushedAt)}`
                : pack.distribution.scholarNote || 'Practice not pushed'}
            </p>
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Monitor className="h-3.5 w-3.5" />
              {pack.distribution.boardReadyAt
                ? `Who-does-which deck ready for the board ${timeLabel(pack.distribution.boardReadyAt)}`
                : 'Board deck not prepared'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TomorrowsLessonsBand() {
  const { classes, packFor, dates, isLoading } = useLessonPacks();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading tomorrow's lessons…
        </CardContent>
      </Card>
    );
  }

  if (classes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            No classes yet
          </CardTitle>
          <CardDescription>Add a class and its roster, and tomorrow's lesson packs appear here.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Download className="h-5 w-5 text-primary" />
            Tomorrow's lessons
          </h2>
          <p className="text-sm text-muted-foreground">
            {format(new Date(`${dates.next}T12:00:00`), 'EEEE MMM d, yyyy')} · built from the results your classes have
            actually sent in
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {classes.map((klass) => (
          <PackCard key={klass.id} klass={klass} packDate={dates.next} pack={packFor(klass.id, dates.next)} />
        ))}
      </div>

      <div className="space-y-3 pt-2">
        <h3 className="text-sm font-semibold text-muted-foreground">
          Yesterday — {format(new Date(`${dates.previous}T12:00:00`), 'EEEE MMM d')} (kept in case a lesson slid a day)
        </h3>
        <div className="grid gap-3 lg:grid-cols-2">
          {classes.map((klass) => (
            <PackCard
              key={`prev-${klass.id}`}
              klass={klass}
              packDate={dates.previous}
              pack={packFor(klass.id, dates.previous)}
              compact
            />
          ))}
        </div>
      </div>
    </section>
  );
}
