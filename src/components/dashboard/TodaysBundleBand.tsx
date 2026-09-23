// =============================================================================
// TODAY'S BUNDLE — Day 7 Algebra II (Wed 23 Sep 2026)
// Front and centre on the home page: one card per Algebra II period with all
// seven files downloadable right on the card. Built around the pre-printed
// Worksheet 7 using Day 6 exit ticket results.
// =============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Download,
  FileText,
  Loader2,
  Package,
  Pencil,
  Presentation,
  Send,
  Users,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { NextDayDraft } from '@/lib/nextDayLesson/types';
import { lessonDeckSlideCount } from '@/lib/nextDayLesson/hillcrestArtifacts';
import { day7P5Draft, day7P9Draft } from '@/lib/nextDayLesson/day7Data';
import {
  answerKeyPdf,
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

const TODAY = '2026-09-23';

function Day7Card({ draft }: { draft: NextDayDraft }) {
  const [busy, setBusy] = useState<string | null>(null);

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

  const unmatched = draft.grouping.groups.flatMap((g) =>
    g.students.filter((s) => s.studentId.startsWith('unmatched'))
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              {draft.className}
            </CardTitle>
            <CardDescription className="text-xs">
              {format(new Date(`${TODAY}T12:00:00`), 'EEEE MMM d')} · Day {draft.dayNumber} · {draft.nextLessonTitle}
            </CardDescription>
          </div>
          <Badge className="bg-emerald-600 text-xs">pack ready</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            Built from {draft.builtFrom.papers} papers from {draft.builtFrom.studentCount} students · {draft.builtFrom.worksheetCode} ({draft.builtFrom.worksheetTitle})
          </p>
          <p className="text-foreground">
            Repairs recursive-rule writing — only 4 of 16 students wrote a complete recursive rule on Day 6.
          </p>
        </div>

        {/* generated numbers */}
        <div className="space-y-1.5 rounded-md border bg-muted/40 p-2 text-xs">
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground">Reteach:</span>
            {draft.lessonPlan.reteach.items.map((item) => (
              <Badge key={item.itemNumber} variant="outline" className="text-[11px]">
                #{item.itemNumber} · {item.percentCorrect}%
              </Badge>
            ))}
          </p>
          <p className="text-muted-foreground">
            {draft.worksheet.items.length} worksheet items (pre-printed, every answer checked) · each student works{' '}
            {draft.grouping.itemsPerStudent} · {draft.exitTicket.items.length}-question exit ticket (two forms) ·{' '}
            {lessonDeckSlideCount(draft)} slides (last two teacher-reference)
          </p>
          <p className="flex flex-wrap gap-x-3 gap-y-1">
            {draft.grouping.groups.map((group) => (
              <span key={group.id}>
                <span className="font-medium">{group.label}</span>
                <span className="text-muted-foreground">
                  {' '}— {group.students.length} student{group.students.length === 1 ? '' : 's'} · items{' '}
                  {group.itemNumbers.join(', ')} · check {group.checkTotal}
                </span>
              </span>
            ))}
          </p>
          {unmatched.length > 0 && (
            <p className="text-amber-600 dark:text-amber-400">
              {unmatched.length} name{unmatched.length === 1 ? '' : 's'} not matched to roster — confirm with teacher: {unmatched.map((s) => s.name).join(', ')}
            </p>
          )}
        </div>

        {/* downloads */}
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

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" asChild>
            <Link to={`/classes/${draft.classId}/next-day-lesson?code=ALG2-SEQ-D6-ET`}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
            </Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy === 'print'}
            onClick={async () => {
              setBusy('print');
              try {
                const opened = openInNewTab(printPackPdf(draft));
                if (!opened) toast.error('Allow pop-ups to open the print tab.');
              } catch {
                toast.error('Could not open print pages.');
              } finally {
                setBusy(null);
              }
            }}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" /> Print pack
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function TodaysBundleBand() {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Download className="h-5 w-5 text-primary" />
            Today's bundle — Day 7
          </h2>
          <p className="text-sm text-muted-foreground">
            Wednesday September 23, 2026 · Algebra II Periods 5 & 9 · built around the printed Worksheet 7
          </p>
        </div>
        <Badge variant="outline" className="gap-1 text-xs">
          <AlertTriangle className="h-3 w-3 text-amber-500" />
          Pre-printed worksheet — do not regenerate
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Day7Card draft={day7P5Draft} />
        <Day7Card draft={day7P9Draft} />
      </div>
    </section>
  );
}
